import React, { useState, useEffect } from 'react';
import GraphCanvas from './GraphCanvas';
import { FileCode, Box, Braces, Copy, ChevronDown, Plus, Loader2 } from 'lucide-react';
import './index.css';

const FileTreeNode = ({ node, depth = 0, onFileClick }) => {
  const [isOpen, setIsOpen] = useState(true);
  const paddingLeft = `${depth * 12 + 16}px`;

  if (!node.isDir) {
    let icon = "description";
    let iconColor = "text-slate-500";
    if (node.name.endsWith('.js') || node.name.endsWith('.jsx')) { icon = "javascript"; iconColor = "text-yellow-500"; }
    else if (node.name.endsWith('.py')) { icon = "code"; iconColor = "text-blue-400"; }
    else if (node.name.endsWith('.css')) { icon = "css"; iconColor = "text-blue-400"; }

    return (
      <div onClick={() => onFileClick(node.node)} className="flex items-center gap-2 py-1 text-slate-400 cursor-pointer transition-all duration-200 border-l-2 border-transparent hover:border-purple-500 hover:bg-[#1c2128]" style={{ paddingLeft }}>
        <span className={`material-symbols-outlined text-sm ${iconColor}`} data-icon={icon}>{icon}</span>
        <span className="truncate">{node.name}</span>
      </div>
    );
  }

  return (
    <div>
      <div 
        className="flex items-center gap-2 py-1 text-slate-400 hover:bg-[#1c2128] border-l-2 border-transparent hover:border-[#a855f7] cursor-pointer transition-all duration-200"
        style={{ paddingLeft }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="material-symbols-outlined text-sm" data-icon={isOpen ? "folder_open" : "folder"}>{isOpen ? "folder_open" : "folder"}</span>
        <span className="truncate">{node.name}</span>
      </div>
      {isOpen && Object.values(node.children).map((child, idx) => (
        <FileTreeNode key={idx} node={child} depth={depth + 1} onFileClick={onFileClick} />
      ))}
    </div>
  );
};

const groupDependenciesByFile = (deps, graphNodes) => {
  const grouped = {};

  deps.forEach(dep => {
    const depId = String(dep.node || dep);
    const parts = depId.split('::');
    const file = parts[0];
    
    if (!grouped[file]) {
      grouped[file] = {
        id: file,
        classes: {}, 
        functions: [],
        isFileExplicit: false
      };
    }

    if (parts.length === 1) {
      grouped[file].isFileExplicit = true;
    } else {
      const nodeObj = graphNodes.find(n => n.id === depId) || {};
      const type = (nodeObj.type || '').toLowerCase();
      
      if (type === 'class') {
        const className = parts[1];
        if (!grouped[file].classes[className]) {
          grouped[file].classes[className] = { id: depId, methods: [] };
        }
      } else if (parts.length === 3) {
        const className = parts[1];
        if (!grouped[file].classes[className]) {
          grouped[file].classes[className] = { id: `${file}::${className}`, methods: [] };
        }
        grouped[file].classes[className].methods.push({ id: depId, name: parts[2] });
      } else {
        grouped[file].functions.push({ id: depId, name: parts[1] });
      }
    }
  });
  
  return Object.values(grouped);
};

function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const [graphData, setGraphData] = useState(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [focusNodeId, setFocusNodeId] = useState(null);
  const [downstreamDeps, setDownstreamDeps] = useState([]);
  const [activeTab, setActiveTab] = useState('logic'); // 'logic' | 'data'

  const [terminalOpen, setTerminalOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState([]);

  // Workspace Switcher States
  const [activeProject, setActiveProject] = useState('codesneak');
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [newWorkspacePath, setNewWorkspacePath] = useState('');
  const [importError, setImportError] = useState('');
  const [isBrowsing, setIsBrowsing] = useState(false);

  const [activeTerminalTab, setActiveTerminalTab] = useState('System Logs');
  const [terminalLogs, setTerminalLogs] = useState([
    { time: new Date().toLocaleTimeString([], {hour12: false}), message: 'Initializing Codebase Cartographer...' }
  ]);

  const addLog = (message) => {
    setTerminalLogs(prev => [...prev, { time: new Date().toLocaleTimeString([], {hour12: false}), message }]);
  };

  const fetchGraph = () => {
    setTimeout(() => {
      setIsIndexing(true);
    }, 0);
    fetch('http://127.0.0.1:8000/api/graph')
      .then(res => res.json())
      .then(data => {
        setGraphData(data);
        setIsIndexing(false);
      })
      .catch(err => {
        console.error("Error fetching graph:", err);
        addLog(`Error fetching graph: ${err.message}`);
        setIsIndexing(false);
      });
  };

  useEffect(() => {
    fetchGraph();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBrowse = async () => {
    setIsBrowsing(true);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/system/browse');
      const data = await res.json();
      if (data.path) {
        setNewWorkspacePath(data.path);
        setImportError('');
      }
    } catch (err) {
      console.error(err);
      addLog(`Browse dialog error: ${err.message}`);
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleImportWorkspace = async () => {
    let cleanPath = newWorkspacePath.trim();
    if (!cleanPath) return;
    
    cleanPath = cleanPath.replace(/^"|"$/g, '');
    cleanPath = cleanPath.replace(/\\/g, '/');
    
    setImportError('');
    setIsWorkspaceModalOpen(false); // Close initially to show the massive spinner
    setIsWorkspaceDropdownOpen(false);
    setIsIndexing(true);
    addLog(`Initiating workspace import for: ${cleanPath}`);

    try {
      const res = await fetch('http://127.0.0.1:8000/api/project/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: cleanPath })
      });
      
      if (!res.ok) {
        setIsIndexing(false);
        setIsWorkspaceModalOpen(true); // Re-open on error
        setImportError('Invalid Directory Path.');
        addLog(`Import failed: Invalid Directory Path.`);
        return;
      }
      
      const data = await res.json();
      setActiveProject(data.project_name || cleanPath.split('/').filter(Boolean).pop());
      setNewWorkspacePath('');
      setSelectedNode(null); // Clear selected node state
      setExpandedFiles([]); // Clear old expanded files
      addLog(`Workspace indexing complete. Reloading graph...`);
      
      // Trigger full UI refresh
      fetchGraph();
    } catch (err) {
      console.error(err);
      setIsIndexing(false);
      setIsWorkspaceModalOpen(true);
      setImportError('Failed to connect to server.');
      addLog(`Error importing workspace: ${err.message}`);
    }
  };

  const handleSearch = async (e) => {
    if (e.key === 'Enter' && query) {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        });
        const data = await res.json();
        setSearchResults(data.results);
        addLog(`Semantic search returned ${data.results.length} matches for "${query}"`);
        setActiveTerminalTab('Semantic Search Output');
        setTerminalOpen(true);
      } catch (err) {
        console.error(err);
        addLog(`Semantic search error: ${err.message}`);
      }
    }
  };

  const handleNodeClick = async (event, node) => {
    setSelectedNode(node);
    setFocusNodeId(node.id);
    addLog(`Selected node: ${node.id}`);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/trace?node_id=${encodeURIComponent(node.id)}`);
      if (res.ok) {
        const data = await res.json();
        setDownstreamDeps(data.downstream || []);
        addLog(`Found ${data.downstream?.length || 0} downstream dependencies for ${node.id.split('::').pop()}`);
      } else {
        setDownstreamDeps([]);
        addLog(`Failed to trace node ${node.id}`);
      }
    } catch (err) {
      console.error(err);
      setDownstreamDeps([]);
      addLog(`Error tracing node: ${err.message}`);
    }
  };

  const toggleExpandFile = (fileId) => {
    setExpandedFiles(prev => {
      if (prev.includes(fileId)) {
        addLog(`Collapsing file: ${fileId}`);
        return prev.filter(id => id !== fileId);
      } else {
        addLog(`Expanding file: ${fileId}`);
        return [...prev, fileId];
      }
    });
  };

  const fileTree = React.useMemo(() => {
    if (!graphData || !graphData.nodes) return null;
    const fileNodes = graphData.nodes.filter(n => (n.type || '').toLowerCase() === 'file');
    const root = { name: 'root', children: {}, isDir: true };
    
    const paths = fileNodes.map(n => n.path || n.id.split('::')[0]);
    if (paths.length === 0) return root;
    
    const partsList = paths.map(p => p.split(/[/\\]/));
    let commonLen = 0;
    while (commonLen < partsList[0].length) {
      const val = partsList[0][commonLen];
      if (partsList.every(parts => parts[commonLen] === val)) {
        commonLen++;
      } else {
        break;
      }
    }
    
    fileNodes.forEach(node => {
      const p = node.path || node.id.split('::')[0];
      const parts = p.split(/[/\\]/).slice(commonLen);
      let current = root;
      parts.forEach((part, index) => {
        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            children: {},
            isDir: index < parts.length - 1,
            node: index === parts.length - 1 ? node : null
          };
        }
        current = current.children[part];
      });
    });
    return root;
  }, [graphData]);

  const groupedDependencies = React.useMemo(() => {
    return groupDependenciesByFile(downstreamDeps, graphData?.nodes || []);
  }, [downstreamDeps, graphData]);

  // ── Wormhole: filtered graph data per tab ──────────────────────────────────
  const filteredGraphData = React.useMemo(() => {
    if (!graphData) return null;
    if (activeTab === 'data') {
      const nodes = graphData.nodes.filter(n => (n.type || '').toUpperCase() === 'DATABASE_TABLE');
      const ids = new Set(nodes.map(n => n.id));
      const links = graphData.links.filter(
        l => l.type === 'FOREIGN_KEY' && ids.has(l.source) && ids.has(l.target)
      );
      return { ...graphData, nodes, links };
    }
    // Logic tab: exclude DATABASE_TABLE nodes
    const nodes = graphData.nodes.filter(n => (n.type || '').toUpperCase() !== 'DATABASE_TABLE');
    const ids = new Set(nodes.map(n => n.id));
    const links = graphData.links.filter(
      l => l.type !== 'FOREIGN_KEY' && ids.has(l.source) && ids.has(l.target)
    );
    return { ...graphData, nodes, links };
  }, [graphData, activeTab]);

  // ── Wormhole: DB tables touched by the selected logic node ─────────────────
  const wormholeTables = React.useMemo(() => {
    if (!selectedNode || !graphData || activeTab !== 'logic') return [];
    const nodeId = selectedNode.id;
    const fileId = nodeId.split('::')[0];
    
    const tableIds = new Set();
    const interactionTypes = ['QUERIES', 'IMPORTS', 'USES', 'CALLS'];
    
    graphData.links.forEach(l => {
      if (l.source === nodeId || l.source === fileId) {
        if (!interactionTypes.includes(l.type)) return;
        
        const targetNode = graphData.nodes.find(n => n.id === l.target);
        if (!targetNode) return;
        
        if ((targetNode.type || '').toUpperCase() === 'DATABASE_TABLE') {
          tableIds.add(l.target);
        } else if ((targetNode.type || '').toUpperCase() === 'FILE') {
          // Check if this file contains any database tables
          graphData.links.forEach(l2 => {
            if (l2.source === l.target && l2.type === 'CONTAINS') {
              const subNode = graphData.nodes.find(n => n.id === l2.target);
              if (subNode && (subNode.type || '').toUpperCase() === 'DATABASE_TABLE') {
                tableIds.add(l2.target);
              }
            }
          });
        }
      }
    });
    
    return Array.from(tableIds).map(id => graphData.nodes.find(n => n.id === id));
  }, [selectedNode, graphData, activeTab]);

  // ── Wormhole: logic nodes that use the selected DB table ───────────────────
  const wormholeLogic = React.useMemo(() => {
    if (!selectedNode || !graphData || activeTab !== 'data') return [];
    const tableId = selectedNode.id;
    
    const logicNodes = new Set();
    const interactionTypes = ['QUERIES', 'IMPORTS', 'USES', 'CALLS'];
    
    // Find the schema file containing this table
    const schemaFileId = graphData.links.find(l => l.target === tableId && l.type === 'CONTAINS')?.source;
    
    graphData.links.forEach(l => {
      if (!interactionTypes.includes(l.type)) return;
      
      // Direct link to table
      if (l.target === tableId) {
        const sourceNode = graphData.nodes.find(n => n.id === l.source);
        if (sourceNode && (sourceNode.type || '').toUpperCase() !== 'DATABASE_TABLE') {
          logicNodes.add(l.source);
        }
      } 
      // Link to schema file
      else if (schemaFileId && l.target === schemaFileId) {
        const sourceNode = graphData.nodes.find(n => n.id === l.source);
        if (sourceNode && (sourceNode.type || '').toUpperCase() !== 'DATABASE_TABLE') {
          logicNodes.add(l.source);
        }
      }
    });
    
    return Array.from(logicNodes).map(id => graphData.nodes.find(n => n.id === id));
  }, [selectedNode, graphData, activeTab]);

  const wormholeJump = (nodeId, targetTab) => {
    const node = graphData?.nodes.find(n => n.id === nodeId);
    if (!node) return;
    setActiveTab(targetTab);
    setSelectedNode({ id: node.id, data: node });
    setFocusNodeId(node.id);
    setInspectorOpen(true);
  };

  return (
    <>
      <header className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-inter antialiased tracking-tight docked full-width top-0 flex justify-between items-center px-4 h-12 w-full z-50 fixed">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-purple-500" data-icon="terminal">terminal</span>
          <span className="text-xl font-bold tracking-tighter text-slate-800 dark:text-slate-200">Codesneak</span>
        </div>
        <div className="flex-1 max-w-2xl px-8 hidden md:block">
          <div className="relative group">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-purple-500 transition-colors" data-icon="search">search</span>
            <input 
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-body-sm px-10 py-1.5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 text-slate-800 dark:text-slate-200" 
              placeholder="Semantic Search..." 
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearch}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900">⌘</kbd>
              <kbd className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900">K</kbd>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            className="flex items-center justify-center p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:border-purple-500 dark:hover:border-purple-400 text-slate-500 dark:text-slate-400 hover:text-purple-500 dark:hover:text-purple-400 transition-colors"
            title="Toggle theme"
          >
            <span className="material-symbols-outlined text-[18px]" data-icon={theme === 'dark' ? 'light_mode' : 'dark_mode'}>
              {theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
          </button>

          <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="font-code-md text-body-sm text-slate-600 dark:text-slate-400">main</span>
          </div>
          <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 hover:text-purple-500 dark:hover:text-purple-400 cursor-pointer transition-colors" data-icon="settings">settings</span>
        </div>
      </header>
      
      <div className="flex h-screen pt-12 overflow-hidden">
        <aside className="bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 docked left-0 h-full w-[280px] flex flex-col hidden md:flex shrink-0">
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
            
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 relative">
              <span className="font-label-caps text-slate-500 uppercase block mb-2 text-[10px] tracking-widest font-bold">Active Workspace</span>
              <div 
                className="flex items-center justify-between bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 cursor-pointer hover:border-purple-500 dark:hover:border-purple-400 transition-colors"
                onClick={() => setIsWorkspaceDropdownOpen(!isWorkspaceDropdownOpen)}
              >
                <div className="flex items-center gap-2">
                  <Box size={14} className="text-purple-400" />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{activeProject}</span>
                </div>
                <ChevronDown size={14} className="text-slate-500" />
              </div>
              
              {isWorkspaceDropdownOpen && (
                <div className="absolute top-[72px] left-4 right-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md shadow-2xl z-50 overflow-hidden">
                  <div 
                    className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                    onClick={() => {
                      setIsWorkspaceDropdownOpen(false);
                      setIsWorkspaceModalOpen(true);
                    }}
                  >
                    <Plus size={14} className="text-emerald-400" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Add Local Directory...</span>
                  </div>
                </div>
              )}
            </div>

            <div className="py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="px-4 mb-2 flex justify-between items-center group cursor-pointer">
                <span className="font-inter text-sm uppercase tracking-widest text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200">Semantic Matches</span>
                <span className="material-symbols-outlined text-sm text-slate-500" data-icon="expand_more">expand_more</span>
              </div>
              <nav className="flex flex-col">
                {searchResults.length === 0 ? (
                  <div className="text-slate-500 px-4 py-3 text-xs">No results yet. Try a search!</div>
                ) : (
                  searchResults.map((id, idx) => (
                    <div key={idx} onClick={() => {
                      const node = graphData?.nodes.find(n => n.id === id);
                      if (node) handleNodeClick(null, { id: node.id, data: node });
                    }} className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 border-l-2 border-purple-500 px-4 py-3 flex items-center gap-3 cursor-pointer">
                      <span className="material-symbols-outlined text-purple-500" data-icon="search_check">search_check</span>
                      <span className="font-body-sm text-xs truncate" title={id.split('::').pop()}>{id.split('::').pop()}</span>
                    </div>
                  ))
                )}
              </nav>
            </div>
            
            <div className="py-4 flex-1">
              <div className="px-4 mb-2 flex justify-between items-center group cursor-pointer">
                <span className="font-inter text-sm uppercase tracking-widest text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200">Project Explorer</span>
                <div className="flex gap-2">
                  <span className="material-symbols-outlined text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200" data-icon="create_new_folder">create_new_folder</span>
                  <span className="material-symbols-outlined text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200" data-icon="note_add">note_add</span>
                </div>
              </div>
              <div className="font-code-md text-body-sm space-y-1">
                {fileTree ? (
                  Object.values(fileTree.children).map((child, idx) => (
                    <FileTreeNode key={idx} node={child} onFileClick={(nodeObj) => {
                      if (nodeObj) {
                        handleNodeClick(null, { id: nodeObj.id, data: nodeObj });
                      }
                    }} />
                  ))
                ) : (
                  <div className="px-4 text-xs text-slate-500">Loading tree...</div>
                )}
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 hover:text-purple-500 dark:hover:text-purple-400 transition-colors cursor-pointer text-xs" onClick={() => setInspectorOpen(!inspectorOpen)}>
                <span className="material-symbols-outlined text-sm" data-icon="account_tree">account_tree</span>
                <span>Node Inspector</span>
              </div>
            </div>
          </div>
        </aside>
        
        <div className="flex-1 relative bg-slate-50 dark:bg-slate-950 dot-grid overflow-hidden flex flex-col" id="canvas-container">

          {/* ── Dual-Tab Bar ──────────────────────────────────────────── */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-full p-1 shadow-2xl">
            <button
              onClick={() => { setActiveTab('logic'); setSelectedNode(null); setFocusNodeId(null); }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                activeTab === 'logic'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">bolt</span>
              Logic Map
            </button>
            <button
              onClick={() => { setActiveTab('data'); setSelectedNode(null); setFocusNodeId(null); }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                activeTab === 'data'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/50'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">database</span>
              Data Map
            </button>
          </div>

          <div className="flex-1 w-full h-full relative" style={{ height: "100%", width: "100%" }}>
            {isIndexing && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-sm">
                <Loader2 size={48} className="text-purple-500 animate-spin mb-4" />
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">Parsing AST &amp; Generating Embeddings...</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Please wait while the cartographer indexes the codebase.</p>
              </div>
            )}
            {filteredGraphData ? <GraphCanvas key={activeTab} graphData={filteredGraphData} onNodeClick={handleNodeClick} expandedFiles={expandedFiles} onExpandNode={toggleExpandFile} focusNodeId={focusNodeId} isDataMap={activeTab === 'data'} /> : <div className="p-5 text-slate-500">Loading Map... Make sure API is running.</div>}
          </div>

          <div className={`bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-col shrink-0 w-full z-20 absolute bottom-0 left-0 transition-all duration-300 ${terminalOpen ? 'h-[25%]' : 'h-9'}`}>
            <div className="flex items-center justify-between px-4 h-9 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center gap-4 h-full">
                <span className="font-inter text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2 cursor-pointer" onClick={() => setTerminalOpen(!terminalOpen)}>
                  <span className="material-symbols-outlined text-sm text-purple-400" data-icon="terminal">terminal</span>
                  AI Terminal &amp; Logs
                </span>
                <div className="flex h-full ml-2">
                  <button 
                    onClick={() => {setActiveTerminalTab('Agent Reasoning'); setTerminalOpen(true);}}
                    className={`text-xs px-4 flex items-center mt-1 transition-colors ${activeTerminalTab === 'Agent Reasoning' ? 'text-slate-800 dark:text-slate-200 bg-slate-200 dark:bg-slate-900 border-x border-t border-slate-300 dark:border-slate-800 rounded-t-md' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 bg-transparent'}`}
                  >Agent Reasoning</button>
                  <button 
                    onClick={() => {setActiveTerminalTab('System Logs'); setTerminalOpen(true);}}
                    className={`text-xs px-4 flex items-center mt-1 transition-colors ${activeTerminalTab === 'System Logs' ? 'text-slate-800 dark:text-slate-200 bg-slate-200 dark:bg-slate-900 border-x border-t border-slate-300 dark:border-slate-800 rounded-t-md' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 bg-transparent'}`}
                  >System Logs</button>
                  <button 
                    onClick={() => {setActiveTerminalTab('Semantic Search Output'); setTerminalOpen(true);}}
                    className={`text-xs px-4 flex items-center mt-1 transition-colors ${activeTerminalTab === 'Semantic Search Output' ? 'text-slate-800 dark:text-slate-200 bg-slate-200 dark:bg-slate-900 border-x border-t border-slate-300 dark:border-slate-800 rounded-t-md' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 bg-transparent'}`}
                  >Semantic Search Output</button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <button onClick={() => setTerminalOpen(!terminalOpen)} className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors flex items-center justify-center"><span className="material-symbols-outlined text-[16px]" data-icon={terminalOpen ? "keyboard_arrow_down" : "keyboard_arrow_up"}>{terminalOpen ? "keyboard_arrow_down" : "keyboard_arrow_up"}</span></button>
                <button onClick={() => setTerminalOpen(false)} className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors flex items-center justify-center"><span className="material-symbols-outlined text-[16px]" data-icon="close">close</span></button>
              </div>
            </div>
            {terminalOpen && (
              <div className="flex-1 overflow-auto p-4 font-code-md text-xs text-slate-700 dark:text-slate-400 custom-scrollbar">
                {activeTerminalTab === 'System Logs' && terminalLogs.map((log, idx) => (
                  <div key={idx} className="flex gap-3 mb-2">
                    <span className="text-emerald-600 dark:text-emerald-500 shrink-0">{log.time}</span>
                    <span className="text-purple-600 dark:text-purple-400 shrink-0">[System]</span>
                    <span className="text-slate-800 dark:text-slate-300">{log.message}</span>
                  </div>
                ))}
                {activeTerminalTab === 'Agent Reasoning' && (
                  <div className="flex gap-3 mb-2">
                    <span className="text-purple-600 dark:text-purple-400 shrink-0">[Agent]</span>
                    <span className="text-slate-800 dark:text-slate-300">Awaiting user input. Standing by to cluster Architecture Domains.</span>
                  </div>
                )}
                {activeTerminalTab === 'Semantic Search Output' && (
                  <div className="flex flex-col gap-2">
                    {searchResults.length === 0 ? <span className="text-slate-500">No semantic search executed yet.</span> : null}
                    {searchResults.map((res, idx) => (
                      <div key={idx} className="flex gap-3">
                        <span className="text-emerald-600 dark:text-emerald-500 shrink-0">Match {idx + 1}</span>
                        <span className="text-slate-800 dark:text-slate-300 font-mono text-xs">{res}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        <aside className={`bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 docked right-0 h-full w-[360px] flex-col shrink-0 transition-all ${inspectorOpen ? 'flex' : 'hidden'}`}>
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-inter text-sm uppercase tracking-widest text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-purple-500" data-icon="account_tree">account_tree</span>
                Node Inspector
              </h3>
              <button onClick={() => setInspectorOpen(false)} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                <span className="material-symbols-outlined text-sm" data-icon="close">close</span>
              </button>
            </div>
            {selectedNode ? (
              <div className="space-y-4">
                <div className="p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-500">Node ID</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setCodeModalOpen(true)} className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded hover:bg-purple-500/30 transition-colors">View Code</button>
                      <span className="text-xs text-purple-400 font-code-md" style={{maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}} title={selectedNode.id}>{selectedNode.id}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-slate-500">Type</span>
                    <span className="text-xs text-slate-800 dark:text-slate-300 font-bold uppercase tracking-widest">{selectedNode.data?.type || 'Unknown'}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Path</span>
                    <span className="font-code-md text-xs text-slate-800 dark:text-slate-200" style={{wordBreak: 'break-all'}}>{selectedNode.data?.path || selectedNode.path || 'N/A'}</span>
                  </div>
                  {(selectedNode.type === 'DATABASE_TABLE' || selectedNode.data?.type === 'DATABASE_TABLE') && (selectedNode.columns || selectedNode.data?.columns)?.length > 0 && (
                    <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold tracking-widest uppercase mb-1">Schema Columns</span>
                      <div className="flex flex-col gap-1.5 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                        {(selectedNode.columns || selectedNode.data?.columns)?.map((col, idx) => (
                          <div key={idx} className="flex justify-between items-center bg-white dark:bg-slate-950 p-1.5 rounded border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              {col.isPrimaryKey && <span className="material-symbols-outlined text-[13px] text-amber-500 dark:text-amber-400" title="Primary Key">key</span>}
                              {col.isForeignKey && <span className="material-symbols-outlined text-[13px] text-blue-500 dark:text-blue-400" title="Foreign Key">link</span>}
                              {!col.isPrimaryKey && !col.isForeignKey && <span className="material-symbols-outlined text-[13px] text-slate-400 dark:text-slate-500">data_object</span>}
                              <span className="text-xs font-mono text-slate-800 dark:text-slate-300 truncate" title={col.name}>{col.name}</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/50 px-1.5 py-0.5 rounded ml-2 whitespace-nowrap">{col.type}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Last Modified</span>
                    <span className="text-xs text-slate-800 dark:text-slate-300">Just now</span>
                  </div>

                  {/* ── Wormhole: Logic → Data ──────────────────────────── */}
                  {wormholeTables.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                      <span className="text-[10px] font-bold tracking-widest uppercase text-rose-500 dark:text-rose-400 flex items-center gap-1.5 mb-2">
                        <span className="material-symbols-outlined text-[13px]">database</span>
                        Database Side-Effects
                      </span>
                      <div className="flex flex-col gap-1.5">
                        {wormholeTables.map(tbl => (
                          <button
                            key={tbl.id}
                            onClick={() => wormholeJump(tbl.id, 'data')}
                            className="flex items-center justify-between w-full text-left px-2.5 py-1.5 rounded bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/40 hover:border-rose-500/60 dark:hover:border-rose-500/60 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-all group"
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <span className="material-symbols-outlined text-[13px] text-rose-500 dark:text-rose-400">table</span>
                              <span className="text-xs text-rose-700 dark:text-rose-300 font-mono truncate">{tbl.name}</span>
                            </div>
                            <span className="material-symbols-outlined text-[13px] text-slate-400 dark:text-slate-500 group-hover:text-rose-500 dark:group-hover:text-rose-400 transition-colors shrink-0">arrow_forward</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Wormhole: Data → Logic ──────────────────────────── */}
                  {wormholeLogic.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                      <span className="text-[10px] font-bold tracking-widest uppercase text-purple-600 dark:text-purple-400 flex items-center gap-1.5 mb-2">
                        <span className="material-symbols-outlined text-[13px]">bolt</span>
                        Used by Backend Logic
                      </span>
                      <div className="flex flex-col gap-1.5">
                        {wormholeLogic.map(ln => (
                          <button
                            key={ln.id}
                            onClick={() => wormholeJump(ln.id, 'logic')}
                            className="flex items-center justify-between w-full text-left px-2.5 py-1.5 rounded bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-900/40 hover:border-purple-500/60 dark:hover:border-purple-500/60 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-all group"
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <span className="material-symbols-outlined text-[13px] text-purple-500 dark:text-purple-400">code</span>
                              <span className="text-xs text-purple-700 dark:text-purple-300 font-mono truncate">{ln.name || ln.id.split('::').pop()}</span>
                            </div>
                            <span className="material-symbols-outlined text-[13px] text-slate-400 dark:text-slate-500 group-hover:text-purple-500 dark:group-hover:text-purple-400 transition-colors shrink-0">arrow_forward</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-center">
                  <span className="text-xs text-slate-500">Select a node to inspect</span>
                </div>
              </div>
            )}
          </div>
          
          <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
            <span className="font-label-caps text-slate-500 uppercase block mb-3 text-xs tracking-widest font-bold">Downstream Deps</span>
            <div className="space-y-3">
              {groupedDependencies.length === 0 ? (
                <div className="text-xs text-slate-500 p-3 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded bg-white dark:bg-slate-950">No downstream dependencies</div>
              ) : (
                groupedDependencies.map(fileGroup => {
                  const fileNode = graphData?.nodes.find(n => n.id === fileGroup.id) || {};
                  const filename = fileGroup.id.split(/[/\\]/).pop();
                  const relPath = fileGroup.id.split(/[/\\]/).slice(-3).join('/');

                  return (
                    <div key={fileGroup.id} className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm">
                      <div 
                        className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                        onClick={() => {
                           if (fileNode.id) handleNodeClick(null, { id: fileNode.id, data: fileNode });
                        }}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <FileCode size={14} className="text-slate-500 dark:text-slate-400" />
                            <span className="text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors truncate font-mono" title={filename}>{filename}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 pl-6 mt-0.5 truncate max-w-[200px]" title={fileGroup.id}>{relPath}</div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(fileGroup.id); addLog(`Copied path to clipboard: ${fileGroup.id}`); }} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-all" title="Copy File Path">
                          <Copy size={12} />
                        </button>
                      </div>
                      
                      <div className="py-2">
                        {Object.entries(fileGroup.classes).map(([className, classObj]) => {
                           const cNode = graphData?.nodes.find(n => n.id === classObj.id) || {};
                           return (
                             <div key={className} className="mb-1">
                               <div 
                                 className="flex items-center gap-2 pl-4 pr-3 py-1.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 group transition-colors"
                                 onClick={() => {
                                    if (cNode.id) handleNodeClick(null, { id: cNode.id, data: cNode });
                                 }}
                               >
                                 <Box size={13} className="text-emerald-500 dark:text-emerald-400" />
                                 <span className="text-xs font-semibold text-slate-800 dark:text-slate-300 group-hover:text-purple-600 dark:group-hover:text-purple-400 font-mono">{className}</span>
                               </div>
                               
                               {classObj.methods.map(method => {
                                 const mNode = graphData?.nodes.find(n => n.id === method.id) || {};
                                 return (
                                   <div 
                                     key={method.id} 
                                     className="flex items-center gap-2 pl-8 pr-3 py-1 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 group transition-colors"
                                     onClick={() => {
                                        if (mNode.id) handleNodeClick(null, { id: mNode.id, data: mNode });
                                     }}
                                   >
                                     <Braces size={11} className="text-yellow-600/70 dark:text-yellow-500/70" />
                                     <span className="text-xs text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 font-mono">{method.name}</span>
                                   </div>
                                 );
                               })}
                             </div>
                           );
                        })}

                        {fileGroup.functions.map(func => {
                           const fNode = graphData?.nodes.find(n => n.id === func.id) || {};
                           return (
                             <div 
                               key={func.id} 
                               className="flex items-center gap-2 pl-4 pr-3 py-1.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 group transition-colors"
                               onClick={() => {
                                  if (fNode.id) handleNodeClick(null, { id: fNode.id, data: fNode });
                               }}
                             >
                               <Braces size={13} className="text-yellow-600 dark:text-yellow-400" />
                               <span className="text-xs font-semibold text-slate-800 dark:text-slate-300 group-hover:text-purple-600 dark:group-hover:text-purple-400 font-mono">{func.name}</span>
                             </div>
                           );
                        })}
                        
                        {Object.keys(fileGroup.classes).length === 0 && fileGroup.functions.length === 0 && (
                          <div className="pl-6 py-1 text-[10px] text-slate-500 dark:text-slate-600 italic">Whole file imported</div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          
          <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <button 
              onClick={() => {
                const name = selectedNode?.data?.name || selectedNode?.id || 'Unknown';
                addLog(`Initiating AI Refactor for ${name}...`);
                setActiveTerminalTab('Agent Reasoning');
                setTerminalOpen(true);
              }} 
              className="w-full bg-purple-500 hover:bg-purple-600 text-white py-2 rounded font-inter text-xs font-semibold transition-all shadow-lg shadow-purple-500/10 flex items-center justify-center gap-2 active:opacity-80"
            >
              <span className="material-symbols-outlined text-sm" data-icon="rocket_launch">rocket_launch</span>
              Refactor Node
            </button>
          </div>
        </aside>
      </div>

      {isWorkspaceModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-md rounded-xl flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-t-xl">
              <span className="text-slate-800 dark:text-slate-200 font-inter font-semibold text-base flex items-center gap-2">
                <Box size={16} className="text-purple-400" />
                Import Local Project
              </span>
              <button onClick={() => setIsWorkspaceModalOpen(false)} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                <span className="material-symbols-outlined" data-icon="close">close</span>
              </button>
            </div>
            <div className="p-6">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Directory Path</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newWorkspacePath}
                  onChange={(e) => { setNewWorkspacePath(e.target.value); setImportError(''); }}
                  className={`flex-1 bg-slate-50 dark:bg-slate-950 border ${importError ? 'border-red-500' : 'border-slate-200 dark:border-slate-800'} rounded-md text-sm text-slate-800 dark:text-slate-200 px-4 py-2.5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600`}
                  placeholder="Enter absolute path... e.g. C:/Users/Projects/MyApp"
                  autoFocus
                />
                <button 
                  onClick={handleBrowse} 
                  disabled={isBrowsing}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-sm font-semibold text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isBrowsing ? 'Opening...' : 'Browse...'}
                </button>
              </div>
              {importError && <p className="text-red-500 text-xs font-semibold mt-2">{importError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-b-xl">
              <button onClick={() => setIsWorkspaceModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">Cancel</button>
              <button onClick={handleImportWorkspace} className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded text-sm font-semibold transition-all shadow-lg shadow-purple-500/20 active:opacity-80">Import &amp; Analyze</button>
            </div>
          </div>
        </div>
      )}
      
      {codeModalOpen && selectedNode && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-[80%] h-[80%] rounded-lg flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-t-lg">
              <span className="text-slate-800 dark:text-slate-200 font-code-md text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-400" data-icon="code">code</span>
                {selectedNode.data?.name || 'Code View'}
              </span>
              <button onClick={() => setCodeModalOpen(false)} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                <span className="material-symbols-outlined" data-icon="close">close</span>
              </button>
            </div>
            <div className="flex-1 p-6 overflow-auto text-sm text-slate-800 dark:text-[#e6edf3] font-code-md whitespace-pre-wrap custom-scrollbar bg-slate-50 dark:bg-slate-950">
              {selectedNode.data?.source || "No source code available for this node in the graph metadata."}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
