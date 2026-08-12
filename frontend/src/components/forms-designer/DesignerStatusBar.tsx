'use client';

/**
 * DesignerStatusBar — bottom status bar for the production designer.
 * Shows: selected count, cursor coordinates, zoom level, warning count.
 */

import React from 'react';

export interface DesignerStatusBarProps {
  selectedCount: number;
  cursorX: number;
  cursorY: number;
  zoom: number;
  warningCount: number;
  nodeCount: number;
}

export function DesignerStatusBar({
  selectedCount, cursorX, cursorY, zoom, warningCount, nodeCount,
}: DesignerStatusBarProps) {
  return (
    <div style={{
      height: 28, background: '#0a0a1a', borderTop: '1px solid #1e1e3a',
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: 24,
      fontSize: 11, color: '#4a5568', flexShrink: 0, userSelect: 'none',
    }}>
      <span>
        <span style={{ color: '#64748b' }}>Nodes: </span>
        <span style={{ color: '#94a3b8' }}>{nodeCount}</span>
      </span>
      <span>
        <span style={{ color: '#64748b' }}>Selected: </span>
        <span style={{ color: selectedCount > 0 ? '#3b82f6' : '#94a3b8' }}>{selectedCount}</span>
      </span>
      <span>
        <span style={{ color: '#64748b' }}>X: </span>
        <span style={{ color: '#94a3b8' }}>{Math.round(cursorX)}</span>
        <span style={{ color: '#64748b' }}> Y: </span>
        <span style={{ color: '#94a3b8' }}>{Math.round(cursorY)}</span>
      </span>
      <span>
        <span style={{ color: '#64748b' }}>Zoom: </span>
        <span style={{ color: '#94a3b8' }}>{Math.round(zoom * 100)}%</span>
      </span>
      {warningCount > 0 && (
        <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width={12} height={12} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {warningCount} warning{warningCount !== 1 ? 's' : ''}
        </span>
      )}
      <span style={{ marginLeft: 'auto', color: '#2d2d4e' }}>
        ZoeConnect Document Studio • v1.0.0
      </span>
    </div>
  );
}
