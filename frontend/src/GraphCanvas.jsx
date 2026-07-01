import React, { useEffect } from 'react';
import {
  ReactFlow, useNodesState, useEdgesState,
  Background, MiniMap, ReactFlowProvider,
  useReactFlow, Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';
import CustomNode from './CustomNode';
import FolderGroupNode from './FolderGroupNode';
import DatabaseNode from './DatabaseNode';

// ─── Constants ────────────────────────────────────────────────────────────────
const NODE_W   = 220;
const NODE_H   = 80;
// const GROUP_PAD = 36;   // padding inside each directory box
// const GROUP_HEADER_H = 28; // space reserved for the dir label at the top

// ─── Node types registered with React Flow ───────────────────────────────────
// 'group' is React Flow's built-in compound-node type (renders a plain div).
// All data-nodes continue to use CustomNode.
const nodeTypes = {
  custom:      CustomNode,
  group:       undefined,
  folderGroup: FolderGroupNode,
  FILE:        CustomNode,
  CLASS:       CustomNode,
  FUNCTION:    CustomNode,
  COMPONENT:   CustomNode,
  HOOK:        CustomNode,
  API_ROUTE:   CustomNode,
  API_ENDPOINT: CustomNode,
  API_CALL:    CustomNode,
  DATABASE_TABLE: CustomNode,
  dbTable:     DatabaseNode,
};

const elk = new ELK();

// ─── Edge style resolver ──────────────────────────────────────────────────────
function resolveEdgeStyle(linkType) {
  switch ((linkType || '').toUpperCase()) {
    case 'NETWORK_REQUEST':
      return {
        animated: true,
        style: { stroke: '#a855f7', strokeWidth: 2, strokeDasharray: '6 3' },
        labelStyle: { fill: '#a855f7', fontWeight: 700, fontSize: 10 },
        labelBgStyle: { fill: '#111827' },
      };
    case 'RENDERS':
      return {
        animated: false,
        style: { stroke: '#3b82f6', strokeWidth: 1.5 },
        labelStyle: { fill: '#3b82f6', fontSize: 10 },
        labelBgStyle: { fill: '#111827' },
      };
    case 'USES_HOOK':
      return {
        animated: true,
        style: { stroke: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '4 3' },
        labelStyle: { fill: '#f59e0b', fontSize: 10 },
        labelBgStyle: { fill: '#111827' },
      };
    case 'FETCHES':
      return {
        animated: true,
        style: { stroke: '#8b5cf6', strokeWidth: 1.5, strokeDasharray: '5 3' },
        labelStyle: { fill: '#8b5cf6', fontSize: 10 },
        labelBgStyle: { fill: '#111827' },
      };
    case 'DEFINES':
      return {
        animated: false,
        style: { stroke: '#10b981', strokeWidth: 1.5 },
        labelStyle: { fill: '#10b981', fontSize: 10 },
        labelBgStyle: { fill: '#111827' },
      };
    case 'CALLS':
      return {
        animated: true,
        style: { stroke: '#06b6d4', strokeWidth: 1.5 },
        labelStyle: { fill: '#06b6d4', fontSize: 10 },
        labelBgStyle: { fill: '#111827' },
      };
    case 'IMPORTS':
      return {
        animated: false,
        style: { stroke: '#94a3b8', strokeWidth: 1 },
        labelStyle: { fill: '#94a3b8', fontSize: 10 },
        labelBgStyle: { fill: '#111827' },
      };
    case 'FOREIGN_KEY':
      return {
        animated: true,
        type: 'smoothstep',
        style: { stroke: '#f43f5e', strokeWidth: 1.8, strokeDasharray: '6 3' },
        labelStyle: { fill: '#f43f5e', fontWeight: 700, fontSize: 10 },
        labelBgStyle: { fill: '#111827' },
        markerEnd: { type: 'arrowclosed', color: '#f43f5e' },
      };
    case 'CONTAINS':
      return { animated: false, hidden: true, style: { stroke: '#334155', strokeWidth: 1 } };
    default:
      return { animated: false, style: { stroke: '#4b5563', strokeWidth: 1 } };
  }
}

// ─── Directory extraction ─────────────────────────────────────────────────────
/** Return the parent directory string for a file path (cross-platform). */
function dirOf(filePath) {
  if (!filePath) return '__ungrouped__';
  // Normalise separators
  const norm = filePath.replace(/\\/g, '/');
  const idx  = norm.lastIndexOf('/');
  return idx > 0 ? norm.slice(0, idx) : norm;
}

/** Shorten a directory path to its last 2 components for display. */
function shortDir(dirPath) {
  if (!dirPath || dirPath === '__ungrouped__') return 'root';
  const parts = dirPath.split('/');
  return parts.slice(-2).join('/');
}

// ─── Visible node filter ──────────────────────────────────────────────────────
const ALWAYS_VISIBLE_DB = new Set(['DATABASE_TABLE']);

// ─── Core layout function ─────────────────────────────────────────────────────
/**
 * Hierarchical ELK layout using native 'INCLUDE_CHILDREN' handling.
 *
 * 1. Build a nested ELK graph object where nodes are grouped by directory.
 * 2. Configure ELK to handle hierarchies (this packs boxes and routes edges correctly).
 * 3. Recursively flatten the ELK result:
 *    - Groups: Extract absolute x, y, width, height.
 *    - Children: Extract x, y (which are relative to parent) and assign parentId.
 */
// ── Helper to safely extract paths from raw backend nodes ─────────────
const getFilePath = (node, pathMap = {}) => {
  if (!node) return null;
  // 1. Try explicit data path
  if (node.data && node.data.path) return node.data.path;
  // 2. Try root path
  if (node.path) return node.path;
  // 3. NUCLEAR FALLBACK: Extract from ID delimiter
  if (node.id && node.id.includes('::')) return node.id.split('::')[0];
  // 4. STRUCTURAL FALLBACK: Read from edges map
  if (pathMap[node.id]) return pathMap[node.id];
  
  return null;
};

async function buildCompoundLayout(dataNodes, edges, isDataMap = false) {
  if (!dataNodes.length) return { nodes: [], edges };

  // ── DATA MAP: ELK Layered — ERD-optimised, no folder groups ─────────────
  if (isDataMap) {
    const DB_NODE_W = 260;

    // Accurate height: header(40) + statsBar(28) + per-column-row(26) + padding(16)
    const getDbNodeH = (node) => {
      const cols = Math.min(node.data?.columns?.length || 0, 14); // cap at MAX_VISIBLE
      return 40 + 28 + cols * 26 + 16;
    };

    const elkGraph = {
      id: 'root',
      layoutOptions: {
        // ── Core: strict Downward Layered ERD ──────────────────────────
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',

        // ── Node placement: NETWORK_SIMPLEX — better for clustering domains ──
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',

        // ── Edge routing: ORTHOGONAL — clean 90° lines, no diagonal spaghetti
        'elk.edgeRouting': 'ORTHOGONAL',
        'elk.layered.unnecessaryBendpoints': 'true',

        // ── Crossing minimisation & Compaction ───────────────────────────────
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',

        // ── Cycle breaking: stable order across re-renders ───────────────────
        'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',

        // ── Spacing: tighter horizontal/vertical gaps to cluster domains ─────
        'elk.layered.spacing.nodeNodeBetweenLayers': '80',
        'elk.spacing.nodeNode': '60',
        'elk.spacing.componentComponent': '100',
        'elk.spacing.edgeNode': '40',

        // ── Miscellaneous ─────────────────────────────────────────────────────
        'elk.separateConnectedComponents': 'true',
        'elk.layered.mergeEdges': 'false',
        'elk.aspectRatio': '1.8',
      },

      children: dataNodes.map(n => ({
        id: n.id,
        width: DB_NODE_W,
        height: getDbNodeH(n),
        // Per-node ports so column-level handles map to real ELK ports
        ports: (n.data?.columns || []).flatMap(col => [
          { id: `${n.id}__src__${col.name}`, properties: { 'port.side': 'EAST' } },
          { id: `${n.id}__tgt__${col.name}`, properties: { 'port.side': 'WEST' } },
        ]),
        layoutOptions: {
          'elk.portConstraints': 'FIXED_SIDE',
          'elk.portAlignment.default': 'CENTER',
        },
      })),

      edges: edges
        .filter(e => !e.hidden)
        .map(e => ({
          id: e.id,
          sources: [
            e.sourceHandle
              ? `${e.source}__src__${e.sourceHandle}`
              : e.source
          ],
          targets: [
            e.targetHandle
              ? `${e.target}__tgt__${e.targetHandle}`
              : e.target
          ],
        })),
    };

    let laid;
    try {
      laid = await elk.layout(elkGraph);
    } catch (err) {
      console.error('ELK Data Map Error:', err);
      return gridFallback(dataNodes, edges);
    }

    const resultNodes = (laid.children || []).map(elkNode => {
      const original = dataNodes.find(n => n.id === elkNode.id);
      return {
        ...original,
        position: { x: elkNode.x ?? 0, y: elkNode.y ?? 0 },
        // No parentId / extent — free-floating ER cards
      };
    });

    return { nodes: resultNodes, edges };
  }

  // ── LOGIC MAP: Standard compound folder-grouped layout ────────────────────
  const componentToPathMap = {};
  edges.forEach(edge => {
    if (['CONTAINS', 'DEFINES', 'EXPORTS'].includes(edge.type || edge.label)) {
      const parentFileNode = dataNodes.find(n => n.id === edge.source);
      if (parentFileNode) {
         const filePath = parentFileNode.data?.path || parentFileNode.path || (parentFileNode.id.includes('::') ? parentFileNode.id.split('::')[0] : parentFileNode.id);
         if (filePath) {
             componentToPathMap[edge.target] = filePath;
         }
      }
    }
  });

  // ── Step 1: Organize nodes into directory clusters ─────────────────────────
  const dirMap = {}; // dirPath -> { id, children: [] }
  
  dataNodes.forEach(node => {
    // Extract the path using the robust helper with the relational map
    let filePath = getFilePath(node, componentToPathMap);
    
    // 4. Resolve the directory
    const dir = dirOf(filePath);
    
    if (!dirMap[dir]) {
      dirMap[dir] = {
        id: `__group__${dir}`,
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'DOWN', // Better for readable text blocks
          'elk.aspectRatio': '1.6', // CRITICAL: Forces disconnected files into a grid
          'elk.padding': '[top=50,left=20,bottom=20,right=20]',
          'elk.spacing.nodeNode': '20',
          'elk.spacing.componentComponent': '30', // Space between disconnected files inside the folder
          'elk.layered.spacing.nodeNodeBetweenLayers': '40',
          'elk.edgeRouting': 'POLYLINE',
          'elk.layered.mergeEdges': 'false'
        },
        children: [],
        labels: [{ text: shortDir(dir) }]
      };
    }
    dirMap[dir].children.push({
      id: node.id,
      width: NODE_W,
      height: NODE_H
    });
  });

  // ── Step 2: Build the nested ELK graph ─────────────────────────────────────
  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.aspectRatio': '1.6', // CRITICAL: Forces disconnected folders into a 16:9 grid instead of a row
      'elk.spacing.componentComponent': '100', // Keeps folders well separated
      'elk.spacing.nodeNode': '50', 
      'elk.edgeRouting': 'POLYLINE', 
      'elk.layered.mergeEdges': 'false',
      'elk.layered.spacing.nodeNodeBetweenLayers': '50'
    },
    children: Object.values(dirMap),
    // Edges are at root level but refer to nested node IDs
    edges: edges
      .filter(e => !e.hidden)
      .map(e => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };


  let laid;
  try {
    laid = await elk.layout(elkGraph);
  } catch (err) {
    console.error('ELK Layout Error:', err);
    return gridFallback(dataNodes, edges);
  }

  // ── Step 3: Flatten the nested result for React Flow ───────────────────────
  const processedNodes = [];
  
  // Recursive walker
  const flatten = (elkNode) => {
    const isGroup = elkNode.id.startsWith('__group__');
    
    if (isGroup) {
      const labelStr = shortDir(elkNode.id.replace('__group__', ''));
      const lblLower = labelStr.toLowerCase();
      let themeColor = '#64748b'; // Slate
      
      if (lblLower.includes('screen')) themeColor = '#a855f7'; // Purple
      else if (lblLower.includes('component') || lblLower.includes('ui')) themeColor = '#3b82f6'; // Blue
      else if (lblLower.includes('hook')) themeColor = '#eab308'; // Yellow
      else if (lblLower.includes('api') || lblLower.includes('service')) themeColor = '#22c55e'; // Green

      processedNodes.push({
        id: elkNode.id,
        type: 'folderGroup',
        position: { x: elkNode.x, y: elkNode.y },
        style: {
          width: elkNode.width,
          height: elkNode.height,
          zIndex: -1,
          pointerEvents: 'none',
        },
        data: { label: labelStr, themeColor },
        draggable: false,
        selectable: false,
      });
    } else if (elkNode.id !== 'root') {
      // Find the original data-node to preserve its metadata
      const original = dataNodes.find(n => n.id === elkNode.id);
      
      // Calculate React Flow parentId using the structural fallback helper
      const filePath = original ? getFilePath(original, componentToPathMap) : null;
      const calculatedParentId = filePath ? `__group__${dirOf(filePath)}` : null;

      processedNodes.push({
        ...original,
        parentId: calculatedParentId,
        extent: 'parent',
        position: { x: elkNode.x, y: elkNode.y },
        zIndex: 1,
      });
    }

    if (elkNode.children) {
      elkNode.children.forEach(child => flatten(child));
    }
  };

  flatten(laid);

  // Return groups first so they render behind
  const sortedNodes = [
    ...processedNodes.filter(n => n.type === 'folderGroup'),
    ...processedNodes.filter(n => n.type !== 'folderGroup')
  ];

  return { nodes: sortedNodes, edges };
}


/** Simple grid layout fallback for disconnected graphs. */
function gridFallback(dataNodes, edges) {
  const cols = Math.ceil(Math.sqrt(dataNodes.length));
  const nodes = dataNodes.map((n, i) => ({
    ...n,
    position: {
      x: (i % cols) * (NODE_W + 60),
      y: Math.floor(i / cols) * (NODE_H + 80),
    },
  }));
  return { nodes, edges };
}

// ─── Visible node filter ──────────────────────────────────────────────────────
const ALWAYS_VISIBLE = new Set(['API_ROUTE', 'API_ENDPOINT', 'API_CALL', 'COMPONENT', 'HOOK']);

// ─── Inner canvas ─────────────────────────────────────────────────────────────
function InnerGraphCanvas({ graphData, onNodeClick, expandedFiles = [], onExpandNode, focusNodeId, isDataMap = false }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const [activeEdgeTypes, setActiveEdgeTypes] = React.useState({
    RENDERS: true,
    NETWORK_REQUEST: true,
    FETCHES: true,
    CALLS: true,
    USES_HOOK: true,
    IMPORTS: false, // CRITICAL: Default to false to reduce initial clutter
    DEFINES: false,
    FOREIGN_KEY: true,
  });
  const [hoveredNodeId, setHoveredNodeId] = React.useState(null);
  const [autoZoomEnabled, setAutoZoomEnabled] = React.useState(true);
  const [isDark, setIsDark] = React.useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return true; // Default fallback
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  // ── Cinematic pan to FULL Downstream Tree ─────────────────────────────────
  useEffect(() => {
    // Wait until we have a target and the layout has actually generated nodes/edges
    if (!autoZoomEnabled || !focusNodeId || edges.length === 0 || nodes.length === 0) return;

    const t = setTimeout(() => {
      // 1. Initialize BFS queue with the clicked node
      const treeIds = new Set([focusNodeId]);
      const queue = [focusNodeId];

      // 2. Recursively find all children, sub-children, and sub-sub-children
      while (queue.length > 0) {
        const currentId = queue.shift();
        
        // Find all edges moving OUT of the current node
        const outgoingEdges = edges.filter((e) => e.source === currentId);
        
        outgoingEdges.forEach((edge) => {
          // If we haven't seen this sub-child yet, add it to the tree and the queue
          if (!treeIds.has(edge.target)) {
            treeIds.add(edge.target);
            queue.push(edge.target);
          }
        });
      }

      // 3. Format into array and CRITICAL FIX: exclude massive folder groups
      const nodesToFit = Array.from(treeIds)
        .filter((id) => !id.startsWith('__group__'))
        .map((id) => ({ id }));

      // 4. Frame the camera around the entire recursive tree
      fitView({
        nodes: nodesToFit,
        duration: 1000, 
        padding: 0.2,   // 20% padding around the whole cluster
        maxZoom: 1.2    // Prevent zooming in too close if the tree is small
      });
    }, 200);

    return () => clearTimeout(t);
  }, [focusNodeId, edges, nodes, fitView]);

  // ── Rebuild graph whenever source data changes ───────────────────────────
  useEffect(() => {
    if (!graphData?.nodes) return;

    // Helper: collect CONTAINS descendants of a file node
    const getContained = (sourceId) => {
      const ids = [];
      graphData.links.forEach(link => {
        if (link.source === sourceId && link.type === 'CONTAINS') {
          ids.push(link.target);
          ids.push(...getContained(link.target));
        }
      });
      return ids;
    };

    const allChildren = new Set();
    expandedFiles.forEach(fileId => getContained(fileId).forEach(id => allChildren.add(id)));

    // Determine which data nodes are active
    const activeNodes = graphData.nodes.filter(n => {
      const t = (n.type || '').toUpperCase();
      return t === 'FILE' || ALWAYS_VISIBLE.has(t) || ALWAYS_VISIBLE_DB.has(t) || allChildren.has(n.id);
    });
    const activeIds = new Set(activeNodes.map(n => n.id));

    // Build React Flow node objects (no position / parentId yet — layout handles that)
    const flowNodes = activeNodes.map(node => {
      const isDbTable = (node.type || '').toUpperCase() === 'DATABASE_TABLE';
      return {
        id:   node.id,
        type: isDbTable ? 'dbTable' : 'custom',
        data: {
          name:       node.name,
          type:       node.type,
          path:       node.path,
          source:     node.source,
          language:   node.language,
          columns:    node.columns || [],
          isExpanded: expandedFiles.includes(node.id),
          onExpand:   () => onExpandNode(node.id),
        },
        position: { x: 0, y: 0 },
      };
    });

    // Build edge objects with per-type styling
    const seenEdges = new Set();
    const flowEdges = [];
    
    graphData.links
      .filter(link => activeIds.has(link.source) && activeIds.has(link.target))
      .forEach((link, i) => {
        // Deduplication check: prevent redundant duplicate FOREIGN_KEY edges
        if (link.type === 'FOREIGN_KEY') {
          const sig = `${link.source}::${link.target}::${link.sourceHandle || 'none'}::${link.targetHandle || 'none'}`;
          if (seenEdges.has(sig)) return;
          seenEdges.add(sig);
        }

        const style  = resolveEdgeStyle(link.type);
        let hidden = style.hidden ?? false;
        
        // Apply edge type filtering
        if (link.type && activeEdgeTypes[link.type] === false) {
          hidden = true;
        }

        flowEdges.push({
          id:           `e${i}-${link.source}-${link.target}`,
          source:       link.source,
          target:       link.target,
          sourceHandle: link.sourceHandle || null,
          targetHandle: link.targetHandle || null,
          // smoothstep matches ELK's ORTHOGONAL routing visually in Data Map
          type:         isDataMap ? 'smoothstep' : 'default',
          label:        hidden ? undefined : link.type,
          ...style,
          style: { ...(style.style || {}), strokeOpacity: 0.6 },
          hidden,
        });
      });

    // Run compound layout, then commit to state
    buildCompoundLayout(flowNodes, flowEdges, isDataMap).then(({ nodes: ln, edges: le }) => {
      setNodes(ln);
      setEdges(le);
      
      // CRITICAL FIX: Only run global fitView if we are NOT actively focusing on a node.
      // If we are focusing, let the Neighborhood Camera handle it.
      if (!focusNodeId) {
        setTimeout(() => fitView({ duration: 800, padding: 0.12 }), 150);
      }
    });
  }, [graphData, expandedFiles, onExpandNode, fitView, activeEdgeTypes]);

  // ── Smart Hover style logic ───────────────────────────────────────────────
  const displayNodes = React.useMemo(() => {
    if (!hoveredNodeId) return nodes;
    
    const neighbors = new Set([hoveredNodeId]);
    edges.forEach(e => {
      if (!e.hidden) {
        if (e.source === hoveredNodeId) neighbors.add(e.target);
        if (e.target === hoveredNodeId) neighbors.add(e.source);
      }
    });

    return nodes.map(n => {
      if (n.type === 'folderGroup') return n; // Don't fade folders
      const isHovered = neighbors.has(n.id);
      return {
        ...n,
        style: {
          ...n.style,
          opacity: isHovered ? 1 : 0.15,
          transition: 'opacity 0.2s',
          pointerEvents: isHovered ? 'all' : 'none'
        }
      };
    });
  }, [nodes, edges, hoveredNodeId]);

  const displayEdges = React.useMemo(() => {
    if (!hoveredNodeId) return edges;
    
    return edges.map(e => {
      const isConnected = e.source === hoveredNodeId || e.target === hoveredNodeId;
      return {
        ...e,
        style: {
          ...e.style,
          opacity: isConnected ? 1 : 0.05,
          transition: 'opacity 0.2s',
        },
        animated: isConnected ? e.animated : false,
      };
    });
  }, [edges, hoveredNodeId]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeMouseEnter={(evt, node) => {
          if (!node.id.startsWith('__group__')) setHoveredNodeId(node.id);
        }}
        onNodeMouseLeave={() => setHoveredNodeId(null)}
        onNodeClick={(evt, node) => {
          // Only fire for real data nodes, not invisible group containers
          if (!node.id.startsWith('__group__')) onNodeClick(evt, node);
        }}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.04}
        maxZoom={2.5}
        // React Flow needs this to correctly render parent-child positions
        nodesDraggable={true}
      >
        <Background
          color={isDark ? '#334155' : '#cbd5e1'}
          gap={24}
          size={1.5}
          variant="dots"
          className="bg-slate-50 dark:bg-slate-950"
        />

        <Panel position="top-right" className="bg-[#0d1117]/80 backdrop-blur-md border border-[#30363d] p-3 rounded-lg shadow-2xl z-10 m-4 w-48">
          <div className="font-label-caps text-slate-500 uppercase tracking-widest text-[10px] font-bold mb-3">Edge Filters</div>
          <div className="flex flex-col gap-2">
            {Object.keys(activeEdgeTypes).map((type) => {
              const color = {
                RENDERS: '#3b82f6',
                NETWORK_REQUEST: '#a855f7',
                FETCHES: '#8b5cf6',
                CALLS: '#06b6d4',
                USES_HOOK: '#f59e0b',
                IMPORTS: '#94a3b8',
                DEFINES: '#10b981'
              }[type] || '#94a3b8';

              return (
                <label key={type} className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    className="hidden" 
                    checked={activeEdgeTypes[type]} 
                    onChange={() => setActiveEdgeTypes(prev => ({ ...prev, [type]: !prev[type] }))} 
                  />
                  <div className={`w-3 h-3 rounded-full border flex items-center justify-center transition-colors ${activeEdgeTypes[type] ? 'border-transparent' : 'border-[#30363d] bg-transparent'}`} style={{ backgroundColor: activeEdgeTypes[type] ? color : 'transparent' }}>
                    {activeEdgeTypes[type] && <div className="w-1 h-1 bg-[#0b0e14] rounded-full" />}
                  </div>
                  <span className={`text-[11px] font-code-md transition-colors ${activeEdgeTypes[type] ? 'text-slate-200' : 'text-slate-500 group-hover:text-slate-400'}`}>
                    {type}
                  </span>
                </label>
              );
            })}
          </div>
        </Panel>

        <MiniMap
          nodeColor={(n) => {
            if (n.id.startsWith('__group__')) return '#1e293b';
            const palette = {
              FILE: '#334155', CLASS: '#6d28d9', FUNCTION: '#0e7490',
              COMPONENT: '#1d4ed8', HOOK: '#b45309',
              API_ROUTE: '#15803d', API_ENDPOINT: '#15803d', API_CALL: '#7e22ce',
              DATABASE_TABLE: '#be123c',
            };
            return palette[(n.data?.type || '').toUpperCase()] || '#334155';
          }}
          maskColor="rgba(14,20,26,0.85)"
        />

        <Panel
          position="bottom-right"
          style={{ bottom: 'calc(20% + 1.5rem)', right: '1.5rem', position: 'absolute' }}
          className="flex items-center bg-[#0d1117]/80 backdrop-blur-md border border-[#30363d] p-1.5 rounded-full shadow-2xl z-10"
        >
          <button onClick={() => zoomIn()} className="p-2 hover:bg-[#161b22] text-slate-400 hover:text-purple-400 rounded-full transition-all flex items-center justify-center" title="Zoom In">
            <span className="material-symbols-outlined text-[20px]">add</span>
          </button>
          <button onClick={() => zoomOut()} className="p-2 hover:bg-[#161b22] text-slate-400 hover:text-purple-400 rounded-full transition-all flex items-center justify-center" title="Zoom Out">
            <span className="material-symbols-outlined text-[20px]">remove</span>
          </button>
          <div className="w-px h-4 bg-[#30363d] mx-1" />
          <button onClick={() => fitView({ duration: 800, padding: 0.12 })} className="p-2 hover:bg-[#161b22] text-slate-400 hover:text-purple-400 rounded-full transition-all flex items-center justify-center" title="Fit to Screen">
            <span className="material-symbols-outlined text-[20px]">filter_center_focus</span>
          </button>
          <div className="w-px h-4 bg-[#30363d] mx-1" />
          <button 
            onClick={() => setAutoZoomEnabled(!autoZoomEnabled)} 
            className={`p-2 hover:bg-[#161b22] rounded-full transition-all flex items-center justify-center ${autoZoomEnabled ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-400'}`} 
            title={autoZoomEnabled ? "Auto-Zoom on Click: ON" : "Auto-Zoom on Click: OFF"}
          >
            <span className="material-symbols-outlined text-[20px]">{autoZoomEnabled ? 'my_location' : 'location_disabled'}</span>
          </button>
          <button className="p-2 hover:bg-[#161b22] text-slate-400 hover:text-purple-400 rounded-full transition-all flex items-center justify-center" title="Toggle Layout">
            <span className="material-symbols-outlined text-[20px]">account_tree</span>
          </button>
        </Panel>
      </ReactFlow>
    </div>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────
export default function GraphCanvas({ isDataMap = false, ...props }) {
  return (
    <ReactFlowProvider>
      <InnerGraphCanvas {...props} isDataMap={isDataMap} />
    </ReactFlowProvider>
  );
}
