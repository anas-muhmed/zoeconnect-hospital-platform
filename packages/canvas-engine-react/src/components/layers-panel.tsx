import React, { useState } from 'react';
import type { CanvasEngine } from '@hdsp/canvas-engine';
import type { ComponentRegistry } from '@hdsp/form-schema';
import { useEngineSelector } from '../hooks/use-engine-selector';
import { useEngineCommands } from '../hooks/use-engine-commands';

export interface LayersPanelProps {
  engine: CanvasEngine;
  registry?: ComponentRegistry;
}

export function LayersPanel({ engine, registry }: LayersPanelProps) {
  const nodes = useEngineSelector(engine, s => s.nodes);
  const selectedIds = useEngineSelector(engine, s => s.selectedIds);
  const commands = useEngineCommands(engine);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const rootNodes = nodes.filter(n => !n.parentId);
  const childrenByParent = new Map<string, typeof nodes>();
  nodes.forEach(n => {
    if (n.parentId) {
      if (!childrenByParent.has(n.parentId)) childrenByParent.set(n.parentId, []);
      childrenByParent.get(n.parentId)!.push(n);
    }
  });

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('application/x-hdsp-node-id', id);
  };

  const handleDragOver = (e: React.DragEvent, id: string | null) => {
    e.preventDefault();
    if (id !== dragOverId) setDragOverId(id);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string | null) => {
    e.preventDefault();
    setDragOverId(null);
    const sourceId = e.dataTransfer.getData('application/x-hdsp-node-id');
    if (!sourceId || sourceId === targetId) return;

    if (targetId) {
      const targetNode = nodes.find(n => n.id === targetId);
      if (!targetNode) return;
      const def = registry?.get(targetNode.type);
      if (!def?.canHaveChildren) return;
    }

    engine.reparentNodes([sourceId], targetId || undefined);
  };

  // Touch fallback for the HTML5 drag-and-drop reparenting above (touch
  // interaction audit, Phase 2): native `draggable`/`onDragStart`/`onDrop`
  // has no touch equivalent in any mobile browser, so on a tablet the layer
  // tree could not be reorganized at all -- this was the only way to
  // reparent a node. Reparenting is a tree operation (pick an arbitrary new
  // parent, not just "swap with sibling"), so a simple Up/Down button pair
  // doesn't fit it the way it does for the linear lists this same audit
  // flagged elsewhere (see cms/playlists/[id]/page.tsx's `moveItem` and
  // feedback/forms/[id]/page.tsx's `moveSection`/`moveQuestion`). A "Move
  // to" select is the equivalent discrete, touch- and keyboard-accessible
  // control instead -- it calls the exact same `engine.reparentNodes(...)`
  // the drag handler above already uses, so both interaction paths stay in
  // sync with no duplicated logic.
  const containerNodes = nodes.filter(n => registry?.get(n.type)?.canHaveChildren);
  const handleMoveTo = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    engine.reparentNodes([sourceId], targetId === '__root__' ? undefined : targetId);
  };

  const renderItem = (node: typeof nodes[0], depth: number) => {
    const children = childrenByParent.get(node.id) || [];
    const isExpanded = expanded.has(node.id);
    const isSelected = selectedIds.includes(node.id);
    const isDragOver = dragOverId === node.id;
    const def = registry?.get(node.type);

    return (
      <div key={node.id}>
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, node.id)}
          onDragOver={(e) => def?.canHaveChildren ? handleDragOver(e, node.id) : undefined}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node.id)}
          onClick={(e) => {
            if (e.shiftKey) commands.selectAt(engine.scene.getAbsoluteGeometry(node.id) as any, true);
            else engine.selection.select(node.id);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '4px 8px',
            paddingLeft: 8 + depth * 16,
            background: isSelected ? '#e3f2fd' : isDragOver ? '#f1f8e9' : 'transparent',
            cursor: 'pointer',
            userSelect: 'none',
            borderBottom: '1px solid #f0f0f0'
          }}
        >
          <div
            style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 4, cursor: children.length ? 'pointer' : 'default' }}
            onClick={(e) => children.length && toggleExpand(node.id, e)}
          >
            {children.length > 0 ? (isExpanded ? '▼' : '▶') : ''}
          </div>
          <div style={{ fontSize: 13, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
            {def?.displayName || node.type} <span style={{ color: '#aaa', fontSize: 11 }}>{node.props.label || node.id.split('-').pop()}</span>
          </div>
          {/* Touch/keyboard fallback for drag-drop reparenting -- see handleMoveTo's doc comment above. */}
          <select
            aria-label={`Move ${def?.displayName || node.type} to a different parent`}
            value={node.parentId ?? '__root__'}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { e.stopPropagation(); handleMoveTo(node.id, e.target.value); }}
            style={{ fontSize: 11, maxWidth: 90, marginLeft: 4, flexShrink: 0 }}
          >
            <option value="__root__">Top level</option>
            {containerNodes.filter(n => n.id !== node.id).map(n => (
              <option key={n.id} value={n.id}>
                {registry?.get(n.type)?.displayName || n.type} {n.props.label ? `(${n.props.label})` : ''}
              </option>
            ))}
          </select>
        </div>
        {isExpanded && children.map(c => renderItem(c, depth + 1))}
      </div>
    );
  };

  return (
    <div
      style={{ minHeight: 100, border: '1px solid #e0e0e0', borderRadius: 4, background: '#fff' }}
      onDragOver={(e) => handleDragOver(e, null)}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, null)}
    >
      {rootNodes.length === 0 ? (
        <div style={{ padding: 16, color: '#999', fontSize: 12, textAlign: 'center' }}>No layers</div>
      ) : (
        rootNodes.map(n => renderItem(n, 0))
      )}
    </div>
  );
}
