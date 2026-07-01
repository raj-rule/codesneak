# Design Spec: Drafting Paper & Wireframe UI Redesign

**Date**: 2026-07-01  
**Status**: Approved  
**Topic**: Transition Codebase Cartographer from a glowing gradient "cyber" theme to a professional, high-contrast, blueprint-like "drafting paper/wireframe" UI with light/dark dual-theme support.

---

## 🎯 Goal
Improve the user interface of Codebase Cartographer. 
*   **Remove gradients**: Replace glowing gradient buttons, cards, and backgrounds with flat, clean, professional borders and solid colors.
*   **Sketch/Blueprint vibe**: Recreate the look of technical schematics or wireframe software (e.g., Excalidraw, TLDraw).
*   **Dual-Theme support**: Provide both Light and Dark modes with a clean toggle in the header.

---

## 🎨 Visual System Specification

### 1. Colors & Themes

| Element | Light Mode | Dark Mode |
| :--- | :--- | :--- |
| **Main Background** | `#ffffff` (Pure White) | `#0a0f1d` (Deep Charcoal) |
| **Panel Background** | `#f8fafc` (Slate 50) | `#111827` (Slate 900) |
| **Primary Borders** | `#cbd5e1` (Slate 300) | `#334155` (Slate 700) |
| **Grid Lines** | `#f1f5f9` (Slate 100) / `#e2e8f0` (Slate 200) | `#1e293b` (Slate 800) |
| **Text Primary** | `#0f172a` (Slate 900) | `#f1f5f9` (Slate 100) |
| **Text Muted** | `#64748b` (Slate 500) | `#94a3b8` (Slate 400) |

### 2. Node Indicators (Left Border Accent)

To distinguish node types without background gradients, we use a solid left border strip (4px wide) on a flat card background:
*   `FILE`: Slate (`#64748b`)
*   `CLASS`: Violet (`#8b5cf6`)
*   `FUNCTION`: Cyan (`#06b6d4`)
*   `COMPONENT`: Blue (`#3b82f6`)
*   `HOOK`: Amber (`#f59e0b`)
*   `API_ROUTE` / `API_ENDPOINT`: Emerald (`#10b981`)
*   `API_CALL`: Purple (`#a855f7`)
*   `DATABASE_TABLE`: Rose (`#f43f5e`)

### 3. Canvas Connections (Edges)

Edges are styled as clean, high-contrast lines resembling drafting connections:
*   `NETWORK_REQUEST`: Dashed purple, animated.
*   `RENDERS`: Solid blue.
*   `USES_HOOK`: Dashed amber, animated.
*   `FETCHES`: Dashed violet, animated.
*   `DEFINES`: Solid emerald.
*   `CALLS`: Solid cyan, animated.
*   `IMPORTS`: Solid slate.
*   `FOREIGN_KEY`: Dashed rose, animated, with a closed arrowhead.

---

## 🛠️ Proposed Changes

### Component 1: Global Theme Support
*   **[App.jsx](file:///c:/Users/raj/OneDrive/Desktop/codesneak/frontend/src/App.jsx)**:
    *   Maintain `theme` state (`'light' | 'dark'`), synced to localStorage.
    *   Apply `dark` class to `document.documentElement` to allow Tailwind's native dark-mode selectors to resolve.
    *   Add a Sun/Moon toggle button to the top navigation header.

### Component 2: Canvas Elements
*   **[GraphCanvas.jsx](file:///c:/Users/raj/OneDrive/Desktop/codesneak/frontend/src/GraphCanvas.jsx)**:
    *   Update background grid color based on active theme.
    *   Reconfigure edge coloring in `resolveEdgeStyle` to utilize flat, solid, or dashed borders instead of glowing gradients.
    *   Simplify `FolderGroupNode` layout (flat light fill with dashed borders).
*   **[CustomNode.jsx](file:///c:/Users/raj/OneDrive/Desktop/codesneak/frontend/src/CustomNode.jsx)**:
    *   Update background config (`NODE_CONFIG`) to remove gradient styling.
    *   Create clean, border-delimited node boxes with left accent strips.
*   **[DatabaseNode.jsx](file:///c:/Users/raj/OneDrive/Desktop/codesneak/frontend/src/DatabaseNode.jsx)**:
    *   Convert table visualization into a clean drafting card.
    *   Remove gradient backgrounds from row containers and column handles.
    *   Ensure distinct primary/foreign key labels.

### Component 3: General UI Components
*   **Sidebar, Inspector, and Terminal**:
    *   Rewrite containers in `App.jsx` to use flat backgrounds (`bg-white` and `bg-slate-50` in light mode; `bg-slate-950` and `bg-slate-900` in dark mode).
    *   Refactor input search bar and workspace selectors to remove gradient focus ring and glowing shadows.
