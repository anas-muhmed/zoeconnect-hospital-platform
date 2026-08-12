import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasEngine } from '@hdsp/canvas-engine';
import type { ComponentRegistry } from '@hdsp/form-schema';
import { useEngineSelector } from '../hooks/use-engine-selector';
import { useEngineCommands } from '../hooks/use-engine-commands';
import { InspectorGenerator } from './inspector-generator';
import { LayersPanel } from './layers-panel';
import { BASIC_COMPONENT_DEFAULT_SIZE } from './basic/register-basic-components';
import { ErrorBoundary } from './error-boundary';

const MemoizedNode = React.memo(function MemoizedNode({ 
  node, 
  isSelected, 
  isHoveredContainer, 
  childrenNodes, 
  registry,
  renderChild,
  onResizeStart
}: {
  node: any;
  isSelected: boolean;
  isHoveredContainer: boolean;
  childrenNodes: any[];
  registry?: ComponentRegistry;
  renderChild: (child: any) => React.ReactNode;
  onResizeStart: (nodeId: string, handle: string, e: React.PointerEvent) => void;
}) {
  const def = registry?.get(node.type);
  
  let content = null;
  if (node.type === 'rectangle') {
    content = (
      <rect
        x={0}
        y={0}
        width={node.geometry.width}
        height={node.geometry.height}
        fill={node.props.fill}
        stroke={isSelected ? '#f50057' : node.props.stroke}
        strokeWidth={isSelected ? 3 : 1}
      />
    );
  } else {
    const DesignerComponent = def?.DesignerComponent as React.ComponentType<{ node: any }> | undefined;
    const emptyPlaceholder = def?.canHaveChildren && childrenNodes.length === 0 ? (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12, pointerEvents: 'none' }}>
        Drop components here
      </div>
    ) : null;

    content = (
      <>
        <rect
          x={0}
          y={0}
          width={node.geometry.width}
          height={node.geometry.height}
          fill={isHoveredContainer ? 'rgba(76, 175, 80, 0.1)' : 'none'}
          stroke={isSelected ? '#f50057' : isHoveredContainer ? '#4caf50' : '#ddd'}
          strokeWidth={isSelected || isHoveredContainer ? 2 : 1}
        />
        <foreignObject x={0} y={0} width={node.geometry.width} height={node.geometry.height}>
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {DesignerComponent ? (
              <ErrorBoundary fallback={<div style={{ fontSize: 11, color: '#f44336', padding: 4 }}>Error rendering {node.type}</div>}>
                <DesignerComponent node={node} />
              </ErrorBoundary>
            ) : (
              <div style={{ fontSize: 11, color: '#999', padding: 4 }}>Unregistered type: {node.type}</div>
            )}
            {emptyPlaceholder}
          </div>
        </foreignObject>
      </>
    );
  }

  return (
    <g data-testid={`node-${node.id}`} transform={`translate(${node.geometry.x}, ${node.geometry.y})`}>
      {content}
      {isSelected && (
        <>
          {/* Pointer Events migration (touch interaction audit, Phase 2): onMouseDown
              was mouse-only, so resize handles had no touch equivalent at all on a
              tablet. touchAction: 'none' stops the browser from hijacking the
              gesture as a page-scroll/pinch before onResizeStart's setPointerCapture
              (in the handler below) locks it to this drag. */}
          <rect x={-4} y={-4} width={8} height={8} fill="#fff" stroke="#1976d2" strokeWidth={1} style={{ cursor: 'nwse-resize', touchAction: 'none' }} onPointerDown={(e) => onResizeStart(node.id, 'nw', e)} />
          <rect x={node.geometry.width - 4} y={-4} width={8} height={8} fill="#fff" stroke="#1976d2" strokeWidth={1} style={{ cursor: 'nesw-resize', touchAction: 'none' }} onPointerDown={(e) => onResizeStart(node.id, 'ne', e)} />
          <rect x={-4} y={node.geometry.height - 4} width={8} height={8} fill="#fff" stroke="#1976d2" strokeWidth={1} style={{ cursor: 'nesw-resize', touchAction: 'none' }} onPointerDown={(e) => onResizeStart(node.id, 'sw', e)} />
          <rect x={node.geometry.width - 4} y={node.geometry.height - 4} width={8} height={8} fill="#fff" stroke="#1976d2" strokeWidth={1} style={{ cursor: 'nwse-resize', touchAction: 'none' }} onPointerDown={(e) => onResizeStart(node.id, 'se', e)} />

          <rect x={node.geometry.width / 2 - 4} y={-4} width={8} height={8} fill="#fff" stroke="#1976d2" strokeWidth={1} style={{ cursor: 'ns-resize', touchAction: 'none' }} onPointerDown={(e) => onResizeStart(node.id, 'n', e)} />
          <rect x={node.geometry.width / 2 - 4} y={node.geometry.height - 4} width={8} height={8} fill="#fff" stroke="#1976d2" strokeWidth={1} style={{ cursor: 'ns-resize', touchAction: 'none' }} onPointerDown={(e) => onResizeStart(node.id, 's', e)} />
          <rect x={-4} y={node.geometry.height / 2 - 4} width={8} height={8} fill="#fff" stroke="#1976d2" strokeWidth={1} style={{ cursor: 'ew-resize', touchAction: 'none' }} onPointerDown={(e) => onResizeStart(node.id, 'w', e)} />
          <rect x={node.geometry.width - 4} y={node.geometry.height / 2 - 4} width={8} height={8} fill="#fff" stroke="#1976d2" strokeWidth={1} style={{ cursor: 'ew-resize', touchAction: 'none' }} onPointerDown={(e) => onResizeStart(node.id, 'e', e)} />
        </>
      )}
      {childrenNodes.map(renderChild)}
    </g>
  );
});

/**
 * CanvasEngineHost — the React host (Phase 5A §2, ADR-004). This component
 * owns ONLY chrome/DOM plumbing: it reads engine state via useEngineSelector
 * and writes exclusively via useEngineCommands's Command-backed methods.
 *
 * MILESTONE 3 ADDITION ("Basic Components"): an optional `registry` prop.
 * When supplied, non-Rectangle nodes are rendered via each component's
 * registered DesignerComponent (ADR-005 — nodes are never hardcoded per
 * type), a palette lets a designer add any registered component, and
 * selecting a node with a registered definition shows the generic Inspector
 * Generator instead of the Milestone 2 bare geometry readout. Without a
 * registry, the host behaves exactly as it did in Milestone 2 (Rectangle-only,
 * bare readout) — this keeps the existing Milestone 2 sandbox usage working
 * unchanged.
 */
export interface CanvasEngineHostProps {
  engine: CanvasEngine;
  width?: number;
  height?: number;
  onSnapshot?: (snapshotJson: string) => void;
  registry?: ComponentRegistry;
}

interface DragState {
  kind: 'move' | 'marquee' | 'resize';
  startWorld: { x: number; y: number };
  nodeId?: string;
  lastWorld: { x: number; y: number };
  handle?: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
  initialGeometry?: { x: number; y: number; width: number; height: number };
}

export function CanvasEngineHost({ engine, width = 900, height = 600, onSnapshot, registry }: CanvasEngineHostProps) {
  const nodes = useEngineSelector(engine, (s) => s.nodes);
  const viewport = useEngineSelector(engine, (s) => s.viewport);
  const selectedIds = useEngineSelector(engine, (s) => s.selectedIds);
  const canUndo = useEngineSelector(engine, (s) => s.canUndo);
  const canRedo = useEngineSelector(engine, (s) => s.canRedo);
  const commands = useEngineCommands(engine);

  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; worldX: number; worldY: number } | null>(null);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      const screenX = clientX - (rect?.left ?? 0);
      const screenY = clientY - (rect?.top ?? 0);
      return engine.viewport.screenToWorld({ x: screenX, y: screenY });
    },
    [engine],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ignore shortcuts if the user is typing in an input field (e.g. Inspector)
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === '0') {
        e.preventDefault();
        commands.fitToPage({ width: 800, height: 1100 }, { width, height });
      } else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        commands.undo();
      } else if (mod && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        commands.redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        commands.removeSelected();
      } else if (mod && e.key.toLowerCase() === 'c') {
        // Native copy event might be better, but this handles pure canvas state
        commands.copySelected();
      } else if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault(); // Prevent pasting text if focused on SVG
        commands.paste();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        commands.duplicateSelected();
      }
    }
    // Note: React synthetic events are passive for wheel in some setups, but native events can preventDefault if non-passive.
    // For keydown, standard addEventListener works fine.
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commands, width, height]);

    // Pointer Events migration (touch interaction audit, Phase 2): these were
    // onMouseDown/Move/Up, which never fire from a touchscreen -- move,
    // marquee-select, and resize (see onResizeStart below) were all
    // unreachable on a tablet. Pointer Events unify mouse, touch, and pen
    // into one event stream with the same clientX/clientY shape, so the
    // drag-state math below is unchanged; the only additions are
    // setPointerCapture (keeps the drag locked to this element even if the
    // finger moves outside the SVG's bounds mid-gesture, which a bare
    // touchmove would otherwise lose) and a pointercancel handler for
    // gestures the OS/browser interrupts (e.g. an incoming call).
    function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
      if (drag) return; // Prevent double-triggering
      svgRef.current?.setPointerCapture(e.pointerId);
      const world = toWorld(e.clientX, e.clientY);
      const additive = e.shiftKey;
      const hitId = [...nodes].reverse().find(
        (n) =>
          world.x >= n.geometry.x &&
          world.x <= n.geometry.x + n.geometry.width &&
          world.y >= n.geometry.y &&
          world.y <= n.geometry.y + n.geometry.height,
      )?.id;

      if (hitId) {
        if (!selectedIds.includes(hitId) || additive) commands.selectAt(world, additive);
        commands.startTransaction('Move/Resize Nodes');
        setDrag({ kind: 'move', startWorld: world, lastWorld: world, nodeId: hitId });
      } else {
        if (!additive) commands.clearSelection();
        commands.startTransaction('Select Nodes');
        setDrag({ kind: 'marquee', startWorld: world, lastWorld: world });
        setMarqueeRect({ x: world.x, y: world.y, width: 0, height: 0 });
      }
    }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const world = toWorld(e.clientX, e.clientY);
    if (drag.kind === 'move' && drag.nodeId) {
      const isSelected = selectedIds.includes(drag.nodeId);
      const targetIds = isSelected ? selectedIds : [drag.nodeId];
      commands.moveNodes(targetIds, { x: world.x - drag.lastWorld.x, y: world.y - drag.lastWorld.y });
      setDrag({ ...drag, lastWorld: world });
    } else if (drag.kind === 'resize' && drag.nodeId && drag.initialGeometry) {
      const dx = world.x - drag.startWorld.x;
      const dy = world.y - drag.startWorld.y;
      let { x, y, width, height } = drag.initialGeometry;
      
      if (drag.handle?.includes('n')) {
        y += dy;
        height -= dy;
      }
      if (drag.handle?.includes('s')) {
        height += dy;
      }
      if (drag.handle?.includes('w')) {
        x += dx;
        width -= dx;
      }
      if (drag.handle?.includes('e')) {
        width += dx;
      }
      
      commands.updateNodeGeometry(drag.nodeId, { x, y, width, height });
    } else if (drag.kind === 'marquee') {
      const x = Math.min(drag.startWorld.x, world.x);
      const y = Math.min(drag.startWorld.y, world.y);
      setMarqueeRect({ x, y, width: Math.abs(world.x - drag.startWorld.x), height: Math.abs(world.y - drag.startWorld.y) });
    }
  }

  function handlePointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    if (drag?.kind === 'marquee' && marqueeRect) {
      commands.selectRect(marqueeRect, e.shiftKey);
    } else if (drag?.kind === 'move' && drag.nodeId) {
      // Find valid drop target
      const hits = engine.scene.list().filter(n => {
        if (!n.visible || n.id === drag.nodeId) return false;
        const def = registry?.get(n.type);
        if (!def?.canHaveChildren) return false;
        if (!engine.scene.isValidParent(drag.nodeId as string, n.id)) return false;

        // Check child type constraints
        const dragNode = engine.scene.get(drag.nodeId as string);
        if (def.acceptedChildTypes && dragNode && !def.acceptedChildTypes.includes(dragNode.type)) return false;
        
        // Check capacity constraints
        if (def.maxChildren !== undefined) {
          const currentChildren = engine.scene.getChildren(n.id).length;
          if (currentChildren >= def.maxChildren) return false;
        }

        const abs = engine.scene.getAbsoluteGeometry(n.id);
        return drag.lastWorld.x >= abs.x && drag.lastWorld.x <= abs.x + abs.width &&
               drag.lastWorld.y >= abs.y && drag.lastWorld.y <= abs.y + abs.height;
      });
      const dropTarget = hits[hits.length - 1];
      const isSelected = selectedIds.includes(drag.nodeId as string);
      const targetIds = isSelected ? selectedIds : [drag.nodeId as string];
      engine.reparentNodes(targetIds, dropTarget?.id);
    }
    commands.commitTransaction();
    setDrag(null);
    setMarqueeRect(null);
  }

  // Interrupted gesture (e.g. the OS hands the pointer to a system gesture
  // mid-drag) -- abandon cleanly without applying marquee-select or
  // reparent side effects, since we can't trust drag.lastWorld reflects
  // where the user actually intended to end the drag.
  function handlePointerCancel(e: React.PointerEvent<SVGSVGElement>) {
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    commands.commitTransaction();
    setDrag(null);
    setMarqueeRect(null);
  }

  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    // Only zoom if Ctrl or Meta is pressed. Otherwise, let the browser scroll the page naturally.
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = svgRef.current?.getBoundingClientRect();
      const screenPoint = { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      commands.zoomAt(screenPoint, factor);
    }
  }

  function handleContextMenu(e: React.MouseEvent<SVGSVGElement>) {
    e.preventDefault();
    const world = toWorld(e.clientX, e.clientY);
    
    // Select the node under cursor if it's not already selected
    const hitId = [...nodes].reverse().find(
      (n) =>
        world.x >= n.geometry.x &&
        world.x <= n.geometry.x + n.geometry.width &&
        world.y >= n.geometry.y &&
        world.y <= n.geometry.y + n.geometry.height,
    )?.id;

    if (hitId && !selectedIds.includes(hitId)) {
      commands.selectAt(world, false);
    } else if (!hitId) {
      commands.clearSelection();
    }

    setContextMenu({ x: e.clientX, y: e.clientY, worldX: world.x, worldY: world.y });
  }

  // To prevent the browser from zooming the whole page when Ctrl+Wheel is used,
  // we must attach a non-passive native event listener to the SVG element.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    function nativeWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault(); // Prevents whole-page zoom
      }
    }
    el.addEventListener('wheel', nativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', nativeWheel);
  }, []);

  function handleSave() {
    const json = JSON.stringify(commands.exportSnapshot(), null, 2);
    onSnapshot?.(json);
  }

  function handleAddComponent(componentId: string) {
    if (!registry) return;
    const def = registry.get(componentId);
    if (!def) return;
    const size = BASIC_COMPONENT_DEFAULT_SIZE[componentId] ?? { width: 200, height: 40 };
    const props = JSON.parse(JSON.stringify(def.defaultSchema.props ?? {}));
    const fieldKey = (def.defaultSchema as { fieldKey?: string }).fieldKey ?? componentId;
    engine.addComponentNode(componentId, { x: 40, y: 40 }, size, props, fieldKey);
  }

  const selectedNode = selectedIds.length === 1 ? nodes.find((n) => n.id === selectedIds[0]) : undefined;
  const selectedDefinition = selectedNode && registry ? registry.get(selectedNode.type) : undefined;
  const transform = `translate(${viewport.panX}, ${viewport.panY}) scale(${viewport.zoom})`;

  const rootNodes = nodes.filter(n => !n.parentId);
  const childrenByParent = new Map<string, typeof nodes>();
  nodes.forEach(n => {
    if (n.parentId) {
      if (!childrenByParent.has(n.parentId)) childrenByParent.set(n.parentId, []);
      childrenByParent.get(n.parentId)!.push(n);
    }
  });

  // Find the container being hovered over during a drag
  let dragHoverContainerId: string | undefined;
  if (drag?.kind === 'move' && drag.nodeId) {
    const hits = engine.scene.list().filter(n => {
      if (!n.visible || n.id === drag.nodeId) return false;
      const def = registry?.get(n.type);
      if (!def?.canHaveChildren) return false;
      if (!engine.scene.isValidParent(drag.nodeId!, n.id)) return false;
      const abs = engine.scene.getAbsoluteGeometry(n.id);
      return drag.lastWorld.x >= abs.x && drag.lastWorld.x <= abs.x + abs.width &&
             drag.lastWorld.y >= abs.y && drag.lastWorld.y <= abs.y + abs.height;
    });
    dragHoverContainerId = hits[hits.length - 1]?.id;
  }

  const handleResizeStart = useCallback((nodeId: string, handle: string, e: React.PointerEvent) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    // Resize handles stopPropagation, so the SVG's own onPointerDown never
    // fires for this gesture -- capture on the SVG (not the tiny handle
    // rect itself) directly here so pointermove/up delivery survives the
    // finger moving off the 8x8 handle during the resize.
    svgRef.current?.setPointerCapture(e.pointerId);
    const world = toWorld(e.clientX, e.clientY);
    setDrag({
      kind: 'resize',
      startWorld: world,
      lastWorld: world,
      nodeId,
      handle: handle as any,
      initialGeometry: { ...node.geometry }
    });
  }, [nodes, toWorld]);

  const renderNode = useCallback((node: typeof nodes[0]) => {
    const isSelected = selectedIds.includes(node.id);
    const children = childrenByParent.get(node.id) || [];
    const isHoveredContainer = dragHoverContainerId === node.id;
    return (
      <MemoizedNode 
        key={node.id} 
        node={node} 
        isSelected={isSelected} 
        isHoveredContainer={isHoveredContainer} 
        childrenNodes={children} 
        registry={registry} 
        renderChild={renderNode} 
        onResizeStart={handleResizeStart}
      />
    );
  }, [selectedIds, childrenByParent, dragHoverContainerId, registry, handleResizeStart]);

  return (
    <div data-testid="canvas-engine-host" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ background: '#fafafa', cursor: drag ? 'grabbing' : 'default', display: 'block', touchAction: 'none' }}
        onPointerDown={(e) => {
          setContextMenu(null);
          handlePointerDown(e);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      >
        <g transform={transform}>
          {rootNodes.map(renderNode)}
          {marqueeRect && (
            <rect
              data-testid="marquee"
              x={marqueeRect.x}
              y={marqueeRect.y}
              width={marqueeRect.width}
              height={marqueeRect.height}
              fill="rgba(25,118,210,0.1)"
              stroke="#1976d2"
              strokeDasharray="4 2"
            />
          )}
        </g>
      </svg>

      {contextMenu && (
        <div
          style={{
            position: 'absolute',
            top: contextMenu.y,
            left: contextMenu.x,
            background: '#fff',
            border: '1px solid #ccc',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            borderRadius: 4,
            padding: '4px 0',
            zIndex: 1000,
            minWidth: 160,
            display: 'flex',
            flexDirection: 'column',
          }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <button
            type="button"
            style={{ padding: '8px 16px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%' }}
            onClick={() => {
              commands.removeSelected();
              setContextMenu(null);
            }}
            disabled={selectedIds.length === 0}
          >
            Delete Selected
          </button>
          <button
            type="button"
            style={{ padding: '8px 16px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%' }}
            onClick={() => {
              commands.undo();
              setContextMenu(null);
            }}
            disabled={!canUndo}
          >
            Undo
          </button>
          <button
            type="button"
            style={{ padding: '8px 16px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%' }}
            onClick={() => {
              commands.redo();
              setContextMenu(null);
            }}
            disabled={!canRedo}
          >
            Redo
          </button>
        </div>
      )}

      {/* Touch fallback for Delete (touch interaction audit, Phase 2 --
          Critical): removing a selected node used to be reachable ONLY via
          the Delete/Backspace keyboard shortcut (handled in the keydown
          listener above) or this right-click context menu -- neither works
          on a touchscreen with no physical keyboard and no reliable
          long-press-to-contextmenu on an SVG canvas. This floating toolbar
          is always visible and always tappable the moment something is
          selected, with no hidden gesture or keyboard dependency. Calls the
          exact same `commands.removeSelected()` the keyboard shortcut and
          context menu item already use. */}
      {selectedIds.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 900,
            display: 'flex',
            gap: 4,
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: 6,
            boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
            padding: 4,
          }}
        >
          <button
            type="button"
            aria-label={`Delete ${selectedIds.length > 1 ? `${selectedIds.length} selected items` : 'selected item'}`}
            title="Delete"
            onClick={() => commands.removeSelected()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 4, border: 'none',
              background: '#fef2f2', color: '#dc2626', cursor: 'pointer',
              fontSize: 13, fontWeight: 500, minHeight: 36,
            }}
          >
            <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m2 0v13a2 2 0 01-2 2H8a2 2 0 01-2-2V7h12z" />
            </svg>
            Delete{selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}
          </button>
        </div>
      )}
    </div>
  );
}
