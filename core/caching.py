import hashlib
import json
import os
from pathlib import Path
from typing import Dict, Set

CACHE_DIR = ".cartographer_cache"

def get_file_hash(filepath: str) -> str:
    """Returns the SHA256 hash of a file."""
    hasher = hashlib.sha256()
    with open(filepath, 'rb') as f:
        buf = f.read(65536)
        while len(buf) > 0:
            hasher.update(buf)
            buf = f.read(65536)
    return hasher.hexdigest()

class CacheManager:
    def __init__(self, target_dir: str):
        self.target_dir = str(target_dir)
        self.cache_dir = os.path.join(self.target_dir, CACHE_DIR)
        self.hashes_file = os.path.join(self.cache_dir, "file_hashes.json")
        
        os.makedirs(self.cache_dir, exist_ok=True)
        self.file_hashes: Dict[str, str] = self._load_hashes()
        
    def _load_hashes(self) -> Dict[str, str]:
        if os.path.exists(self.hashes_file):
            try:
                with open(self.hashes_file, 'r') as f:
                    return json.load(f)
            except json.JSONDecodeError:
                return {}
        return {}
        
    def save_hashes(self):
        with open(self.hashes_file, 'w') as f:
            json.dump(self.file_hashes, f, indent=4)
            
    def get_source_files(self) -> list[str]:
        """Return all source files for supported languages (.py, .js, .jsx, .ts, .tsx)."""
        from core.schema import SUPPORTED_EXTENSIONS
        found = []
        ignore_dirs = {'.venv', 'venv', 'node_modules', '.git', '.cartographer_cache', '.gemini', 'dist', 'build', '__pycache__'}
        for root, dirs, files in os.walk(self.target_dir):
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            for file in files:
                if any(file.endswith(ext) for ext in SUPPORTED_EXTENSIONS):
                    found.append(os.path.join(root, file))
        return found

    # Keep legacy alias so any older call-sites don't break immediately.
    def get_py_files(self) -> list[str]:
        return self.get_source_files()
            
    def get_changed_files(self) -> Set[str]:
        """Scans the directory and returns a list of files that have changed or are new."""
        changed_files = set()
        current_hashes = {}
        
        for file_str in self.get_py_files():
            file_hash = get_file_hash(file_str)
            current_hashes[file_str] = file_hash
            
            if file_str not in self.file_hashes or self.file_hashes[file_str] != file_hash:
                changed_files.add(file_str)
                
        # Update state
        self.file_hashes = current_hashes
        return changed_files
