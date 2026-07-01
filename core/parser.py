"""
core/parser.py
==============
Universal Language Engine — replaces the native Python `ast` module with
Tree-sitter so that Python, JavaScript, TypeScript, and TSX/React files can
all be analysed in a single, unified two-pass pipeline.

Pass 1 — extract_symbols():
    Walks the syntax tree and registers FILE, CLASS, FUNCTION, COMPONENT,
    HOOK, API_ROUTE nodes into the NetworkX graph, plus CONTAINS / DEFINES edges.

Pass 2 — extract_dependencies():
    Resolves import chains (IMPORTS), function/method calls (CALLS),
    JSX component renders (RENDERS), hook usage (USES_HOOK), and
    client-side HTTP calls (FETCHES).
"""

from __future__ import annotations

import os
import re
from typing import Optional

import networkx as nx

# ── Tree-sitter core ──────────────────────────────────────────────────────────
from tree_sitter import Language, Parser

import tree_sitter_python     as _ts_python
import tree_sitter_javascript as _ts_javascript
import tree_sitter_typescript as _ts_typescript   # provides .language_typescript() and .language_tsx()

# ── Universal schema ──────────────────────────────────────────────────────────
from core.schema import (
    NodeType, EdgeType,
    EXTENSION_TO_LANGUAGE, SUPPORTED_EXTENSIONS,
)

# ---------------------------------------------------------------------------
# Language registry
# ---------------------------------------------------------------------------

_LANGUAGES: dict[str, Language] = {
    "python":     Language(_ts_python.language()),
    "javascript": Language(_ts_javascript.language()),
    "typescript": Language(_ts_typescript.language_typescript()),
    "tsx":        Language(_ts_typescript.language_tsx()),
}

_PARSERS: dict[str, Parser] = {lang: Parser(lang_obj) for lang, lang_obj in _LANGUAGES.items()}


def _detect_language(filepath: str) -> Optional[str]:
    """Map a file extension to a Tree-sitter language key."""
    ext = os.path.splitext(filepath)[1].lower()
    return EXTENSION_TO_LANGUAGE.get(ext)


def parse_file(filepath: str):
    """
    Parse *filepath* with the correct Tree-sitter grammar.

    Returns
    -------
    (tree, code_bytes, language_key)  or  (None, None, None) if unsupported.
    """
    lang = _detect_language(filepath)
    if lang is None:
        return None, None, None
    with open(filepath, "rb") as fh:
        code = fh.read()
    if lang not in _PARSERS:
        return None, code, lang
    tree = _PARSERS[lang].parse(code)
    return tree, code, lang


# ---------------------------------------------------------------------------
# Helper sets used during classification
# ---------------------------------------------------------------------------

_FASTAPI_DECORATORS  = {"get", "post", "put", "delete", "patch", "head", "options", "route"}
_FLASK_DECORATORS    = {"route", "get", "post", "put", "delete", "patch"}
_EXPRESS_METHODS     = {"get", "post", "put", "delete", "patch", "all", "use"}

_CLIENT_FETCH_CALLEE = {"fetch", "axios", "useSWR", "useQuery", "useMutation", "$http"}
_AXIOS_METHODS       = {"get", "post", "put", "delete", "patch", "request"}

_REACT_LIFECYCLE     = {
    "componentDidMount", "componentDidUpdate", "componentWillUnmount",
    "render", "shouldComponentUpdate",
}


# ---------------------------------------------------------------------------
# Endpoint normalizer  (shared by Pass 1 metadata + the resolver in Pass 3)
# ---------------------------------------------------------------------------

# Matches dynamic path segments from all framework styles:
#   Python/FastAPI  : {user_id}  {item:path}
#   JS template lit : ${userId}
#   Express         : :userId
_VARIABLE_SEGMENT = re.compile(
    r"\$?\{[^}]+\}"         # ${…} or {…}
    r"|:[a-zA-Z_][\w]*"     # :param  (Express)
)


def normalize_endpoint(raw: str) -> str:
    """
    Strip dynamic path segments to produce a stable base string for
    cross-boundary matching between API_CALL and API_ROUTE nodes.

    Examples
    --------
    /api/users/{id}        -> /api/users
    /api/users/${userId}   -> /api/users
    /api/items/:itemId     -> /api/items
    /api/users             -> /api/users
    """
    if not raw:
        return ""
    # Drop query string / hash fragment
    raw = raw.split("?")[0].split("#")[0]
    # Strip http(s)://host:port prefix before normalising
    import re as _re
    origin_match = _re.match(r"https?://[^/]+(/.*)", raw, _re.IGNORECASE)
    if origin_match:
        raw = origin_match.group(1)
    # Collapse variable segments (keeps the surrounding slashes)
    normalized = _VARIABLE_SEGMENT.sub("", raw)
    # Collapse consecutive slashes
    normalized = re.sub(r"/+", "/", normalized)
    # Strip trailing slash unless root
    if normalized != "/":
        normalized = normalized.rstrip("/")
    return normalized.lower()


# ---------------------------------------------------------------------------
# Edge Priority System
# ---------------------------------------------------------------------------

EDGE_PRIORITY = {
    EdgeType.NETWORK_REQUEST.value: 80,
    EdgeType.FETCHES.value: 70,
    EdgeType.RENDERS.value: 60,
    EdgeType.CALLS.value: 50,
    EdgeType.USES_HOOK.value: 40,
    EdgeType.DEFINES.value: 30,
    EdgeType.CONTAINS.value: 20,
    EdgeType.IMPORTS.value: 10,
}


# ---------------------------------------------------------------------------
# CodeParser
# ---------------------------------------------------------------------------

class CodeParser:
    """
    Two-pass, multi-language code parser backed by Tree-sitter.

    Usage
    -----
    parser = CodeParser()
    for f in all_files:
        parser.extract_symbols(f)          # Pass 1
    for f in all_files:
        parser.extract_dependencies(f, project_root)   # Pass 2
    """

    def __init__(self):
        self.global_symbol_table: dict[str, dict] = {}
        self.graph: nx.DiGraph = nx.DiGraph()

    # ── ID helpers ─────────────────────────────────────────────────────────

    def _node_id(self, filepath: str, *parts: str) -> str:
        return "::".join([filepath, *parts]) if parts else filepath

    def _text(self, node, code: bytes) -> str:
        return code[node.start_byte:node.end_byte].decode("utf-8", errors="replace")

    def _source(self, node, code: bytes) -> str:
        return self._text(node, code)

    # ── Graph helpers ───────────────────────────────────────────────────────

    def _add_node(self, node_id: str, node_type: NodeType, name: str,
                  filepath: str, language: str, source: str = "", **extra):
        self.graph.add_node(
            node_id,
            type=node_type.value,
            name=name,
            path=filepath,
            language=language,
            source=source,
            **extra,
        )

    def _set_edge_with_priority(self, src: str, dst: str, edge_type: str, **extra):
        if self.graph.has_edge(src, dst):
            existing_type = self.graph[src][dst].get("type")
            existing_prio = EDGE_PRIORITY.get(existing_type, 0)
            new_prio = EDGE_PRIORITY.get(edge_type, 0)
            if new_prio > existing_prio:
                self.graph[src][dst]["type"] = edge_type
                self.graph[src][dst].update(extra)
        else:
            self.graph.add_edge(src, dst, type=edge_type, **extra)

    def _add_edge(self, src: str, dst: str, edge_type: EdgeType):
        if src != dst and src in self.graph and dst in self.graph:
            self._set_edge_with_priority(src, dst, edge_type.value)

    def _safe_add_edge(self, src: str, dst: str, edge_type: EdgeType):
        """Add edge even if target is not yet in graph (dependency pass)."""
        if src != dst:
            self._set_edge_with_priority(src, dst, edge_type.value)

    # ======================================================================
    # PASS 1 — Symbol extraction
    # ======================================================================

    def extract_symbols(self, filepath: str):
        tree, code, lang = parse_file(filepath)
        if lang is None:
            return

        file_id = self._node_id(filepath)
        basename = os.path.basename(filepath)
        self._add_node(file_id, NodeType.FILE, basename, filepath, lang)

        # Handle DB Schemas
        self.extract_db_schema(filepath, code, lang)

        if tree is None:
            return

        if lang == "python":
            self._symbols_python(tree.root_node, code, filepath, lang, file_id)
        elif lang in ("javascript", "typescript", "tsx"):
            self._symbols_js(tree.root_node, code, filepath, lang, file_id)

    def extract_db_schema(self, filepath: str, code_bytes: bytes, lang: str):
        code = code_bytes.decode('utf-8', errors='ignore')
        
        if lang == "prisma":
            import re
            model_pattern = re.compile(r'model\s+([A-Za-z0-9_]+)\s*\{([^}]+)\}')
            for match in model_pattern.finditer(code):
                table_name = match.group(1)
                body = match.group(2)
                
                columns = []
                for line in body.split('\n'):
                    line = line.strip()
                    if not line or line.startswith('//') or line.startswith('@@'):
                        continue
                    parts = line.split()
                    if len(parts) >= 2:
                        col_name = parts[0]
                        col_type = parts[1]
                        is_pk = '@id' in line
                        is_fk = '@relation' in line
                        columns.append({
                            "name": col_name,
                            "type": col_type.replace('?', '').replace('[]', ''),
                            "isPrimaryKey": is_pk,
                            "isForeignKey": is_fk
                        })
                
                node_id = f"{filepath}::{table_name}"
                self._add_node(
                    node_id,
                    NodeType.DATABASE_TABLE,
                    table_name,
                    filepath,
                    "prisma",
                    source=match.group(0),
                    columns=columns
                )
                self._safe_add_edge(self._node_id(filepath), node_id, EdgeType.CONTAINS)
                
                for col in columns:
                    if col['isForeignKey'] or (col['type'].istitle() and col['type'] not in ('String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json')):
                        target_id = f"{filepath}::{col['type']}"
                        self._safe_add_edge(node_id, target_id, EdgeType.FOREIGN_KEY)
                        
        elif lang == "python" and "models" in filepath:
            # Django/SQLAlchemy simplistic extraction
            import re
            class_pattern = re.compile(r'class\s+([A-Za-z0-9_]+)\s*\([^)]*\w*(?:Model|Base)[^)]*\):')
            for match in class_pattern.finditer(code):
                table_name = match.group(1)
                node_id = f"{filepath}::{table_name}"
                
                # We extract simplistic columns by looking for field definitions
                body_match = re.search(r'(?s)class\s+' + table_name + r'.*?:(.*?(?=class|\Z))', code)
                columns = []
                if body_match:
                    body = body_match.group(1)
                    for line in body.split('\n'):
                        line = line.strip()
                        if line and '=' in line and ('Column' in line or 'Field' in line or 'ForeignKey' in line):
                            col_name = line.split('=')[0].strip()
                            is_pk = 'primary_key=True' in line
                            is_fk = 'ForeignKey' in line
                            columns.append({
                                "name": col_name,
                                "type": "DatabaseField",
                                "isPrimaryKey": is_pk,
                                "isForeignKey": is_fk
                            })
                
                if node_id in self.graph:
                    self.graph.nodes[node_id]['type'] = NodeType.DATABASE_TABLE.value
                    self.graph.nodes[node_id]['columns'] = columns
                else:
                    self._add_node(node_id, NodeType.DATABASE_TABLE, table_name, filepath, "python", source="", columns=columns)
                    self._safe_add_edge(self._node_id(filepath), node_id, EdgeType.CONTAINS)

        elif lang in ("typescript", "javascript", "tsx") and (
            "schema" in filepath.lower()
            or "/db/" in filepath.replace('\\', '/')
            or "/database/" in filepath.replace('\\', '/')
        ):
            import re
            # ── Drizzle ORM: line-by-line state machine ───────────────────
            lines_raw = code.splitlines()  # handles \r\n, \n, \r
            in_table = False
            in_relations = False
            table_name = ""
            columns = []
            node_id = ""

            for raw_line in lines_raw:
                line_str = raw_line.strip()
                if not line_str or line_str.startswith('//'):
                    continue

                if not in_table and not in_relations:
                    tbl_match = re.match(
                        r'export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(?:pg|mysql|sqlite)Table\(',
                        line_str
                    )
                    if tbl_match:
                        in_table = True
                        table_name = tbl_match.group(1)
                        node_id = f"{filepath}::{table_name}"
                        columns = []
                        continue

                    rel_match = re.match(
                        r'export\s+const\s+\w+\s*=\s*relations\(([A-Za-z0-9_]+),',
                        line_str
                    )
                    if rel_match:
                        in_relations = True
                        table_name = rel_match.group(1)
                        node_id = f"{filepath}::{table_name}"
                        continue

                if in_table:
                    if line_str.startswith('});') or line_str.startswith('},'):
                        if node_id in self.graph:
                            self.graph.nodes[node_id]['type'] = NodeType.DATABASE_TABLE.value
                            self.graph.nodes[node_id]['name'] = table_name
                            self.graph.nodes[node_id]['columns'] = columns
                            self.graph.nodes[node_id].setdefault('path', filepath)
                        else:
                            self._add_node(node_id, NodeType.DATABASE_TABLE, table_name, filepath, lang, source="", columns=columns)
                            self._safe_add_edge(self._node_id(filepath), node_id, EdgeType.CONTAINS)
                        in_table = False
                        continue

                    if ':' in line_str and '(' in line_str:
                        col_name = line_str.split(':')[0].strip()
                        is_pk = '.primaryKey()' in line_str
                        is_fk = '.references(' in line_str
                        columns.append({
                            "name": col_name,
                            "type": "DatabaseField",
                            "isPrimaryKey": is_pk,
                            "isForeignKey": is_fk,
                        })
                        if is_fk:
                            fk_m = re.search(r'\.references\(\(\)\s*=>\s*([A-Za-z0-9_]+)', line_str)
                            if fk_m:
                                target_table = fk_m.group(1)
                                target_id = f"{filepath}::{target_table}"
                                # sourceHandle = the FK column row; targetHandle = 'id' (conventional PK)
                                self._set_edge_with_priority(
                                    node_id, target_id,
                                    EdgeType.FOREIGN_KEY.value,
                                    sourceHandle=col_name,
                                    targetHandle='id'
                                )

                if in_relations:
                    if line_str.startswith('}));') or line_str.startswith('});'):
                        in_relations = False
                        continue
                    # We drop generic edges inferred from relations() blocks because 
                    # the inline .references() already provides the exact column-to-column FKs.
                    pass

            # ── TypeORM: decorator-based entities ─────────────────────────
            typeorm_pattern = re.compile(
                r'@Entity[^)]*\)\s*(?:export\s+)?class\s+([A-Za-z0-9_]+)\s*\{([^}]+)\}',
                re.DOTALL
            )
            for match in typeorm_pattern.finditer(code):
                table_name = match.group(1)
                body = match.group(2)
                node_id = f"{filepath}::{table_name}"
                columns = []
                col_pattern = re.compile(r'@(?:Primary)?Column[^)]*\)\s*([A-Za-z0-9_]+)\s*:', re.DOTALL)
                for cm in col_pattern.finditer(body):
                    columns.append({
                        "name": cm.group(1),
                        "type": "DatabaseField",
                        "isPrimaryKey": "PrimaryColumn" in cm.group(0),
                        "isForeignKey": False,
                    })
                rel_pattern = re.compile(
                    r'@(?:ManyToOne|OneToMany|OneToOne)[^)]*\)\s*([A-Za-z0-9_]+)\s*:\s*([A-Za-z0-9_]+)',
                    re.DOTALL
                )
                for rm in rel_pattern.finditer(body):
                    columns.append({
                        "name": rm.group(1), "type": rm.group(2),
                        "isPrimaryKey": False, "isForeignKey": True,
                    })
                    self._safe_add_edge(node_id, f"{filepath}::{rm.group(2)}", EdgeType.FOREIGN_KEY)
                if node_id in self.graph:
                    self.graph.nodes[node_id]['type'] = NodeType.DATABASE_TABLE.value
                    self.graph.nodes[node_id]['columns'] = columns
                else:
                    self._add_node(node_id, NodeType.DATABASE_TABLE, table_name, filepath, lang, source=match.group(0), columns=columns)
                    self._safe_add_edge(self._node_id(filepath), node_id, EdgeType.CONTAINS)

    # ── Python symbol extractor ────────────────────────────────────────────

    def _symbols_python(self, root, code, filepath, lang, file_id, current_class=None):
        for node in root.children:
            self._py_node(node, code, filepath, lang, file_id, current_class)

    def _py_node(self, node, code, filepath, lang, file_id, current_class=None):
        # ── Class definition ──────────────────────────────────────────────
        if node.type == "class_definition":
            name_node = node.child_by_field_name("name")
            if not name_node:
                return
            class_name = self._text(name_node, code)
            node_id = self._node_id(filepath, class_name)
            self._add_node(node_id, NodeType.CLASS, class_name, filepath, lang,
                           source=self._source(node, code))
            self._add_edge(file_id, node_id, EdgeType.CONTAINS)
            self.global_symbol_table[class_name] = {"type": NodeType.CLASS, "file": filepath, "node_id": node_id}

            body = node.child_by_field_name("body")
            if body:
                for child in body.children:
                    self._py_node(child, code, filepath, lang, file_id, current_class=class_name)
            return

        # ── Function / method definition ──────────────────────────────────
        if node.type in ("function_definition", "decorated_definition"):
            # Unwrap decorators to get the actual function
            actual = node
            decorators = []
            if node.type == "decorated_definition":
                for ch in node.children:
                    if ch.type == "decorator":
                        decorators.append(self._text(ch, code))
                    elif ch.type in ("function_definition", "async_function_definition"):
                        actual = ch
            if actual.type == "async_function_definition":
                actual_type = "async_function_definition"
            else:
                actual_type = actual.type

            name_node = actual.child_by_field_name("name")
            if not name_node:
                return
            func_name = self._text(name_node, code)

            # Classify: API_ROUTE via FastAPI/Flask decorators?
            api_route_info = self._detect_py_api_route(decorators)
            is_async = (actual_type == "async_function_definition")

            if api_route_info:
                node_id = self._node_id(filepath, func_name)
                self._add_node(node_id, NodeType.API_ROUTE, func_name, filepath, lang,
                               source=self._source(node, code),
                               http_method=api_route_info["method"],
                               route_path=api_route_info["path"],
                               framework=api_route_info["framework"])
                self._add_edge(file_id, node_id, EdgeType.DEFINES)
            else:
                node_id = self._node_id(filepath,
                                        *([current_class] if current_class else []),
                                        func_name)
                parent_id = (self._node_id(filepath, current_class)
                             if current_class else file_id)
                self._add_node(node_id, NodeType.FUNCTION, func_name, filepath, lang,
                               source=self._source(node, code), is_async=is_async)
                self._add_edge(parent_id, node_id, EdgeType.CONTAINS)

            self.global_symbol_table[func_name] = {"type": NodeType.FUNCTION, "file": filepath, "node_id": node_id}

            body = actual.child_by_field_name("body")
            if body:
                for child in body.children:
                    self._py_node(child, code, filepath, lang, file_id, current_class=current_class)
            return

        # recurse
        for child in node.children:
            self._py_node(child, code, filepath, lang, file_id, current_class)

    def _detect_py_api_route(self, decorators: list[str]) -> Optional[dict]:
        """Return route metadata if any decorator is a FastAPI/Flask HTTP decorator."""
        for dec in decorators:
            # e.g. @app.get("/path") or @router.post("/path")
            m = re.match(r'@\w+\.(\w+)\s*\(\s*["\']([^"\']*)["\']', dec)
            if m:
                method = m.group(1).lower()
                path   = m.group(2)
                if method in _FASTAPI_DECORATORS:
                    return {
                        "method":   method.upper(),
                        "path":     path,
                        "endpoint": normalize_endpoint(path),   # ← normalised
                        "framework": "fastapi/flask",
                    }
        return None

    # ── JS/TS/TSX symbol extractor ─────────────────────────────────────────

    def _symbols_js(self, root, code, filepath, lang, file_id):
        """Walk the JS/TS/TSX tree and register all top-level symbols."""
        for node in root.children:
            self._js_node(node, code, filepath, lang, file_id)

    def _js_node(self, node, code, filepath, lang, file_id, current_class=None):
        t = node.type

        # ── Class declaration ──────────────────────────────────────────────
        if t in ("class_declaration", "class"):
            name_node = node.child_by_field_name("name")
            if name_node:
                class_name = self._text(name_node, code)
                node_id = self._node_id(filepath, class_name)
                self._add_node(node_id, NodeType.CLASS, class_name, filepath, lang,
                               source=self._source(node, code))
                self._add_edge(file_id, node_id, EdgeType.CONTAINS)
                self.global_symbol_table[class_name] = {"type": NodeType.CLASS, "file": filepath, "node_id": node_id}

                body = node.child_by_field_name("body")
                if body:
                    for ch in body.children:
                        self._js_node(ch, code, filepath, lang, file_id, current_class=class_name)
            return

        # ── Function declaration ───────────────────────────────────────────
        if t in ("function_declaration", "function", "generator_function_declaration"):
            name_node = node.child_by_field_name("name")
            if name_node:
                func_name = self._text(name_node, code)
                self._classify_and_add_js_function(
                    func_name, node, code, filepath, lang, file_id, current_class, is_async=False
                )
            return

        # ── Async function declaration ─────────────────────────────────────
        if t == "async_function":
            name_node = node.child_by_field_name("name") or (node.child_by_field_name("function") and
                        node.child_by_field_name("function").child_by_field_name("name"))
            name_node = node.child_by_field_name("name")
            if name_node:
                func_name = self._text(name_node, code)
                self._classify_and_add_js_function(
                    func_name, node, code, filepath, lang, file_id, current_class, is_async=True
                )
            return

        # ── Lexical / variable declarations (const Foo = () => …) ─────────
        if t in ("lexical_declaration", "variable_declaration"):
            for decl in node.children:
                if decl.type == "variable_declarator":
                    name_node = decl.child_by_field_name("name")
                    val_node  = decl.child_by_field_name("value")
                    if name_node and val_node:
                        sym_name = self._text(name_node, code)
                        if val_node.type in ("arrow_function", "function", "async_function"):
                            is_async = val_node.type == "async_function"
                            self._classify_and_add_js_function(
                                sym_name, val_node, code, filepath, lang, file_id, current_class, is_async
                            )
            return

        # ── Export statements — unwrap and recurse ─────────────────────────
        if t in ("export_statement", "export_default_declaration"):
            for ch in node.children:
                self._js_node(ch, code, filepath, lang, file_id, current_class)
            return

        # ── Method definition (inside class body) ──────────────────────────
        if t == "method_definition":
            name_node = node.child_by_field_name("name")
            if name_node:
                method_name = self._text(name_node, code)
                if method_name not in _REACT_LIFECYCLE:
                    node_id = self._node_id(filepath, *(
                        [current_class, method_name] if current_class else [method_name]
                    ))
                    parent_id = self._node_id(filepath, current_class) if current_class else file_id
                    self._add_node(node_id, NodeType.FUNCTION, method_name, filepath, lang,
                                   source=self._source(node, code))
                    self._add_edge(parent_id, node_id, EdgeType.CONTAINS)
                    self.global_symbol_table[method_name] = {"type": NodeType.FUNCTION, "file": filepath, "node_id": node_id}
            return

        # ── Express-style route: app.get('/path', handler) ────────────────
        if t == "expression_statement":
            for ch in node.children:
                self._js_node(ch, code, filepath, lang, file_id, current_class)
            return

        if t == "call_expression":
            fn_node = node.child_by_field_name("function")
            if fn_node and fn_node.type == "member_expression":
                obj  = fn_node.child_by_field_name("object")
                prop = fn_node.child_by_field_name("property")
                if obj and prop:
                    method = self._text(prop, code).lower()
                    if method in _EXPRESS_METHODS:
                        args = node.child_by_field_name("arguments")
                        route_path = ""
                        if args and args.child_count > 0:
                            first = args.children[0] if args.children[0].type != "," else args.children[1]
                            if first.type in ("string", "template_string"):
                                route_path = self._text(first, code).strip("\"'`")
                        route_name = f"{method.upper()}_{route_path.replace('/', '_').strip('_') or 'root'}"
                        node_id = self._node_id(filepath, route_name)
                        self._add_node(node_id, NodeType.API_ROUTE, route_name, filepath, lang,
                                       source=self._source(node, code),
                                       http_method=method.upper(),
                                       route_path=route_path,
                                       framework="express")
                        self._add_edge(file_id, node_id, EdgeType.DEFINES)
            return

        # default: recurse
        for ch in node.children:
            self._js_node(ch, code, filepath, lang, file_id, current_class)

    def _classify_and_add_js_function(self, func_name: str, node, code: bytes,
                                       filepath: str, lang: str, file_id: str,
                                       current_class: Optional[str], is_async: bool):
        """
        Given a JS/TS function name and its AST node, decide whether it is a
        COMPONENT, HOOK, or plain FUNCTION and register it appropriately.
        """
        source_text = self._source(node, code)
        returns_jsx = self._node_contains_jsx(node)

        # Rule 1 — Hook: name starts with 'use' and first char after 'use' is uppercase
        if re.match(r'^use[A-Z]', func_name):
            node_type = NodeType.HOOK
            edge_type = EdgeType.CONTAINS
        # Rule 2 — Component: PascalCase + returns JSX OR the file is .jsx/.tsx
        elif (func_name[0].isupper() and (returns_jsx or lang == "tsx")):
            node_type = NodeType.COMPONENT
            edge_type = EdgeType.CONTAINS
        else:
            node_type = NodeType.FUNCTION
            edge_type = EdgeType.CONTAINS

        node_id = self._node_id(filepath,
                                *([current_class, func_name] if current_class else [func_name]))
        parent_id = self._node_id(filepath, current_class) if current_class else file_id

        self._add_node(node_id, node_type, func_name, filepath, lang,
                       source=source_text, is_async=is_async)
        self._add_edge(parent_id, node_id, edge_type)
        self.global_symbol_table[func_name] = {"type": node_type, "file": filepath, "node_id": node_id}

    def _node_contains_jsx(self, node) -> bool:
        """Recursively check if a node contains any JSX element."""
        if node.type in ("jsx_element", "jsx_self_closing_element", "jsx_fragment"):
            return True
        for ch in node.children:
            if self._node_contains_jsx(ch):
                return True
        return False

    # ======================================================================
    # PASS 2 — Dependency extraction
    # ======================================================================

    def extract_dependencies(self, filepath: str, project_root: str):
        tree, code, lang = parse_file(filepath)
        if tree is None:
            return

        file_id = self._node_id(filepath)
        if lang == "python":
            self._deps_python(tree.root_node, code, filepath, file_id, project_root)
        elif lang in ("javascript", "typescript", "tsx"):
            self._deps_js(tree.root_node, code, filepath, file_id, project_root, lang)

    # ── Python dependency pass ─────────────────────────────────────────────

    def _deps_python(self, root, code, filepath, file_id, project_root):
        local_aliases: dict[str, str] = {}

        def walk(node):
            if node.type == "import_statement":
                for ch in node.children:
                    if ch.type == "dotted_name":
                        mod = self._text(ch, code)
                        self._resolve_py_import(file_id, mod, project_root)

            elif node.type == "import_from_statement":
                mod_node = node.child_by_field_name("module_name")
                if mod_node:
                    mod = self._text(mod_node, code)
                    target_fid = self._resolve_py_import(file_id, mod, project_root)
                    for ch in node.children:
                        if ch.type in ("dotted_name", "aliased_import", "identifier"):
                            txt = self._text(ch, code)
                            orig, alias = (txt.split(" as ") + [txt])[:2]
                            orig = orig.strip(); alias = alias.strip()
                            if orig in self.global_symbol_table:
                                tid = self.global_symbol_table[orig]["node_id"]
                                self._safe_add_edge(file_id, tid, EdgeType.IMPORTS)
                                local_aliases[alias] = tid

            elif node.type == "call":
                fn = node.child_by_field_name("function")
                if fn:
                    fname = self._text(fn, code)
                    if fname in local_aliases:
                        self._safe_add_edge(file_id, local_aliases[fname], EdgeType.CALLS)
                    elif fname in self.global_symbol_table:
                        self._safe_add_edge(file_id, self.global_symbol_table[fname]["node_id"], EdgeType.CALLS)
                    else:
                        parts = fname.split(".")
                        if len(parts) > 1 and parts[-1] in self.global_symbol_table:
                            self._safe_add_edge(file_id, self.global_symbol_table[parts[-1]]["node_id"], EdgeType.CALLS)

            for ch in node.children:
                walk(ch)

        walk(root)

    def _resolve_py_import(self, file_id: str, module_name: str, project_root: str) -> Optional[str]:
        possible = os.path.join(project_root, *module_name.split(".")) + ".py"
        if os.path.exists(possible):
            tid = self._node_id(possible)
            self._safe_add_edge(file_id, tid, EdgeType.IMPORTS)
            return tid
        return None

    # ── JS/TS dependency pass ──────────────────────────────────────────────

    def _deps_js(self, root, code, filepath, file_id, project_root, lang):
        local_aliases: dict[str, str] = {}

        def walk(node):
            t = node.type

            # import … from '…'
            if t == "import_statement":
                src_node = node.child_by_field_name("source")
                if src_node:
                    raw = self._text(src_node, code).strip("\"'`")
                    resolved = self._resolve_js_import(raw, filepath, project_root)
                    if resolved:
                        self._safe_add_edge(file_id, resolved, EdgeType.IMPORTS)
                        # map named imports → their node_ids
                        for clause in node.children:
                            if clause.type == "import_clause":
                                for spec in clause.children:
                                    if spec.type in ("named_imports", "namespace_import"):
                                        for item in spec.children:
                                            if item.type == "import_specifier":
                                                n = item.child_by_field_name("name")
                                                a = item.child_by_field_name("alias") or n
                                                if n:
                                                    orig = self._text(n, code)
                                                    alias = self._text(a, code)
                                                    if orig in self.global_symbol_table:
                                                        local_aliases[alias] = self.global_symbol_table[orig]["node_id"]

            # require('…')
            elif t == "call_expression":
                fn = node.child_by_field_name("function")
                args = node.child_by_field_name("arguments")
                if fn and self._text(fn, code) == "require" and args:
                    first = next((ch for ch in args.children if ch.type == "string"), None)
                    if first:
                        raw = self._text(first, code).strip("\"'`")
                        resolved = self._resolve_js_import(raw, filepath, project_root)
                        if resolved:
                            self._safe_add_edge(file_id, resolved, EdgeType.IMPORTS)

                # fetch / axios / react-query API calls
                fname = self._text(fn, code) if fn else ""
                self._detect_js_api_call(node, fname, code, filepath, file_id)

                # Regular call → CALLS edge
                if fname in local_aliases:
                    self._safe_add_edge(file_id, local_aliases[fname], EdgeType.CALLS)
                elif fname in self.global_symbol_table:
                    self._safe_add_edge(file_id, self.global_symbol_table[fname]["node_id"], EdgeType.CALLS)

            # JSX element → RENDERS edge
            elif t in ("jsx_opening_element", "jsx_self_closing_element"):
                tag = node.child_by_field_name("name")
                if tag:
                    comp_name = self._text(tag, code)
                    if comp_name and comp_name[0].isupper():
                        if comp_name in self.global_symbol_table:
                            tid = self.global_symbol_table[comp_name]["node_id"]
                            self._safe_add_edge(file_id, tid, EdgeType.RENDERS)
                        elif comp_name in local_aliases:
                            self._safe_add_edge(file_id, local_aliases[comp_name], EdgeType.RENDERS)

            for ch in node.children:
                walk(ch)

        walk(root)

    def _resolve_js_import(self, raw: str, current_file: str, project_root: str) -> Optional[str]:
        """Resolve a relative JS import path to an absolute file node ID."""
        if not raw.startswith("."):
            return None  # Skip node_modules / bare specifiers
        base_dir = os.path.dirname(current_file)
        base     = os.path.normpath(os.path.join(base_dir, raw))
        for ext in (".tsx", ".ts", ".jsx", ".js"):
            candidate = base if base.endswith(ext) else base + ext
            if os.path.exists(candidate):
                return self._node_id(candidate)
            # try index file
            index = os.path.join(base, f"index{ext}")
            if os.path.exists(index):
                return self._node_id(index)
        return None

    def _detect_js_api_call(self, call_node, fname: str, code: bytes, filepath: str, file_id: str):
        """
        If a call expression looks like an HTTP call, register an API_CALL node
        and a FETCHES edge from the current file.
        """
        parts = fname.split(".")
        root_name   = parts[0]
        method_name = parts[-1] if len(parts) > 1 else ""

        is_fetch = root_name == "fetch"
        is_axios = (root_name == "axios" and method_name in _AXIOS_METHODS) or fname == "axios"
        is_rq    = root_name in ("useSWR", "useQuery", "useMutation", "$http")

        if not (is_fetch or is_axios or is_rq):
            return

        args = call_node.child_by_field_name("arguments")
        url_pattern = ""
        if args:
            first = next(
                (ch for ch in args.children
                 if ch.type in ("string", "template_string")),
                None,
            )
            if first:
                url_pattern = self._text(first, code).strip("\"'`")

        call_lib    = root_name
        http_method = method_name.upper() if method_name in _AXIOS_METHODS else "GET"
        endpoint    = normalize_endpoint(url_pattern)   # ← normalised

        # Derive a stable ID from the call location
        start = call_node.start_point
        api_call_id = self._node_id(filepath, f"API_CALL_L{start[0]+1}")

        if api_call_id not in self.graph:
            self._add_node(
                api_call_id, NodeType.API_CALL,
                f"fetch:{url_pattern or '?'}", filepath,
                _detect_language(filepath) or "javascript",
                source=self._text(call_node, code),
                url_pattern=url_pattern,
                endpoint=endpoint,              # ← stored for resolver
                http_method=http_method,
                call_lib=call_lib,
            )
            self._safe_add_edge(file_id, api_call_id, EdgeType.FETCHES)

    # ======================================================================
    # PASS 2.5 — Component Unification
    # ======================================================================

    def unify_components(self):
        """
        Merge FILE nodes into their COMPONENT node if the file contains exactly one component
        (and no classes) and the component name matches the filename or is 'index'.
        """
        file_nodes = [n for n, d in self.graph.nodes(data=True) if d.get("type") == NodeType.FILE.value]
        nodes_to_remove = []

        for file_id in file_nodes:
            file_data = self.graph.nodes[file_id]
            file_name = file_data.get("name", "")
            base_file_name, ext = os.path.splitext(file_name)

            children = [v for u, v, d in self.graph.out_edges(file_id, data=True) if d.get("type") == EdgeType.CONTAINS.value]

            components = [v for v in children if self.graph.nodes[v].get("type") == NodeType.COMPONENT.value]
            classes = [v for v in children if self.graph.nodes[v].get("type") == NodeType.CLASS.value]

            if len(components) == 1 and len(classes) == 0:
                comp_id = components[0]
                comp_data = self.graph.nodes[comp_id]
                comp_name = comp_data.get("name", "")

                if comp_name.lower() == base_file_name.lower() or base_file_name.lower() == "index":
                    # Re-wire incoming edges
                    for u, v, d in list(self.graph.in_edges(file_id, data=True)):
                        if u != comp_id:
                            edge_type = d.pop("type", EdgeType.IMPORTS.value)
                            self._set_edge_with_priority(u, comp_id, edge_type, **d)

                    # Re-wire outgoing edges
                    for u, v, d in list(self.graph.out_edges(file_id, data=True)):
                        edge_type = d.pop("type", EdgeType.IMPORTS.value)
                        if v != comp_id and edge_type != EdgeType.CONTAINS.value:
                            self._set_edge_with_priority(comp_id, v, edge_type, **d)

                    # Update component label to show it's unified
                    comp_data["name"] = f"{comp_name} ({ext})"
                    comp_data["is_unified"] = True

                    nodes_to_remove.append(file_id)

        for nid in nodes_to_remove:
            self.graph.remove_node(nid)

    # ======================================================================
    # PASS 4 — Endpoint Consolidation
    # ======================================================================

    def consolidate_endpoints(self):
        """
        Consolidate multiple API_ROUTE nodes with the same endpoint path 
        within the same file into a single API_ENDPOINT node.
        """
        from collections import defaultdict
        
        # Group routes by (file_id, endpoint)
        routes_by_group = defaultdict(list)
        
        route_nodes = [n for n, d in self.graph.nodes(data=True) if d.get("type") == NodeType.API_ROUTE.value]
        
        for route_id in route_nodes:
            data = self.graph.nodes[route_id]
            endpoint = data.get("endpoint") or normalize_endpoint(data.get("route_path", ""))
            
            # Find parent file via incoming DEFINES edge
            parent_files = [u for u, v, d in self.graph.in_edges(route_id, data=True) if d.get("type") == EdgeType.DEFINES.value]
            if not parent_files:
                continue
            parent_file = parent_files[0]
            
            routes_by_group[(parent_file, endpoint)].append(route_id)
            
        nodes_to_remove = []
        
        for (file_id, endpoint), route_ids in routes_by_group.items():
            if not route_ids:
                continue
                
            safe_ep = endpoint.replace("/", "_").strip("_") or "root"
            endpoint_id = f"{file_id}::API_ENDPOINT_{safe_ep}"
            
            methods = []
            framework = "unknown"
            source_snippets = []
            filepath = ""
            lang = ""
            
            for rid in route_ids:
                data = self.graph.nodes[rid]
                method = data.get("http_method", "GET")
                if method not in methods:
                    methods.append(method)
                framework = data.get("framework", framework)
                filepath = data.get("path", filepath)
                lang = data.get("language", lang)
                if data.get("source"):
                    source_snippets.append(data["source"])
            
            methods.sort()
            
            # Add consolidated node
            self._add_node(
                endpoint_id, NodeType.API_ENDPOINT,
                endpoint, filepath, lang,
                source="\n\n".join(source_snippets),
                endpoint=endpoint,
                methods=methods,
                framework=framework
            )
            
            # Transfer edges
            for rid in route_ids:
                for u, v, d in list(self.graph.in_edges(rid, data=True)):
                    edge_type = d.pop("type", EdgeType.DEFINES.value)
                    self._set_edge_with_priority(u, endpoint_id, edge_type, **d)
                
                for u, v, d in list(self.graph.out_edges(rid, data=True)):
                    edge_type = d.pop("type", EdgeType.CALLS.value)
                    self._set_edge_with_priority(endpoint_id, v, edge_type, **d)
                    
                nodes_to_remove.append(rid)
                
        for nid in nodes_to_remove:
            self.graph.remove_node(nid)


