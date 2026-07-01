
import { Handle, Position } from '@xyflow/react';

// ─── ColumnRow — renders one row with per-column handles ─────────────────────
function ColumnRow({ col }) {
  const isPK = col.isPrimaryKey;
  const isFK = col.isForeignKey;

  let badgeBg = 'transparent';
  let badgeText = '';
  let badgeColor = '';
  if (isPK) {
    badgeBg = 'rgba(245, 158, 11, 0.1)';
    badgeText = 'PK';
    badgeColor = '#f59e0b';
  } else if (isFK) {
    badgeBg = 'rgba(59, 130, 246, 0.1)';
    badgeText = 'FK';
    badgeColor = '#3b82f6';
  }

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 bg-transparent relative min-h-[28px] gap-2">
      {/* ── TARGET handle — sits on the LEFT edge of every column row ── */}
      <Handle
        type="target"
        position={Position.Left}
        id={col.name}
        className="w-2 h-2 !bg-slate-400 dark:!bg-slate-600 border border-white dark:border-slate-900"
        style={{ left: -4 }}
      />

      {/* ── Left: badge + column name ── */}
      <div className="flex items-center gap-1.5 overflow-hidden flex-1">
        {(isPK || isFK) && (
          <span
            className="text-[9px] font-bold px-1 py-0.5 rounded font-mono"
            style={{ backgroundColor: badgeBg, color: badgeColor }}
          >
            {badgeText}
          </span>
        )}
        <span
          className={`text-[11px] font-mono truncate ${
            isPK
              ? 'text-amber-600 dark:text-amber-400'
              : isFK
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-700 dark:text-slate-300'
          }`}
          title={col.name}
        >
          {col.name}
        </span>
      </div>

      {/* ── Right: type pill ── */}
      <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 rounded">
        {col.type || 'Field'}
      </span>

      {/* ── SOURCE handle — sits on the RIGHT edge of every column row ── */}
      <Handle
        type="source"
        position={Position.Right}
        id={col.name}
        className="w-2 h-2 !bg-slate-400 dark:!bg-slate-600 border border-white dark:border-slate-900"
        style={{ right: -4 }}
      />
    </div>
  );
}

// ─── DatabaseNode ─────────────────────────────────────────────────────────────
export default function DatabaseNode({ data, selected }) {
  const columns = data.columns || [];

  return (
    <div className={`w-[220px] rounded-md bg-white dark:bg-slate-900 border-2 ${selected ? 'border-rose-500 ring-1 ring-rose-500' : 'border-rose-500/50 dark:border-rose-500/40'} shadow-sm overflow-hidden flex flex-col`}>
      {/* ── Header ── */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-rose-100 dark:border-rose-950/40 bg-rose-50 dark:bg-rose-950/20">
        <span className="material-symbols-outlined text-[16px] text-rose-500">database</span>
        <span className="text-xs font-mono font-bold text-rose-700 dark:text-rose-400 truncate">
          {data.name}
        </span>
      </div>

      {/* ── Table body ── */}
      <div className="flex flex-col bg-white dark:bg-slate-900">
        {columns.map((col, idx) => (
          <ColumnRow key={col.name ?? idx} col={col} />
        ))}
      </div>
    </div>
  );
}
