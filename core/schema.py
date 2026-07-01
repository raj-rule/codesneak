"""
core/schema.py
==============
Universal Node Schema for the Codebase Cartographer graph engine.

This module defines the canonical types for every node and relationship that
can exist in the multi-language dependency graph.  It acts as the single
source of truth shared by the parser, the NetworkX graph builder, and the
FastAPI serialization layer.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Node Types
# ---------------------------------------------------------------------------

class NodeType(str, Enum):
    """
    Canonical set of node types emitted by the Universal Language Engine.

    Backend / Language-Agnostic
    ----------------------------
    FILE        — A source file on disk (any language).
    CLASS       — An OOP class definition (Python, TS, JS).
    FUNCTION    — A standalone function or method.

    Frontend / React-specific
    --------------------------
    COMPONENT   — A React component (function or class that returns JSX).
                  Detected by: JSX return value, PascalCase name, .jsx/.tsx extension.
    HOOK        — A React custom hook (function whose name starts with 'use').

    API Layer
    ---------
    API_ROUTE   — A server-side HTTP route handler.
                  Python: @app.get/post/… (FastAPI/Flask/Django).
                  JS/TS:  app.get/post/… (Express).
    API_CALL    — A client-side fetch / axios call that hits an external endpoint.
                  Detected by: fetch(), axios.get/post/…, useSWR(), useQuery() etc.
    """
    FILE      = "FILE"
    CLASS     = "CLASS"
    FUNCTION  = "FUNCTION"
    COMPONENT = "COMPONENT"
    HOOK      = "HOOK"
    API_ROUTE = "API_ROUTE"
    API_CALL  = "API_CALL"
    API_ENDPOINT = "API_ENDPOINT"
    DATABASE_TABLE = "DATABASE_TABLE"


# ---------------------------------------------------------------------------
# Edge Types
# ---------------------------------------------------------------------------

class EdgeType(str, Enum):
    """
    Canonical set of directed edge relationships in the dependency graph.

    Structural
    ----------
    CONTAINS    — Parent node contains child node (file → class/function, etc.).

    Dependency
    ----------
    IMPORTS     — A file/module imports another file/module.
    CALLS       — A symbol directly invokes another symbol.
    RENDERS     — A React component renders another component.
    USES_HOOK   — A component or hook calls a custom hook.
    FETCHES     — A client-side node makes an HTTP call to an API_ROUTE or URL.
    DEFINES     — A file registers / defines an API_ROUTE.
    """
    CONTAINS         = "CONTAINS"
    IMPORTS          = "IMPORTS"
    CALLS            = "CALLS"
    RENDERS          = "RENDERS"
    USES_HOOK        = "USES_HOOK"
    FETCHES          = "FETCHES"
    DEFINES          = "DEFINES"
    NETWORK_REQUEST  = "NETWORK_REQUEST"   # API_CALL ──► API_ROUTE (cross-boundary)
    FOREIGN_KEY      = "FOREIGN_KEY"


# ---------------------------------------------------------------------------
# Node Data Models
# ---------------------------------------------------------------------------

class BaseNodeData(BaseModel):
    """Fields present on every node regardless of type."""
    node_id: str = Field(..., description="Globally unique identifier for this node.")
    node_type: NodeType
    name: str
    path: str = Field(..., description="Absolute path to the source file containing this symbol.")
    source: Optional[str] = Field(None, description="Raw source code snippet for this symbol.")
    language: Optional[str] = Field(None, description="Source language: 'python' | 'javascript' | 'typescript' | 'tsx'.")
    vector_ids: Optional[List[str]] = Field(default_factory=list, description="ChromaDB vector IDs for semantic search.")

    # Extra metadata bucket — avoids model explosion for minor per-type fields.
    meta: Dict[str, Any] = Field(default_factory=dict)


class FileNode(BaseNodeData):
    node_type: NodeType = NodeType.FILE
    name: str = Field(..., description="Filename (basename).")


class ClassNode(BaseNodeData):
    node_type: NodeType = NodeType.CLASS


class FunctionNode(BaseNodeData):
    node_type: NodeType = NodeType.FUNCTION
    is_async: bool = False


class ComponentNode(BaseNodeData):
    """
    React component — either a function component or a class extending React.Component.
    The parser sets meta['is_default_export'] = True if this is the default export of the file.
    """
    node_type: NodeType = NodeType.COMPONENT
    is_async: bool = False  # Server Components (Next.js) can be async


class HookNode(BaseNodeData):
    """
    Custom React hook — any function whose name starts with 'use' (lowercase).
    Convention: useMyHook, useFetch, useAuthContext, etc.
    """
    node_type: NodeType = NodeType.HOOK
    is_async: bool = False


class ApiRouteNode(BaseNodeData):
    """
    HTTP route handler registered on a server.
    meta fields:
      - http_method: str  ('GET', 'POST', 'PUT', 'DELETE', 'PATCH', …)
      - route_path: str   ('/api/users', '/items/{id}', etc.)
      - framework: str    ('fastapi', 'flask', 'express', …)
    """
    node_type: NodeType = NodeType.API_ROUTE


class ApiEndpointNode(BaseNodeData):
    """
    Consolidated API Endpoint Node.
    Combines multiple API_ROUTE nodes that share the same normalized endpoint.
    meta fields:
      - methods: List[str]  (['GET', 'POST', ...])
      - route_path: str
      - framework: str
    """
    node_type: NodeType = NodeType.API_ENDPOINT


class ApiCallNode(BaseNodeData):
    """
    Client-side HTTP call that reaches out to an external or internal endpoint.
    meta fields:
      - url_pattern: str  (static URL string or template literal if detectable)
      - http_method: str  ('GET', 'POST', …)
      - call_lib: str     ('fetch', 'axios', 'swr', 'react-query', …)
    """
    node_type: NodeType = NodeType.API_CALL


# ---------------------------------------------------------------------------
# Edge Data Model
# ---------------------------------------------------------------------------

class EdgeData(BaseModel):
    source: str
    target: str
    edge_type: EdgeType
    meta: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Graph Snapshot (serialization helper)
# ---------------------------------------------------------------------------

class GraphSnapshot(BaseModel):
    """
    Top-level schema for the graph.json artifact written to disk.
    Compatible with networkx.readwrite.json_graph.node_link_data output.
    """
    directed: bool = True
    multigraph: bool = False
    graph: Dict[str, Any] = Field(default_factory=dict)
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    links: List[Dict[str, Any]] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Language → File Extension Mapping (used by parser & cache manager)
# ---------------------------------------------------------------------------

EXTENSION_TO_LANGUAGE: Dict[str, str] = {
    ".py":  "python",
    ".js":  "javascript",
    ".jsx": "javascript",   # JSX is parsed by the JS grammar
    ".ts":  "typescript",
    ".tsx": "tsx",
    ".prisma": "prisma",
}

SUPPORTED_EXTENSIONS: tuple = tuple(EXTENSION_TO_LANGUAGE.keys())
