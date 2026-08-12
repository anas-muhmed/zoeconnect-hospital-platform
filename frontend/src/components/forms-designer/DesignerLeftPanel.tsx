'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { PluginRegistry, DesignerPanelPlugin } from '@hdsp/canvas-engine-react';

export interface DesignerLeftPanelProps {
  registry: PluginRegistry;
}

export function DesignerLeftPanel({ registry }: DesignerLeftPanelProps) {
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  const [panels, setPanels] = useState<DesignerPanelPlugin[]>([]);
  const [LoadedComponents, setLoadedComponents] = useState<Record<string, React.ComponentType<any>>>({});

  useEffect(() => {
    try {
      const available = registry.listPanels();
      setPanels(available);
      if (available.length > 0 && !activePanelId) {
        setActivePanelId(available[0].id);
      }
    } catch (e) {
      console.error('Failed to load panel plugins', e);
    }
  }, [registry, activePanelId]);

  useEffect(() => {
    if (!activePanelId) return;
    
    // Lazy load the active panel if not already loaded
    if (!LoadedComponents[activePanelId]) {
      const panel = panels.find((p) => p.id === activePanelId);
      if (panel) {
        panel.lazyLoader().then((mod) => {
          setLoadedComponents((prev) => ({ ...prev, [activePanelId]: mod.default }));
        });
      }
    }
  }, [activePanelId, panels, LoadedComponents]);

  const ActiveComponent = activePanelId ? LoadedComponents[activePanelId] : null;

  return (
    <div style={{ display: 'flex', height: '100%', borderRight: '1px solid #1e1e3a', background: '#0f0f1a' }}>
      {/* Dock Sidebar */}
      <div style={{ width: 48, borderRight: '1px solid #1e1e3a', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8, gap: 8 }}>
        {panels.map((panel) => (
          <button
            key={panel.id}
            onClick={() => setActivePanelId(panel.id)}
            title={panel.title}
            style={{
              width: 36, height: 36, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: activePanelId === panel.id ? 'rgba(59,130,246,0.15)' : 'transparent',
              color: activePanelId === panel.id ? '#3b82f6' : '#64748b',
              border: activePanelId === panel.id ? '1px solid rgba(59,130,246,0.5)' : '1px solid transparent',
              cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            {panel.icon}
          </button>
        ))}
      </div>

      {/* Active Panel Content */}
      {ActiveComponent ? (
        <div style={{ width: 240, display: 'flex', flexDirection: 'column' }}>
          <ActiveComponent />
        </div>
      ) : (
        <div style={{ width: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 12 }}>
          Loading panel...
        </div>
      )}
    </div>
  );
}
