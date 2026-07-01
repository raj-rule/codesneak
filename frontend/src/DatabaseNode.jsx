import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';

// ─── ColumnRow — renders one row with per-column handles ─────────────────────
function ColumnRow({ col }) {
  const isPK = col.isPrimaryKey;
  const isFK = col.isForeignKey;

  let badgeBg   = 'transparent';
  let badgeText = '';
  let badgeColor = '';
  if (isPK) { badgeBg = '#78350f'; badgeText = 'PK'; badgeColor = '#fbbf24'; }
  else if (isFK) { badgeBg = '#1e3a5f'; badgeText = 'FK'; badgeColor = '#60a5fa'; }

  const rowBg = isPK
    ? 'rgba(251,191,36,0.06)'
    : isFK
    ? 'rgba(96,165,250,0.06)'
    : 'transparent';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 12px',
        background: rowBg,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        position: 'relative',
        minHeight: 26,
        gap: 6,
      }}
    >
      {/* ── TARGET handle — sits on the LEFT edge of every column row ── */}
      <Handle
        type="target"
        position={Position.Left}
        id={col.name}
        style={{
          width: isPK ? 10 : 7,
          height: isPK ? 10 : 7,
          left: -4,
          background: isPK ? '#fbbf24' : '#475569',
          border: `1.5px solid ${isPK ? '#78350f' : '#1e293b'}`,
          borderRadius: '50%',
          opacity: isPK ? 0.9 : 0.4,
          cursor: 'crosshair',
          transition: 'opacity 0.15s, transform 0.15s',
        }}
        className="col-handle-target"
      />

      {/* ── Left: badge + column name ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', flex: 1 }}>
        {(isPK || isFK) && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 800,
              fontFamily: 'monospace',
              letterSpacing: 1,
              padding: '1px 4px',
              borderRadius: 3,
              background: badgeBg,
              color: badgeColor,
              flexShrink: 0,
            }}
          >
            {badgeText}
          </span>
        )}
        <span
          style={{
            fontSize: 11.5,
            fontFamily: 'monospace',
            color: isPK ? '#fde68a' : isFK ? '#93c5fd' : '#cbd5e1',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={col.name}
        >
          {col.name}
        </span>
      </div>

      {/* ── Right: type pill ── */}
      <span
        style={{
          fontSize: 10,
          fontFamily: 'monospace',
          color: '#475569',
          flexShrink: 0,
          background: 'rgba(15,23,42,0.6)',
          padding: '1px 5px',
          borderRadius: 4,
        }}
      >
        {col.type}
      </span>

      {/* ── SOURCE handle — sits on the RIGHT edge of every column row ── */}
      <Handle
        type="source"
        position={Position.Right}
        id={col.name}
        style={{
          width: isFK ? 10 : 7,
          height: isFK ? 10 : 7,
          right: -4,
          background: isFK ? '#60a5fa' : '#475569',
          border: `1.5px solid ${isFK ? '#1e3a8a' : '#1e293b'}`,
          borderRadius: '50%',
          opacity: isFK ? 0.9 : 0.4,
          cursor: 'crosshair',
          transition: 'opacity 0.15s, transform 0.15s',
        }}
        className="col-handle-source"
      />
    </div>
  );
}

// ─── DatabaseNode ─────────────────────────────────────────────────────────────
export default function DatabaseNode({ data, selected }) {
  const [collapsed, setCollapsed] = useState(false);

  const columns  = data.columns || [];
  const pkCols   = columns.filter(c => c.isPrimaryKey);
  const fkCols   = columns.filter(c => c.isForeignKey);
  const dataCols = columns.filter(c => !c.isPrimaryKey && !c.isForeignKey);

  // PKs first → plain data → FKs last (FK handles sit near bottom for cleaner routing)
  const ordered  = [...pkCols, ...dataCols, ...fkCols];
  const MAX_VISIBLE = 14;
  const visible  = collapsed ? ordered.slice(0, 3) : ordered.slice(0, MAX_VISIBLE);
  const overflow = ordered.length - visible.length;

  const accentColor = '#f43f5e';

  return (
    <div
      style={{
        minWidth: 240,
        maxWidth: 310,
        background: '#0f0a0a',
        border: `1.5px solid ${selected ? accentColor : '#3f1f1f'}`,
        borderRadius: 10,
        overflow: 'visible',          // let handles bleed outside the card
        boxShadow: selected
          ? `0 0 0 2px ${accentColor}44, 0 8px 32px rgba(244,63,94,0.22)`
          : '0 4px 20px rgba(0,0,0,0.6)',
        fontFamily: 'Inter, system-ui, sans-serif',
        transition: 'box-shadow 0.2s, border-color 0.2s',
        position: 'relative',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'linear-gradient(135deg, #1c0a0f 0%, #2d0d16 100%)',
          borderBottom: `1px solid ${accentColor}55`,
          borderRadius: '8px 8px 0 0',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          </svg>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fda4af', letterSpacing: 0.3 }}>
            {data.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>
            {columns.length} cols
          </span>
          <span style={{ fontSize: 14, color: '#6b7280', lineHeight: 1 }}>
            {collapsed ? '▸' : '▾'}
          </span>
        </div>
      </div>

      {/* ── Stats bar ── */}
      {!collapsed && columns.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 1,
          background: '#0a0505',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          padding: '4px 10px',
        }}>
          <StatChip label="PK" count={pkCols.length}   color="#fbbf24" bg="#78350f22" />
          <StatChip label="FK" count={fkCols.length}   color="#60a5fa" bg="#1e3a5f22" />
          <StatChip label="Data" count={dataCols.length} color="#64748b" bg="transparent" />
        </div>
      )}

      {/* ── Column list with per-row handles ── */}
      {!collapsed && (
        <div style={{ borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
          {visible.map((col, i) => <ColumnRow key={col.name ?? i} col={col} />)}
          {overflow > 0 && (
            <div style={{
              padding: '5px 10px',
              fontSize: 10.5,
              color: '#475569',
              fontStyle: 'italic',
              background: 'rgba(255,255,255,0.02)',
              textAlign: 'center',
            }}>
              +{overflow} more columns…
            </div>
          )}
        </div>
      )}

      {/* ── Collapsed ghost skeleton ── */}
      {collapsed && (
        <div style={{ padding: '6px 10px', display: 'flex', gap: 4 }}>
          {['#fbbf24', '#fbbf24', '#60a5fa'].slice(0, Math.min(3, columns.length)).map((c, i) => (
            <div key={i} style={{ height: 6, flex: 1, borderRadius: 3, background: c, opacity: 0.3 }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tiny stat chip ───────────────────────────────────────────────────────────
function StatChip({ label, count, color, bg }) {
  if (count === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 4, background: bg, flexShrink: 0 }}>
      <span style={{ fontSize: 9, fontWeight: 800, color, fontFamily: 'monospace', letterSpacing: 0.5 }}>{label}</span>
      <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{count}</span>
    </div>
  );
}
