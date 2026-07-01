import React from 'react';
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
    accent: '#94a3b8',   // slate-400
    bg: '#1a1f2e',
    border: '#334155',   // slate-700
  },
  CLASS: {
    icon: Box,
    label: 'Class',
    accent: '#a78bfa',   // violet-400
    bg: '#1e1a2e',
    border: '#6d28d9',   // violet-700
  },
  FUNCTION: {
    icon: Braces,
    label: 'Function',
    accent: '#67e8f9',   // cyan-300
    bg: '#0f1f2e',
    border: '#0e7490',   // cyan-700
  },

  // ── Universal schema types ────────────────────────────────────────────────
  COMPONENT: {
    icon: Layout,
    label: 'Component',
    accent: '#60a5fa',   // blue-400
    bg: '#0f172a',
    border: '#1d4ed8',   // blue-700
  },
  HOOK: {
    icon: Zap,
    label: 'Hook',
    accent: '#fbbf24',   // amber-400
    bg: '#1c1400',
    border: '#b45309',   // amber-700
  },
  API_ROUTE: {
    icon: Server,
    label: 'Route',
    accent: '#4ade80',   // green-400
    bg: '#0d1f11',
    border: '#15803d',   // green-700
  },
  API_ENDPOINT: {
    icon: Server,
    label: 'Endpoint',
    accent: '#4ade80',   // green-400
    bg: '#0d1f11',
    border: '#15803d',   // green-700
  },
  API_CALL: {
    icon: Wifi,
    label: 'API Call',
    accent: '#c084fc',   // purple-400
    bg: '#1a0f2e',
    border: '#7e22ce',   // purple-700
  },
  DATABASE_TABLE: {
    icon: Database,
    label: 'Table',
    accent: '#f43f5e',   // rose-500
    bg: '#2e1216',
    border: '#be123c',   // rose-700
  },
};

// Normalise the raw backend type string and return its config (fallback = FUNCTION)
function getConfig(rawType) {
  const key = (rawType || '').toUpperCase();
  return NODE_CONFIG[key] || NODE_CONFIG.FUNCTION;
}

// ─── CustomNode component ─────────────────────────────────────────────────────

export default function CustomNode({ data }) {
  const cfg = getConfig(data.type);
  const Icon = cfg.icon;
  const isFile = (data.type || '').toUpperCase() === 'FILE';

  return (
    <div
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderLeft: `3px solid ${cfg.accent}`,
        borderRadius: '8px',
        minWidth: '190px',
        maxWidth: '240px',
        fontFamily: 'Inter, sans-serif',
        boxShadow: `0 0 0 1px ${cfg.border}22, 0 4px 16px rgba(0,0,0,0.4)`,
        transition: 'box-shadow 0.2s ease',
        cursor: 'pointer',
      }}
      className="group"
    >
      {/* Target handle */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: cfg.accent, width: 8, height: 8, borderRadius: 4 }}
      />

      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px 5px',
          borderBottom: `1px solid ${cfg.border}66`,
        }}
      >
        {/* Icon + type badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Icon size={13} color={cfg.accent} strokeWidth={2.2} />
            {data.is_unified && (
              <FileCode size={11} color={cfg.accent} strokeWidth={2.2} style={{ opacity: 0.7 }} title="Merged File & Component" />
            )}
          </div>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: cfg.accent,
            }}
          >
            {cfg.label}
          </span>
        </div>

        {/* Expand / collapse toggle (files only) */}
        {isFile && (
          <button
            onClick={(e) => { e.stopPropagation(); data.onExpand?.(); }}
            title={data.isExpanded ? 'Collapse' : 'Expand'}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
              borderRadius: 4,
            }}
            className="hover:!text-white transition-colors"
          >
            {data.isExpanded ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
          </button>
        )}
      </div>

      {/* Body — symbol name & method badges */}
      <div
        style={{
          padding: '7px 10px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <div
          style={{
            fontSize: '12.5px',
            fontWeight: 500,
            color: '#e2e8f0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={data.name}
        >
          {data.name || (data.path
            ? data.path.replace(/\\/g, '/').split('/').pop()
            : '—'
          )}
        </div>
        
        {/* Method Badges for API_ENDPOINT */}
        {data.methods && data.methods.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
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
        style={{ background: cfg.accent, width: 8, height: 8, borderRadius: 4 }}
      />
    </div>
  );
}
