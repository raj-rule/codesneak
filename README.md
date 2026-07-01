# 🗺️ Codebase Cartographer

**Codebase Cartographer** is an advanced, multi-language codebase visualizer, analysis engine, and semantic search tool. It automatically parses code structures, extracts symbols, maps relationships, traces API calls across frontend-backend boundaries, extracts database schemas, and builds a comprehensive interactive dependency graph.

Through a high-fidelity React Flow dashboard, developers can explore their system's architecture, inspect code definitions, search their codebase using natural language (semantic search), and toggle between logical logic flows and database schema models.

---

## 🚀 Key Features Built

### 1. Universal Language Engine (`core/parser.py`)
*   **Multi-Language AST Parsing**: Replaced native regex/Python-AST parsing with **Tree-sitter** (`tree-sitter-python`, `tree-sitter-javascript`, `tree-sitter-typescript`), enabling uniform parsing of Python, JS, TS, and TSX in a single pipeline.
*   **Symbol Extraction**: Classifies code entities into canonical nodes: `FILE`, `CLASS`, `FUNCTION`, `COMPONENT`, `HOOK`, `API_ROUTE`, `API_CALL`, and `DATABASE_TABLE`.
*   **Relationship Mapping**: Draws semantic edges between nodes:
    *   `CONTAINS`: File containment of classes, functions, or tables.
    *   `IMPORTS`: File-to-file module imports.
    *   `CALLS`: Function and method invocations.
    *   `RENDERS`: JSX rendering relationships in React.
    *   `USES_HOOK`: Components or hooks calling custom hooks.
    *   `FETCHES`: Client-side HTTP requests.
*   **React Architecture Recognition**: Automatically classifies functions as React `COMPONENT`s (using PascalCase name checks and JSX return structures) and React custom `HOOK`s (detecting prefix `use`).

### 2. Database Schema Extractor (`core/parser.py`)
*   **Prisma Engine**: Parses `.prisma` schema files, extracting tables, column names/types, primary keys (`@id`), and foreign keys (`@relation`).
*   **Drizzle ORM Engine**: Implements a state-machine parser for TypeScript database schemas, extracting `pgTable`, `mysqlTable`, and `sqliteTable` definitions, including inline `.primaryKey()`, `.references()`, and relational declarations.
*   **Django & TypeORM Engines**: Extracts database fields, models, and decorators (e.g., `@Entity`, `@Column`, `@PrimaryColumn`) to map column-level properties and foreign key relationships.

### 3. Cross-Boundary API Resolver & Endpoint Consolidation (`core/resolver.py`)
*   **Boundary Compression**: Scans client-side API requests (`fetch`, `axios`, `useSWR`, `useQuery`) and matches them to server-side API routes (FastAPI, Flask, Express) using URL normalization.
*   **Direct Routing**: Replaces redundant intermediate `API_CALL` nodes with direct `NETWORK_REQUEST` edges connecting the calling frontend component/function straight to the backend route node.
*   **External Call Retention**: Keeps external API calls (e.g., Stripe, GitHub, Slack) as distinct nodes on the canvas.
*   **Endpoint Consolidation**: Consolidates duplicate API routes that share identical endpoints into unified `API_ENDPOINT` nodes.

### 4. Semantic Search & Code Embeddings (`core/embeddings.py`)
*   **AST-Aware Code Chunking**: Slices source code files using Tree-sitter at function and class body boundaries, generating logical code chunks up to 2000 characters.
*   **Vector Database Integration**: Interoperates with a persistent **ChromaDB** database using the `all-MiniLM-L6-v2` text embedding model.
*   **Interactive Search**: Integrates semantic lookup inside the UI, allowing developers to query their codebase using natural language (e.g., *"Where are sarcastic responses generated?"*) and immediately highlight matching graph nodes.

### 5. Incremental Caching & Serialization (`core/caching.py`, `main.py`)
*   **Change-Tracking**: Implements SHA256-based file hashing to scan directory contents and detect modified or newly added files.
*   **Performance Optimization**: Bypasses parsing for unchanged files, accelerating ingestion times.
*   **Graph Serialization**: Serializes the generated NetworkX graph into standard JSON format (`graph.json`) under the `.cartographer_cache` directory.

### 6. Interactive React Flow Canvas (`frontend/src/`)
*   **Logical vs. Data Toggle**: Renders two specialized views:
    *   **Logical View**: The complete structural syntax, imports, function calls, React components, and API routing.
    *   **Database View**: A dedicated schema map rendering only database tables, primary/foreign keys, fields, and schema links.
*   **Automated ELK Layout**: Uses `elkjs` (Eclipse Layout Kernel) to compute clean, overlap-free layouts, automatically wrapping directories inside nested, dotted bounding boxes (`FolderGroupNode`).
*   **Workspace Ingestion Manager**: A frontend switcher letting users specify a project directory path or launch a native Windows file explorer dialog (`tkinter` based) to load and index other codebases.
*   **Interactive Code Inspector**: Click nodes to trace upstream/downstream dependencies, preview raw source code, and inspect file attributes.
*   **Log Console**: A dark-themed terminal pane displaying system activities and semantic search rankings.

---

## 📂 Project Structure

```
codesneak/
├── api/
│   └── server.py          # FastAPI server endpoints (/api/graph, /api/search, /api/trace, etc.)
├── core/
│   ├── caching.py         # Incremental file hashing & cache manager
│   ├── embeddings.py      # ChromaDB client & tree-sitter AST code chunker
│   ├── parser.py          # Universal Tree-sitter symbol parser & schema detector
│   ├── resolver.py        # Cross-boundary API and route linker
│   └── schema.py          # Universal Pydantic data models for Nodes & Edges
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Main React workspace layout, sidebar, inspector & terminal
│   │   ├── GraphCanvas.jsx# React Flow canvas setup with ELK grouping & edge styles
│   │   ├── CustomNode.jsx # Styled node template mapping logic symbols
│   │   ├── DatabaseNode.jsx# Detailed table node rendering fields, PKs & FKs
│   │   ├── FolderGroupNode.jsx # Directory hierarchy bounding box
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   ├── package.json       # React / Vite configuration
│   └── vite.config.js
├── main.py                # Pipeline execution script (Passes 1-5 + ChromaDB indexing)
├── requirements.txt       # Backend dependencies (fastapi, chromadb, tree-sitter, etc.)
└── test_drizzle.py        # Drizzle parser sandbox script
```

---

## 🛠️ Tech Stack

### Backend
*   **Python 3.10+**
*   **FastAPI & Uvicorn** (REST endpoints & server runner)
*   **NetworkX** (Graph construction and operations)
*   **Tree-sitter** (Agnostic syntax tree analysis)
*   **ChromaDB** (Vector search database)
*   **Sentence-Transformers** (All-MiniLM-L6-v2 embedding model)
*   **Pydantic** (Data modeling & validation)
*   **Tkinter** (Subprocess file browser dialog)

### Frontend
*   **React 18**
*   **Vite** (Build system and Dev Server)
*   **React Flow** (`@xyflow/react` for node visualization)
*   **ELK.js** (`elkjs` for automated layout coordinates)
*   **Tailwind CSS** (Styling)
*   **Lucide React** (Icon library)

---

## 🏁 Getting Started

### 1. Ingest & Start the Backend
1. Create a virtual environment and activate it:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   ```
2. Install the python requirements:
   ```bash
   pip install -r requirements.txt
   ```
3. Start the FastAPI development server:
   ```bash
   uvicorn api.server:app --reload --port 8000
   ```

### 2. Start the React Frontend
1. Open a new terminal tab and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install node dependencies:
   ```bash
   npm install
   ```
3. Launch the Vite development server:
   ```bash
   npm run dev
   ```
4. Open the browser to [http://localhost:5173](http://localhost:5173).

---

## 🧭 How to Use
1. **Browse Workspace**: Use the project drop-down on the top left of the UI, click "Import Workspace", and click "Browse" to select any directory.
2. **Analyze Canvas**: Use scroll to zoom and drag to pan the dependency graph. Double-click directories to see nested details, or switch tabs between **Logical View** and **Database View**.
3. **Inspect Symbols**: Click on any class, component, hook, database table, or function to view its properties and source code in the right Inspector sidebar.
4. **Natural Language Search**: Enter a query in the search bar (e.g., *"How does the cache reload?"* or *"Where is the Prisma table defined?"*) and hit `Enter` to find matching code blocks instantly.
