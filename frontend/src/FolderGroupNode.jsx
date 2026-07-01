import React from 'react';

export default function FolderGroupNode({ data }) {
  const themeColor = data.themeColor || '#64748b'; // Slate default

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: `${themeColor}1A`, // Highly transparent (~10%)
        border: `1px dashed ${themeColor}80`,
        borderRadius: '12px',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        className="font-inter uppercase tracking-widest text-[10px] font-bold px-3 py-1 flex items-center gap-1.5"
        style={{
          color: themeColor,
          backgroundColor: `${themeColor}26`, // Slightly less transparent (~15%)
          borderBottom: `1px dashed ${themeColor}4D`,
          borderTopLeftRadius: '11px',
          borderTopRightRadius: '11px',
          height: '28px',
          boxSizing: 'border-box'
        }}
      >
        <span className="material-symbols-outlined text-[14px]">folder</span>
        {data.label}
      </div>
    </div>
  );
}
