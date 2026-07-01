from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import networkx as nx
from networkx.readwrite import json_graph
import json
import os
import sys
import shutil
from pathlib import Path
import tkinter as tk
from tkinter import filedialog

# Add root directory to python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.embeddings import SemanticIndexer
from main import run_pipeline

TARGET_DIR = r"c:\Users\raj\OneDrive\Desktop\sarcastic bot"
CACHE_DIR = os.path.join(TARGET_DIR, ".cartographer_cache")
GRAPH_PATH = os.path.join(CACHE_DIR, "graph.json")

app = FastAPI(title="Codebase Cartographer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SearchQuery(BaseModel):
    query: str

class ProjectLoadRequest(BaseModel):
    path: str

# Global in-memory cache
_cached_graph = None
_cached_graph_path = None

def find_project_root(node_id: str) -> str:
    import urllib.parse
    clean_id = urllib.parse.unquote(node_id)
    # Extract file path part (everything before first ::)
    file_path = clean_id.split("::")[0]
    
    current = Path(file_path).resolve()
    # Climb up to find .cartographer_cache
    while current.parent != current:
        if (current / ".cartographer_cache" / "graph.json").exists():
            return str(current)
        current = current.parent
    return None

def load_graph(override_path=None):
    global _cached_graph, _cached_graph_path
    
    target_graph_path = override_path or GRAPH_PATH
    
    if not os.path.exists(target_graph_path):
        raise FileNotFoundError(f"Graph not found at {target_graph_path}. Run pipeline first.")
        
    # Return cached graph if path matches
    if _cached_graph is not None and _cached_graph_path == target_graph_path:
        return _cached_graph
        
    with open(target_graph_path, 'r') as f:
        data = json.load(f)
        
    _cached_graph = json_graph.node_link_graph(data, edges="links")
    _cached_graph_path = target_graph_path
    return _cached_graph

@app.post("/api/project/load")
def load_project(req: ProjectLoadRequest):
    global TARGET_DIR, CACHE_DIR, GRAPH_PATH
    
    path = str(Path(req.path).expanduser().resolve())
    if not os.path.isdir(path):
        raise HTTPException(status_code=400, detail=f"Directory does not exist: {path}")
        
    # State Reset (Critical): Wipe existing cache (Graph + ChromaDB) for clean ingestion
    new_cache_dir = os.path.join(path, ".cartographer_cache")
    if os.path.exists(new_cache_dir):
        try:
            shutil.rmtree(new_cache_dir, ignore_errors=True)
        except Exception as e:
            print(f"Warning: Could not completely remove cache dir: {e}")
            
    # Run AST Ingestion
    try:
        run_pipeline(path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")
        
    # Update active server state
    TARGET_DIR = path
    CACHE_DIR = new_cache_dir
    GRAPH_PATH = os.path.join(CACHE_DIR, "graph.json")
    
    # Invalidate cache
    global _cached_graph, _cached_graph_path
    _cached_graph = None
    _cached_graph_path = None
    
    basename = os.path.basename(os.path.normpath(path))
    if not basename:
        basename = path
        
    return {"success": True, "project_name": basename}

@app.get("/api/system/browse")
def browse_system():
    import subprocess
    import sys
    
    # Use a single-line command. Multi-line strings in Windows subprocess -c can fail silently.
    cmd = 'import tkinter as tk; root = tk.Tk(); root.withdraw(); root.attributes("-topmost", True); from tkinter import filedialog; print(filedialog.askdirectory(title="Select Codebase Directory"))'
    
    try:
        result = subprocess.run(
            [sys.executable, "-c", cmd],
            capture_output=True,
            text=True,
            check=True
        )
        selected_path = result.stdout.strip()
        return {"path": selected_path}
    except Exception as e:
        print(f"Browse dialog error: {e}")
        return {"path": ""}

@app.get("/api/graph")
def get_graph():
    if not os.path.exists(GRAPH_PATH):
        raise HTTPException(status_code=404, detail="Graph not built yet.")
    with open(GRAPH_PATH, 'r') as f:
        return json.load(f)

@app.post("/api/search")
def search(query: SearchQuery):
    indexer = SemanticIndexer(TARGET_DIR)
    results = indexer.search(query.query, n_results=5)
    
    node_ids = []
    if results['metadatas'] and len(results['metadatas'][0]) > 0:
        for meta in results['metadatas'][0]:
            node_ids.append(meta['node_id'])
            
    # Deduplicate keeping order
    seen = set()
    unique_nodes = [x for x in node_ids if not (x in seen or seen.add(x))]
    
    return {"results": unique_nodes}

@app.get("/api/trace")
def trace_node(node_id: str):
    print(f"--- INCOMING TRACE REQUEST: {node_id} ---")
    import urllib.parse
    decoded_id = urllib.parse.unquote(node_id)
    
    # Dynamically find the correct project graph based on the node's file path
    project_root = find_project_root(decoded_id)
    specific_graph_path = None
    if project_root:
        specific_graph_path = os.path.join(project_root, ".cartographer_cache", "graph.json")
        print(f"Discovered project root from node: {project_root}")
    
    try:
        graph = load_graph(override_path=specific_graph_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Graph not found. Run pipeline first.")
        
    # 1. Fully decode and normalize the incoming target
    target_raw = urllib.parse.unquote(node_id)
    target_clean = target_raw.lower().replace("\\", "/")
    
    matched_node = None
    
    # 2. Try fast exact matches first
    if node_id in graph.nodes:
        matched_node = node_id
    elif target_raw in graph.nodes:
        matched_node = target_raw
    else:
        # 3. Universal Fallback: Case-insensitive, slash-agnostic, substring match
        for n in graph.nodes:
            n_clean = str(n).lower().replace("\\", "/")
            # Check if one string is a subset of the other (handles absolute vs relative path mismatches)
            if n_clean == target_clean or n_clean.endswith(target_clean) or target_clean.endswith(n_clean):
                matched_node = n
                break
                
    # 4. Final Safety Net + Terminal Diagnostics
    if not matched_node:
        sample_nodes = [str(x).lower().replace("\\", "/") for x in list(graph.nodes)[:5]]
        print(f"\n!!! TRACE FAILURE !!!")
        print(f"Target sought: {target_clean}")
        print(f"Sample nodes in G: {sample_nodes}\n")
        raise HTTPException(status_code=404, detail=f"Node mismatch: {target_raw}")
        
    upstream = []
    for pred in graph.predecessors(matched_node):
        edge_data = graph.get_edge_data(pred, matched_node)
        upstream.append({"node": pred, "type": edge_data.get('type')})
        
    downstream = []
    for succ in graph.successors(matched_node):
        edge_data = graph.get_edge_data(matched_node, succ)
        downstream.append({"node": succ, "type": edge_data.get('type')})
        
    return {
        "node_id": matched_node,
        "upstream": upstream,
        "downstream": downstream
    }
