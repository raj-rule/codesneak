"""
core/resolver.py
================
Pass 3 — Cross-Boundary Resolver (with Node Compression)

Strategy
--------
Instead of leaving API_CALL nodes as middlemen in the graph, we:

1. Bucket every API_ROUTE node by its normalised endpoint.
2. Scan every API_CALL node and check if its endpoint matches a known route.
3. **Match found (internal route)**
   - Find the API_CALL's predecessors (the COMPONENT/FUNCTION that owns the fetch).
   - Draw a NETWORK_REQUEST edge directly from each predecessor → the API_ROUTE.
   - Queue the API_CALL node for removal (it is now redundant).
4. **No match (external API — Stripe, GitHub, etc.)**
   - Leave the API_CALL node on the canvas exactly as-is.
5. After iteration, bulk-remove all queued nodes in one safe pass.

Result: a compressed graph where cross-boundary traffic is expressed as a
single, direct edge — no intermediate clutter.
"""

from __future__ import annotations

import logging
from collections import defaultdict

import networkx as nx

from core.schema import EdgeType, NodeType

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def link_network_boundaries(graph: nx.DiGraph) -> nx.DiGraph:
    """
    Compress API_CALL nodes that map to known internal API_ROUTEs into direct
    NETWORK_REQUEST edges, then remove the now-redundant API_CALL nodes.

    Parameters
    ----------
    graph : nx.DiGraph
        The fully-built NetworkX graph produced after Pass 1 + Pass 2.

    Returns
    -------
    nx.DiGraph
        The same graph object mutated in-place.
    """

    # ── 1. Index every API_ROUTE by its normalised endpoint ──────────────────
    routes_by_endpoint: dict[str, list[str]] = defaultdict(list)

    for node_id, data in graph.nodes(data=True):
        if data.get("type") == NodeType.API_ROUTE.value:
            ep = _endpoint(data)
            if ep:
                routes_by_endpoint[ep].append(node_id)
                logger.debug("[ROUTE]  %s  →  endpoint=%r", node_id, ep)

    if not routes_by_endpoint:
        logger.info("Resolver: no API_ROUTE nodes found — skipping.")
        print("  [Resolver] No API_ROUTE nodes found. Skipping cross-boundary resolution.")
        return graph

    # ── 2. Sweep API_CALL nodes ───────────────────────────────────────────────
    nodes_to_remove: list[str] = []
    direct_edges_added = 0

    # Snapshot the node list so we can safely mutate later
    all_nodes = list(graph.nodes(data=True))

    for node_id, data in all_nodes:
        if data.get("type") != NodeType.API_CALL.value:
            continue

        call_ep = _endpoint(data)
        logger.debug("[CALL ]  %s  →  endpoint=%r", node_id, call_ep)

        # ── 3. Match against known routes ─────────────────────────────────────
        matched_routes = _find_routes(call_ep, routes_by_endpoint)

        if not matched_routes:
            # External API (Stripe, GitHub, …) — leave it untouched.
            logger.debug(
                "  ✗ No internal route for %r — keeping API_CALL node.", call_ep
            )
            continue

        # ── 4. Bypass: wire predecessors directly to the matched route(s) ────
        predecessors = list(graph.predecessors(node_id))

        if not predecessors:
            # Orphaned API_CALL with no known caller — still compress it away
            # but we can't create a meaningful edge.
            logger.debug("  ⚠ API_CALL %s has no predecessors.", node_id)
            nodes_to_remove.append(node_id)
            continue

        for pred_id in predecessors:
            for route_id in matched_routes:
                if pred_id == route_id:
                    # Don't self-loop
                    continue
                graph.add_edge(
                    pred_id,
                    route_id,
                    type=EdgeType.NETWORK_REQUEST.value,
                )
                direct_edges_added += 1
                logger.info(
                    "  ✔ NETWORK_REQUEST  %s  →  %s  (via %s)",
                    pred_id, route_id, node_id,
                )

        # ── 5. Queue for removal ──────────────────────────────────────────────
        nodes_to_remove.append(node_id)

    # ── 6. Safe bulk removal (never modify graph during iteration) ────────────
    for nid in nodes_to_remove:
        if graph.has_node(nid):
            graph.remove_node(nid)

    compressed = len(nodes_to_remove)
    summary = (
        f"  [Resolver] Compressed {compressed} API_CALL node(s). "
        f"Created {direct_edges_added} direct NETWORK_REQUEST edge(s)."
    )
    print(summary)
    logger.info(summary)

    return graph


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _endpoint(data: dict) -> str:
    """
    Pull the normalised ``endpoint`` field, falling back to live normalisation
    from ``route_path`` / ``url_pattern`` for nodes built by older pipelines.
    """
    ep = data.get("endpoint", "")
    if ep:
        return ep

    raw = data.get("route_path") or data.get("url_pattern") or ""
    if raw:
        from core.parser import normalize_endpoint
        return normalize_endpoint(raw)
    return ""


def _find_routes(call_ep: str, routes_by_endpoint: dict[str, list[str]]) -> list[str]:
    """
    Return the list of API_ROUTE node IDs that match *call_ep*.

    Two-step lookup:
      1. Exact match (call already normalised, e.g. ``/api/graph``).
      2. Strip http(s)://host:port prefix and retry
         (handles absolute URLs like ``http://localhost:8000/api/graph``).
    """
    if not call_ep:
        return []

    # Step 1 — direct hit
    if call_ep in routes_by_endpoint:
        return routes_by_endpoint[call_ep]

    # Step 2 — strip origin and retry
    stripped = _strip_origin(call_ep)
    if stripped and stripped != call_ep and stripped in routes_by_endpoint:
        return routes_by_endpoint[stripped]

    return []


def _strip_origin(url: str) -> str:
    """Remove ``http(s)://host:port`` from a URL, leaving the path component."""
    import re
    m = re.match(r"https?://[^/]+(/.*)$", url, re.IGNORECASE)
    return m.group(1).lower() if m else url
