
import { Handle, Position } from '@xyflow/react';
import {
  FileCode, Box, Braces,
  Maximize2, Minimize2,
  // New universal schema icons
  Layout,       // COMPONENT
  Zap,          // HOOK
  Server,       // API_ROUTE
  Wifi,         // API_CALL
  Database,     // DATABASE_TABLE
} from 'lucide-react';

// ─── Node type visual config ──────────────────────────────────────────────────
// Each entry maps a backend NodeType string → { icon, label, accent, bg, border }
// "accent"  = icon / badge colour    (Tailwind text-* class)
// "bg"      = card body background   (inline style hex — avoids JIT purge issues)
// "border"  = left accent stripe     (inline style hex)

const NODE_CONFIG = {
  // ── Legacy types ─────────────────────────────────────────────────────────
  FILE: {
    icon: FileCode,
    label: 'File',
    accent: '#64748b',
    borderClass: 'border-l-4 border-l-slate-500',
  },
  CLASS: {
    icon: Box,
    label: 'Class',
    accent: '#8b5cf6',
    borderClass: 'border-l-4 border-l-violet-500',
  },
  FUNCTION: {
    icon: Braces,
    label: 'Function',
    accent: '#06b6d4',
    borderClass: 'border-l-4 border-l-cyan-500',
  },

  // ── Universal schema types ────────────────────────────────────────────────
  COMPONENT: {
    icon: Layout,
    label: 'Component',
    accent: '#3b82f6',
    borderClass: 'border-l-4 border-l-blue-500',
  },
  HOOK: {
    icon: Zap,
    label: 'Hook',
    accent: '#f59e0b',
    borderClass: 'border-l-4 border-l-amber-500',
  },
  API_ROUTE: {
    icon: Server,
    label: 'Route',
    accent: '#10b981',
    borderClass: 'border-l-4 border-l-emerald-500',
  },
  API_ENDPOINT: {
    icon: Server,
    label: 'Endpoint',
    accent: '#10b981',
    borderClass: 'border-l-4 border-l-emerald-500',
  },
  API_CALL: {
    icon: Wifi,
    label: 'API Call',
    accent: '#a855f7',
    borderClass: 'border-l-4 border-l-purple-500',
  },
  DATABASE_TABLE: {
    icon: Database,
    label: 'Table',
    accent: '#f43f5e',
    borderClass: 'border-l-4 border-l-rose-500',
  },
};

// Normalise the raw backend type string and return its config (fallback = FUNCTION)
function getConfig(rawType) {
  const key = (rawType || '').toUpperCase();
  return NODE_CONFIG[key] || NODE_CONFIG.FUNCTION;
}

// ─── CustomNode component ─────────────────────────────────────────────────────

export default function CustomNode({ data, selected }) {
  const cfg = getConfig(data.type);
  const Icon = cfg.icon;
  const isFile = (data.type || '').toUpperCase() === 'FILE';

  return (
    <div
      className={`w-[220px] rounded-md bg-white dark:bg-slate-900 border ${selected ? 'border-slate-950 dark:border-slate-100 ring-1 ring-slate-950 dark:ring-slate-100' : 'border-slate-200 dark:border-slate-800'} ${cfg.borderClass} shadow-sm overflow-hidden flex flex-col cursor-pointer group`}
    >
      {/* Target handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-2 h-2 !bg-slate-400 dark:!bg-slate-600 border border-white dark:border-slate-900"
      />

      {/* Header row */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
        {/* Icon + type badge */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1">
            <Icon size={13} color={cfg.accent} strokeWidth={2.2} />
            {data.is_unified && (
              <FileCode size={11} color={cfg.accent} strokeWidth={2.2} className="opacity-70" title="Merged File & Component" />
            )}
          </div>
          <span
            className="text-[10px] font-bold tracking-wider uppercase"
            style={{ color: cfg.accent }}
          >
            {cfg.label}
          </span>
        </div>

        {/* Expand / collapse toggle (files only) */}
        {isFile && (
          <button
            onClick={(e) => { e.stopPropagation(); data.onExpand?.(); }}
            title={data.isExpanded ? 'Collapse' : 'Expand'}
            className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors p-0.5 flex items-center bg-transparent border-none cursor-pointer"
          >
            {data.isExpanded ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
          </button>
        )}
      </div>

      {/* Body — symbol name & method badges */}
      <div className="p-3 flex flex-col gap-1">
        <div
          className="text-xs font-mono font-medium text-slate-800 dark:text-slate-200 truncate"
          title={data.name}
        >
          {data.name || (data.path
            ? data.path.replace(/\\/g, '/').split('/').pop()
            : '—'
          )}
        </div>
        
        {/* Method Badges for API_ENDPOINT */}
        {data.methods && data.methods.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-1">
            {data.methods.map(method => {
              // Basic color mapping for common HTTP methods
              let bg = '#1e293b'; let color = '#94a3b8'; let border = '#334155';
              switch (method.toUpperCase()) {
                case 'GET':    bg = '#064e3b'; color = '#34d399'; border = '#059669'; break;
                case 'POST':   bg = '#1e3a8a'; color = '#60a5fa'; border = '#2563eb'; break;
                case 'PUT':    bg = '#78350f'; color = '#fbbf24'; border = '#d97706'; break;
                case 'DELETE': bg = '#7f1d1d'; color = '#f87171'; border = '#dc2626'; break;
                case 'PATCH':  bg = '#4c1d95'; color = '#c084fc'; border = '#7c3aed'; break;
              }
              return (
                <span
                  key={method}
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '12px',
                    background: bg,
                    color: color,
                    border: `1px solid ${border}`,
                  }}
                >
                  {method}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Source handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-2 h-2 !bg-slate-400 dark:!bg-slate-600 border border-white dark:border-slate-900"
      />
    </div>
  );
}
