'use client';

/**
 * DesignerToolbar — top toolbar for the production Form Designer.
 * Styled to feel like Figma / Canva: dark background, icon groups,
 * centered form name with inline edit, right-side action cluster.
 */

import React, { useState, useRef } from 'react';
import { commandBus } from '@hdsp/canvas-engine-react';

export interface DesignerToolbarProps {
  formName: string;
  onFormNameChange: (name: string) => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  canUndo: boolean;
  canRedo: boolean;
  onBack: () => void;
}

// Phase 3 polish: this row was a non-wrapping `display:flex` with a fixed
// `height: 52`. On a narrow viewport the ~9 toolbar buttons had nowhere to
// go but off the edge of the screen -- flexWrap lets it spill onto a second
// row instead, and `minHeight` (in place of a fixed `height`) lets the row
// actually grow to fit that second line.
const TB: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  minHeight: 52,
  backgroundColor: '#1a1a2e',
  borderBottom: '1px solid #2d2d4e',
  padding: '8px 16px',
  gap: 8,
  rowGap: 8,
  flexWrap: 'wrap',
  flexShrink: 0,
  userSelect: 'none',
  zIndex: 100,
};

const IconBtn: React.FC<{
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'danger';
}> = ({ title, onClick, disabled, children, variant = 'default' }) => {
  const bg = variant === 'primary' ? '#3b82f6' : variant === 'danger' ? '#ef4444' : 'transparent';
  const hoverBg = variant === 'primary' ? '#2563eb' : variant === 'danger' ? '#dc2626' : 'rgba(255,255,255,0.08)';
  const [hovered, setHovered] = useState(false);

  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        // Phase 3 polish: 6px vertical padding around a 14-16px icon put
        // every toolbar button's touch target well under the ~40px
        // guideline -- minHeight/minWidth restore that without changing
        // the visual padding for the icon+label buttons.
        padding: '8px 10px', minHeight: 40, minWidth: 40, borderRadius: 6, border: 'none',
        background: hovered ? hoverBg : bg,
        color: disabled ? '#555' : '#e2e8f0',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 13, fontWeight: 500, transition: 'background 0.15s',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  );
};

const Divider = () => (
  <div style={{ width: 1, height: 28, background: '#2d2d4e', margin: '0 4px', flexShrink: 0 }} />
);

export function DesignerToolbar({
  formName, onFormNameChange, saveStatus,
  canUndo, canRedo, onBack,
}: DesignerToolbarProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formName);
  const inputRef = useRef<HTMLInputElement>(null);

  const commitEdit = () => {
    setEditing(false);
    if (draft.trim()) onFormNameChange(draft.trim());
    else setDraft(formName);
  };

  const saveLabel = saveStatus === 'saving' ? '⟳ Saving…'
    : saveStatus === 'saved' ? '✓ Saved'
    : saveStatus === 'error' ? '✗ Error'
    : 'Save Draft';

  return (
    <div style={TB}>
      {/* Left: Back + New */}
      <IconBtn title="My Forms" onClick={onBack}>
        <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </IconBtn>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 4 }}>
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <rect x={3} y={3} width={18} height={18} rx={3} fill="#3b82f6" opacity={0.2} />
          <rect x={3} y={3} width={18} height={18} rx={3} stroke="#3b82f6" strokeWidth={1.5} />
          <path d="M8 12h8M12 8v8" stroke="#3b82f6" strokeWidth={2} strokeLinecap="round" />
        </svg>
      </div>

      <Divider />

      <IconBtn title="New Form" onClick={() => commandBus.dispatch('ai_generate')}>
        <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        New
      </IconBtn>

      <IconBtn title="Import PDF / Image" onClick={() => commandBus.dispatch('ai_generate')}>
        <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
        </svg>
        Import
      </IconBtn>

      <Divider />

      {/* Undo / Redo */}
      <IconBtn title="Undo (Ctrl+Z)" onClick={() => commandBus.dispatch('undo')} disabled={!canUndo}>
        <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 14L4 9l5-5M4 9h11a6 6 0 010 12h-1" />
        </svg>
      </IconBtn>
      <IconBtn title="Redo (Ctrl+Shift+Z)" onClick={() => commandBus.dispatch('redo')} disabled={!canRedo}>
        <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 14l5-5-5-5M19 9H8a6 6 0 000 12h1" />
        </svg>
      </IconBtn>

      <Divider />

      {/* Center: Form name */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setEditing(false); setDraft(formName); } }}
            style={{
              background: 'rgba(255,255,255,0.1)', border: '1px solid #3b82f6',
              borderRadius: 6, color: '#fff', fontSize: 14, fontWeight: 600,
              padding: '4px 12px', outline: 'none', minWidth: 220, textAlign: 'center',
            }}
          />
        ) : (
          <div
            onClick={() => { setEditing(true); setDraft(formName); }}
            title="Click to rename"
            style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, cursor: 'text', padding: '4px 12px', borderRadius: 6, transition: 'background 0.15s' }}
          >
            {formName}
            <span style={{ marginLeft: 6, color: '#4a5568', fontSize: 12 }}>✎</span>
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <Divider />

      <IconBtn title="Version History" onClick={() => commandBus.dispatch('history')}>
        <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        History
      </IconBtn>

      <IconBtn title="Preview in browser" onClick={() => commandBus.dispatch('preview')}>
        <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        Preview
      </IconBtn>

      <IconBtn title="Save draft version" onClick={() => commandBus.dispatch('save_draft')} variant="default">
        <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
        </svg>
        {saveLabel}
      </IconBtn>

      <IconBtn title="Publish this version" onClick={() => commandBus.dispatch('publish')} variant="primary">
        <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Publish
      </IconBtn>
    </div>
  );
}
