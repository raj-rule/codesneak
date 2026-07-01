import os
import networkx as nx
from core.caching import CacheManager
from core.parser import CodeParser
from core.embeddings import SemanticIndexer
from core.resolver import link_network_boundaries
from networkx.readwrite import json_graph
import json

def run_pipeline(target_project_dir: str):
    print(f"Running pipeline on {target_project_dir}...")

    # 1. Init Cache
    cache = CacheManager(target_project_dir)
    changed_files = cache.get_changed_files()
    all_files = cache.get_source_files()           # ← now multi-language
    print(f"Found {len(all_files)} source files ({len(changed_files)} changed).")

    parser = CodeParser()

    # 2. Pass 1: Extract symbols
    print("Pass 1: Extracting symbols and building CONTAINS / DEFINES edges...")
    for filepath in all_files:
        parser.extract_symbols(filepath)

    print(f"Global Symbol Table has {len(parser.global_symbol_table)} entries.")

    # 3. Pass 2: Extract dependencies
    print("Pass 2: Resolving imports, CALLS, RENDERS, FETCHES edges...")
    for filepath in all_files:
        parser.extract_dependencies(filepath, target_project_dir)

    # 4. Pass 2.5: Component Unification
    print("Pass 2.5: Unifying file/component nodes...")
    parser.unify_components()

    # 5. Pass 3: Cross-Boundary Resolution (API_CALL ──► API_ROUTE)
    print("Pass 3: Linking frontend API_CALLs to backend API_ROUTEs...")
    link_network_boundaries(parser.graph)

    # 6. Pass 4: Endpoint Consolidation
    print("Pass 4: Consolidating API endpoints...")
    parser.consolidate_endpoints()

    # 7. Semantic Embedding
    print("Pass 5: Semantic Indexing and Vector DB population...")
    indexer = SemanticIndexer(target_project_dir)
    indexer.index_graph(parser.graph)

    # 5. Serialize Graph
    data = json_graph.node_link_data(parser.graph)
    cache.save_hashes()

    output_path = os.path.join(cache.cache_dir, "graph.json")
    with open(output_path, "w") as f:
        json.dump(data, f, indent=2)

    print(f"\nGraph serialized to {output_path}")
    print(f"Total Nodes: {parser.graph.number_of_nodes()}")
    print(f"Total Edges: {parser.graph.number_of_edges()}")

    # Node-type breakdown
    from collections import Counter
    counts = Counter(d.get("type", "?") for _, d in parser.graph.nodes(data=True))
    for ntype, cnt in sorted(counts.items()):
        print(f"  {ntype}: {cnt}")

    print("\n--- Validation Test ---")
    query = "Where are sarcastic responses generated?"
    print(f"Querying ChromaDB for: '{query}'")
    results = indexer.search(query, n_results=1)
    
    if results['metadatas'] and len(results['metadatas'][0]) > 0:
        match_meta = results['metadatas'][0][0]
        node_id = match_meta['node_id']
        dist = results['distances'][0][0]
        print(f"Top Match Node ID: {node_id}")
        print(f"Distance: {dist}")
        
        # Prove the bridge
        graph_node = parser.graph.nodes[node_id]
        print(f"Graph Node Name: {graph_node.get('name')}")
        print(f"Graph Node Vector IDs: {graph_node.get('vector_ids')}")
    else:
        print("No matches found.")

if __name__ == "__main__":
    target = r"c:\Users\raj\OneDrive\Desktop\sarcastic bot"
    run_pipeline(target)
