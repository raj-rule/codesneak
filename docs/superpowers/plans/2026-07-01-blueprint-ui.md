# Blueprint & Wireframe UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Codebase Cartographer's user interface to a clean, flat blueprint and wireframe style (resembling Excalidraw or TLDraw) with dual light/dark theme support, removing all linear and radial gradients.

**Architecture:** Use React state for theme selection, dynamically updating the document root element's class list to toggle Tailwind's native `dark:` modifier. Style graph canvas elements, edges, nodes, and side panels using flat backgrounds, sharp slate borders, and solid color indicators.

**Tech Stack:** React, Tailwind CSS, React Flow (`@xyflow/react`), Lucide React.

## Global Constraints
*   Do not use background-color gradients (no `bg-gradient-to-...`, no `radial-gradient` backgrounds on cards).
*   Keep borders thin and sharp (e.g. `border border-slate-200 dark:border-slate-800`).
*   All code symbols, lists, and values must use monospaced typography (`font-mono` / `font-code-md`).
*   Verify changes by running the React dev server locally.

---

### Task 1: Global Theme State & Toggle in App.jsx

**Files:**
*   Modify: `frontend/src/App.jsx`

**Interfaces:**
*   Produces: Global document class modification (toggling `dark` on HTML root) and header theme toggle button.

- [ ] **Step 1: Write code changes for App.jsx**
    Modify [App.jsx](file:///c:/Users/raj/OneDrive/Desktop/codesneak/frontend/src/App.jsx) to add the theme state, local storage synchronization, and a header toggle button.
    Replace the header topbar search section to include a toggle button using Lucide icons.
    
    Code changes:
    Add theme state and `useEffect` near line 99:
    ```javascript
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

    useEffect(() => {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    ```

    In the JSX return (inside the header navigation panel):
    ```javascript
    // Near logo and browse button
    <button 
      onClick={toggleTheme} 
      className="p-2 ml-4 rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
      title="Toggle Theme"
    >
      {theme === 'dark' ? (
        <span className="material-symbols-outlined text-[18px]">light_mode</span>
      ) : (
        <span className="material-symbols-outlined text-[18px]">dark_mode</span>
      )}
    </button>
    ```

    Update sidebar and main panels to support `dark:` styles:
    *   Change sidebar `className` to: `"w-[280px] bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-4 overflow-y-auto"`
    *   Change inspector `className` to: `"w-[360px] bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-4 overflow-y-auto"`
    *   Change topbar `className` to: `"h-[60px] bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center px-5 gap-4 z-10"`
    *   Change terminal pane `className` to: `"bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 overflow-hidden"`
    *   Change terminal header tabs styling: Remove gradients and use flat `bg-slate-200 dark:bg-slate-900` for active tab, `bg-transparent` for inactive.

- [ ] **Step 2: Commit Task 1**
    ```bash
    git add frontend/src/App.jsx
    git commit -m "feat: add light/dark theme toggle and update panels to flat wireframe layout"
    ```

---

### Task 2: Node Design Update in CustomNode.jsx

**Files:**
*   Modify: `frontend/src/CustomNode.jsx`

**Interfaces:**
*   Consumes: Flat styles and type properties on graph nodes.
*   Produces: Flat, wireframe-styled custom nodes with type-specific left border stripes.

- [ ] **Step 1: Write node configuration changes**
    Modify [CustomNode.jsx](file:///c:/Users/raj/OneDrive/Desktop/codesneak/frontend/src/CustomNode.jsx) to rewrite `NODE_CONFIG` to remove gradients and use flat styling with left border stripes.
    
    Code changes:
    ```javascript
    const NODE_CONFIG = {
      FILE: { icon: FileCode, label: 'File', accent: '#64748b', borderClass: 'border-l-4 border-l-slate-500' },
      CLASS: { icon: Box, label: 'Class', accent: '#8b5cf6', borderClass: 'border-l-4 border-l-violet-500' },
      FUNCTION: { icon: Braces, label: 'Function', accent: '#06b6d4', borderClass: 'border-l-4 border-l-cyan-500' },
      COMPONENT: { icon: Layout, label: 'Component', accent: '#3b82f6', borderClass: 'border-l-4 border-l-blue-500' },
      HOOK: { icon: Zap, label: 'Hook', accent: '#f59e0b', borderClass: 'border-l-4 border-l-amber-500' },
      API_ROUTE: { icon: Server, label: 'Route', accent: '#10b981', borderClass: 'border-l-4 border-l-emerald-500' },
      API_ENDPOINT: { icon: Server, label: 'Endpoint', accent: '#10b981', borderClass: 'border-l-4 border-l-emerald-500' },
      API_CALL: { icon: Wifi, label: 'API Call', accent: '#a855f7', borderClass: 'border-l-4 border-l-purple-500' },
      DATABASE_TABLE: { icon: Database, label: 'Table', accent: '#f43f5e', borderClass: 'border-l-4 border-l-rose-500' },
    };
    ```

    Update JSX return structure in `CustomNode` to render a flat, minimalist box:
    ```javascript
    export default function CustomNode({ data }) {
      const cfg = getConfig(data.type);
      const Icon = cfg.icon;
      const isFile = (data.type || '').toUpperCase() === 'FILE';
      
      return (
        <div className={`w-[220px] rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ${cfg.borderClass} shadow-sm overflow-hidden flex flex-col`}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <Icon size={14} style={{ color: cfg.accent }} />
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{cfg.label}</span>
            </div>
            {data.language && (
              <span className="text-[9px] font-mono px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">{data.language}</span>
            )}
          </div>
          <div className="p-3 flex flex-col gap-1 overflow-hidden">
            <span className="text-xs font-mono font-medium text-slate-800 dark:text-slate-200 truncate">{data.name}</span>
            {isFile && data.path && (
              <span className="text-[9px] text-slate-400 truncate">{data.path}</span>
            )}
          </div>
          
          <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-slate-400 dark:!bg-slate-600 border border-white dark:border-slate-900" />
          <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-slate-400 dark:!bg-slate-600 border border-white dark:border-slate-900" />
        </div>
      );
    }
    ```

- [ ] **Step 2: Commit Task 2**
    ```bash
    git add frontend/src/CustomNode.jsx
    git commit -m "feat: redesign custom nodes for flat outline/wireframe style"
    ```

---

### Task 3: Database Schema Node Redesign in DatabaseNode.jsx

**Files:**
*   Modify: `frontend/src/DatabaseNode.jsx`

**Interfaces:**
*   Consumes: Flat styles and column properties.
*   Produces: Flat, wireframe-styled database schema tables with no gradient elements.

- [ ] **Step 1: Write code updates for DatabaseNode.jsx**
    Modify [DatabaseNode.jsx](file:///c:/Users/raj/OneDrive/Desktop/codesneak/frontend/src/DatabaseNode.jsx) to replace the glowing table card and column rows with a clean, high-contrast grid design.
    
    Code changes:
    Replace `ColumnRow` function:
    ```javascript
    function ColumnRow({ col }) {
      const isPK = col.isPrimaryKey;
      const isFK = col.isForeignKey;

      let badgeBg = 'transparent';
      let badgeText = '';
      let badgeColor = '';
      if (isPK) { badgeBg = 'rgba(245, 158, 11, 0.1)'; badgeText = 'PK'; badgeColor = '#f59e0b'; }
      else if (isFK) { badgeBg = 'rgba(59, 130, 246, 0.1)'; badgeText = 'FK'; badgeColor = '#3b82f6'; }

      return (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 bg-transparent relative min-h-[28px] gap-2">
          <Handle
            type="target"
            position={Position.Left}
            id={col.name}
            className={`w-2 h-2 !bg-slate-400 dark:!bg-slate-600 border border-white dark:border-slate-900`}
            style={{ left: -4 }}
          />

          <div className="flex items-center gap-1.5 overflow-hidden flex-1">
            {(isPK || isFK) && (
              <span 
                className="text-[9px] font-bold px-1 py-0.5 rounded font-mono" 
                style={{ backgroundColor: badgeBg, color: badgeColor }}
              >
                {badgeText}
              </span>
            )}
            <span className={`text-[11px] font-mono truncate ${isPK ? 'text-amber-600 dark:text-amber-400' : isFK ? 'text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}>
              {col.name}
            </span>
          </div>

          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 rounded">
            {col.type || 'Field'}
          </span>
        </div>
      );
    }
    ```

    Update `DatabaseNode` container style:
    ```javascript
    export default function DatabaseNode({ data }) {
      const columns = data.columns || [];
      return (
        <div className="w-[220px] rounded-md bg-white dark:bg-slate-900 border-2 border-rose-500/50 dark:border-rose-500/40 shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-rose-100 dark:border-rose-950/40 bg-rose-50 dark:bg-rose-950/20">
            <span className="material-symbols-outlined text-[16px] text-rose-500">database</span>
            <span className="text-xs font-mono font-bold text-rose-700 dark:text-rose-400 truncate">{data.name}</span>
          </div>
          <div className="flex flex-col bg-white dark:bg-slate-900">
            {columns.map((col, idx) => (
              <ColumnRow key={idx} col={col} />
            ))}
          </div>
        </div>
      );
    }
    ```

- [ ] **Step 2: Commit Task 3**
    ```bash
    git add frontend/src/DatabaseNode.jsx
    git commit -m "feat: update DatabaseNode style for a clean, non-gradient schema layout"
    ```

---

### Task 4: Connectors, Bounding Boxes & Background Grid in GraphCanvas.jsx

**Files:**
*   Modify: `frontend/src/GraphCanvas.jsx`
*   Modify: `frontend/src/FolderGroupNode.jsx`

**Interfaces:**
*   Consumes: Active theme and layout parameters.
*   Produces: Clean background grids, custom drafting edge styles, and simplified folder grouping.

- [ ] **Step 1: Write grid and edge styling updates in GraphCanvas.jsx**
    Modify [GraphCanvas.jsx](file:///c:/Users/raj/OneDrive/Desktop/codesneak/frontend/src/GraphCanvas.jsx) to clean up `resolveEdgeStyle` and update the background dot grid to support light/dark modes.
    
    Code changes:
    Simplify edge lines in `resolveEdgeStyle`:
    *   `NETWORK_REQUEST`: Purple dashed (`#a855f7`), `strokeWidth: 2`.
    *   `RENDERS`: Solid blue (`#3b82f6`), `strokeWidth: 1.5`.
    *   `USES_HOOK`: Dashed amber (`#f59e0b`), `strokeWidth: 1.5`.
    *   `FETCHES`: Dashed violet (`#8b5cf6`), `strokeWidth: 1.5`.
    *   `DEFINES`: Solid emerald (`#10b981`), `strokeWidth: 1.5`.
    *   `CALLS`: Solid cyan (`#06b6d4`), `strokeWidth: 1.5`.
    *   `IMPORTS`: Solid slate (`#94a3b8`), `strokeWidth: 1`.
    *   `FOREIGN_KEY`: Dashed rose (`#f43f5e`), `strokeWidth: 1.8`, custom marker end.

    Configure dynamic grid lines in GraphCanvas render method:
    ```javascript
    // Inside GraphCanvas component:
    const isDark = document.documentElement.classList.contains('dark');
    
    // Near the return:
    <Background 
      color={isDark ? '#334155' : '#cbd5e1'} 
      gap={24} 
      size={1.5} 
      variant="dots" 
      className="bg-slate-50 dark:bg-slate-950" 
    />
    ```

- [ ] **Step 2: Update FolderGroupNode.jsx**
    Simplify [FolderGroupNode.jsx](file:///c:/Users/raj/OneDrive/Desktop/codesneak/frontend/src/FolderGroupNode.jsx) for a flat, minimalist design.
    ```javascript
    export default function FolderGroupNode({ data }) {
      const themeColor = data.themeColor || '#64748b'; 
      return (
        <div className="w-full h-full bg-slate-50/20 dark:bg-slate-900/10 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg flex flex-col">
          <div className="font-mono text-[9px] font-bold px-3 py-1 flex items-center gap-1 border-b border-dashed border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/40 rounded-t-lg text-slate-500">
            <span className="material-symbols-outlined text-[12px]">folder</span>
            {data.label}
          </div>
        </div>
      );
    }
    ```

- [ ] **Step 3: Commit Task 4**
    ```bash
    git add frontend/src/GraphCanvas.jsx frontend/src/FolderGroupNode.jsx
    git commit -m "feat: simplify connections and background grid to wireframe scheme"
    ```

---

### Task 5: Core Variables and Globals Clean Up in index.css

**Files:**
*   Modify: `frontend/src/index.css`

**Interfaces:**
*   Produces: Clean, light/dark variables that avoid cyber-gradient aesthetics.

- [ ] **Step 1: Reconfigure root variables in index.css**
    Modify [index.css](file:///c:/Users/raj/OneDrive/Desktop/codesneak/frontend/src/index.css) to set clean, flat blueprint-style variables.
    
    Code changes:
    Replace the `:root` variables:
    ```css
    :root {
      --bg-dark: #ffffff;
      --bg-panel: #f8fafc;
      --bg-panel-hover: #f1f5f9;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --accent: #2563eb;
      --border-color: #cbd5e1;
      --font-family: 'Inter', system-ui, sans-serif;
    }

    .dark {
      --bg-dark: #0a0f1d;
      --bg-panel: #111827;
      --bg-panel-hover: #1f2937;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --accent: #3b82f6;
      --border-color: #334155;
    }
    ```

- [ ] **Step 2: Commit Task 5**
    ```bash
    git add frontend/src/index.css
    git commit -m "style: replace cyber-glowing CSS variables with clean drafting paper variables"
    ```
