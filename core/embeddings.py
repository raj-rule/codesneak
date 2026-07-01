import os
import uuid
import chromadb
from chromadb.utils import embedding_functions
import tree_sitter_python as tspython
from tree_sitter import Language, Parser

class SemanticIndexer:
    def __init__(self, target_dir: str):
        self.target_dir = str(target_dir)
        self.db_path = os.path.join(self.target_dir, ".cartographer_cache", "chroma_db")
        
        # Initialize persistent client
        self.chroma_client = chromadb.PersistentClient(path=self.db_path)
        
        # Using default all-MiniLM-L6-v2 provided by Chroma
        self.ef = embedding_functions.DefaultEmbeddingFunction()
        self.collection = self.chroma_client.get_or_create_collection(
            name="codebase_vectors", 
            embedding_function=self.ef
        )
        
        self.PY_LANGUAGE = Language(tspython.language())
        self.parser = Parser(self.PY_LANGUAGE)
        
    def chunk_code(self, source_code: str, node_type: str) -> list[str]:
        """AST-Aware chunker. Uses tree-sitter to slice logically."""
        if len(source_code) < 2000:
            return [source_code]
            
        tree = self.parser.parse(bytes(source_code, "utf8"))
        root_node = tree.root_node
        
        chunks = []
        
        def extract_body(node):
            if node.type in ['class_definition', 'function_definition']:
                body_node = node.child_by_field_name('body')
                if body_node:
                    for child in body_node.children:
                        chunks.append(source_code[child.start_byte:child.end_byte])
            else:
                for child in node.children:
                    extract_body(child)

        extract_body(root_node)
        
        # fallback if parsing didn't yield chunks
        if not chunks:
            for i in range(0, len(source_code), 2000):
                chunks.append(source_code[i:i+2000])
                
        # Group small chunks to maximize context up to 2000 chars
        grouped_chunks = []
        current_chunk = ""
        for c in chunks:
            if len(current_chunk) + len(c) < 2000:
                current_chunk += "\n" + c if current_chunk else c
            else:
                if current_chunk:
                    # if a single piece is massive, split it naively
                    if len(current_chunk) > 2000:
                        for i in range(0, len(current_chunk), 2000):
                            grouped_chunks.append(current_chunk[i:i+2000].strip())
                    else:
                        grouped_chunks.append(current_chunk.strip())
                current_chunk = c
                
        if current_chunk:
            if len(current_chunk) > 2000:
                for i in range(0, len(current_chunk), 2000):
                    grouped_chunks.append(current_chunk[i:i+2000].strip())
            else:
                grouped_chunks.append(current_chunk.strip())
            
        return grouped_chunks

    def index_graph(self, graph):
        """Iterates over the NetworkX graph, embeds nodes, updates graph with vector IDs."""
        for node_id, data in graph.nodes(data=True):
            try:
                if data.get('type') in ['class', 'function', 'COMPONENT', 'HOOK', 'API_ROUTE']:
                    source_code = data.get('source') or data.get('content') or data.get('source_code') or ""
                    
                    if not source_code.strip():
                        print(f"Skipping indexing for {node_id}: No text content.")
                        continue
                        
                    chunks = self.chunk_code(source_code, data.get('type'))
                    
                    vector_ids = []
                    for idx, chunk in enumerate(chunks):
                        if not chunk.strip():
                            continue
                        chunk_id = str(uuid.uuid4())
                        vector_ids.append(chunk_id)
                        
                        file_path = data.get('path', 'UNKNOWN_PATH')
                        name = data.get('name', '') or 'UNKNOWN_NAME'
                        
                        self.collection.upsert(
                            ids=[chunk_id],
                            documents=[chunk],
                            metadatas=[{"node_id": str(node_id), "chunk_index": idx, "name": str(name), "path": str(file_path)}]
                        )
                        
                    # Update Graph -> Vector binding
                    data['vector_ids'] = vector_ids
                    
            except Exception as e:
                # CRITICAL: Catch the error and print it, but DO NOT crash the server
                print(f"FAILED to index node {node_id}. Error: {str(e)}")
                continue

    def search(self, query: str, n_results=3):
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results
        )
        return results
