'use client';

import React, { useState, useEffect } from 'react';
import type { PluginRegistry, InspectorTabPlugin } from '@hdsp/canvas-engine-react';

export interface DesignerRightPanelProps {
  registry: PluginRegistry;
}

export function DesignerRightPanel({ registry }: DesignerRightPanelProps) {
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [tabs, setTabs] = useState<InspectorTabPlugin[]>([]);
  const [LoadedComponents, setLoadedComponents] = useState<Record<string, React.ComponentType<any>>>({});

  useEffect(() => {
    try {
      const available = registry.listInspectorTabs();
      setTabs(available);
      if (available.length > 0 && !activeTabId) {
        setActiveTabId(available[0].id);
      }
    } catch (e) {
      console.error('Failed to load inspector tabs', e);
    }
  }, [registry, activeTabId]);

  useEffect(() => {
    if (!activeTabId) return;
    
    if (!LoadedComponents[activeTabId]) {
      const tab = tabs.find((t) => t.id === activeTabId);
      if (tab) {
        tab.lazyLoader().then((mod) => {
          setLoadedComponents((prev) => ({ ...prev, [activeTabId]: mod.default }));
        });
      }
    }
  }, [activeTabId, tabs, LoadedComponents]);

  const ActiveComponent = activeTabId ? LoadedComponents[activeTabId] : null;

  if (tabs.length === 0) {
    return (
      <div style={{ width: 280, background: '#0f0f1a', borderLeft: '1px solid #1e1e3a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 12 }}>
        No inspector plugins loaded.
      </div>
    );
  }

  return (
    <div style={{ width: 280, background: '#0f0f1a', borderLeft: '1px solid #1e1e3a', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* Tab Header */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1e1e3a', overflowX: 'auto' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            style={{
              padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
              color: activeTabId === tab.id ? '#e2e8f0' : '#64748b',
              borderBottom: activeTabId === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
              fontSize: 11, fontWeight: activeTabId === tab.id ? 700 : 500,
              textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
              transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            {tab.icon}
            {tab.title}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {ActiveComponent ? (
          <ActiveComponent />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 12, height: '100%' }}>
            Loading tab...
          </div>
        )}
      </div>
    </div>
  );
}
