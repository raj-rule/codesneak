export default function FolderGroupNode({ data }) {
  return (
    <div className="w-full h-full bg-slate-50/20 dark:bg-slate-900/10 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg flex flex-col">
      <div className="font-mono text-[9px] font-bold px-3 py-1 flex items-center gap-1 border-b border-dashed border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/40 rounded-t-lg text-slate-500">
        <span className="material-symbols-outlined text-[14px]">folder</span>
        {data.label}
      </div>
    </div>
  );
}
