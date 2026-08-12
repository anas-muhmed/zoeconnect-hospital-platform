import { EventBus, EngineEventType } from '../events/event-bus';
import { SceneGraph } from '../scene/scene-graph';
import { SceneNode, Geometry, createRectangleNode } from '../scene/scene-node';
import { Viewport, ViewportState, Point } from '../viewport/viewport';
import { SelectionModel } from '../selection/selection-model';
import { CommandHistory } from '../commands/command-history';
import { AddNodeCommand, RemoveNodeCommand, SetGeometryCommand, SetPropsCommand, ReparentNodeCommand, CompoundCommand } from '../commands/scene-commands';
import { snapToGrid } from '../grid/grid';

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export interface CanvasEngineState {
  nodes: SceneNode[];
  viewport: ViewportState;
  selectedIds: string[];
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * CanvasEngine — the facade combining SceneGraph, Viewport, SelectionModel,
 * CommandHistory and the EventBus into the single object the React host
 * (canvas-engine-react) talks to. This is intentionally the ONLY public
 * surface canvas-engine-react depends on, keeping ADR-004's boundary (React
 * reads via selectors, writes via commands) enforceable in one place.
 */
import { DocumentModel, PageModel } from './document-model';

export class CanvasEngine {
  readonly bus = new EventBus();
  readonly document: DocumentModel;
  activePageId: string;
  readonly viewport: Viewport;
  readonly selection: SelectionModel;
  readonly history: CommandHistory;
  gridSize = 10;
  snapEnabled = true;
  private clipboard: SceneNode[] = [];

  constructor() {
    this.document = new DocumentModel(nextId('doc'), 'Untitled Document');
    const firstPage = new PageModel(nextId('page'), 'Page 1', 800, 1100, this.bus);
    this.document.addPage(firstPage);
    this.activePageId = firstPage.id;

    this.viewport = new Viewport(this.bus);
    this.selection = new SelectionModel(this.bus);
    this.history = new CommandHistory(this.bus);
  }

  get scene(): SceneGraph {
    return this.document.getPage(this.activePageId)!.scene;
  }


  subscribe(listener: () => void): () => void {
    const types: EngineEventType[] = ['scene:changed', 'selection:changed', 'viewport:changed', 'history:changed'];
    const offs = types.map((t) => this.bus.on(t, listener));
    return () => offs.forEach((off) => off());
  }

  getState(): CanvasEngineState {
    return {
      nodes: this.scene.list(),
      viewport: this.viewport.getState(),
      selectedIds: this.selection.getSelectedIds(),
      canUndo: this.history.canUndo(),
      canRedo: this.history.canRedo(),
    };
  }

  private applySnap(point: Point): Point {
    return this.snapEnabled ? snapToGrid(point, this.gridSize) : point;
  }

  /** Adds a rectangle at a world-space point (Milestone 2's test shape — kept
   * for regression, not part of Milestone 3's real component set). */
  addRectangle(topLeft: Point, size: { width: number; height: number } = { width: 120, height: 80 }): string {
    const snapped = this.applySnap(topLeft);
    const node = createRectangleNode(
      nextId('rect'),
      { x: snapped.x, y: snapped.y, width: size.width, height: size.height },
      this.scene.nextZIndex(),
    );
    this.history.execute(new AddNodeCommand(this.scene, node));
    this.selection.select(node.id);
    return node.id;
  }

  /**
   * Run a callback inside a history transaction.
   * All commands dispatched during the callback will be batched into a single compound command.
   */
  transaction(name: string, callback: () => void): void {
    this.history.startTransaction(name);
    try {
      callback();
      this.history.commitTransaction();
    } catch (e) {
      this.history.cancelTransaction();
      throw e;
    }
  }

  /**
   * Start a history transaction for async operations (e.g. drag and drop).
   */
  startTransaction(name: string = 'Transaction'): void {
    this.history.startTransaction(name);
  }

  /**
   * Commit a history transaction.
   */
  commitTransaction(): void {
    this.history.commitTransaction();
  }

  /**
   * Cancel a history transaction.
   */
  cancelTransaction(): void {
    this.history.cancelTransaction();
  }

  /**
   * Adds a node of any registered component type (Milestone 3, ADR-005: the
   * engine stays generic — it does not know about the Component Registry or
   * any specific component; the palette/React layer supplies `type`/`props`
   * from the registry's `defaultSchema`, this method just places a SceneNode).
   */
  addComponentNode(
    type: string,
    topLeft: Point,
    size: { width: number; height: number },
    props: unknown,
    fieldKey?: string,
    parentId?: string,
  ): string {
    const snapped = this.applySnap(topLeft);
    const node: SceneNode = {
      id: nextId(type),
      type,
      geometry: { x: snapped.x, y: snapped.y, width: size.width, height: size.height },
      zIndex: this.scene.nextZIndex(),
      locked: false,
      visible: true,
      props,
      fieldKey,
      parentId,
    };
    this.history.execute(new AddNodeCommand(this.scene, node));
    this.selection.select(node.id);
    return node.id;
  }

  /** Milestone 3 — backs the Inspector Generator's property edits. */
  setNodeProps(nodeId: string, nextProps: unknown): void {
    const node = this.scene.get(nodeId);
    if (!node) return;
    this.history.execute(new SetPropsCommand(this.scene, nodeId, nextProps, node.props));
  }

  removeNode(nodeId: string): void {
    this.history.execute(new RemoveNodeCommand(this.scene, nodeId));
    this.selection.prune(new Set(this.scene.list().map((n) => n.id)));
  }

  removeSelected(): void {
    const ids = this.selection.getSelectedIds();
    if (ids.length === 0) return;
    const commands = ids.map((id) => new RemoveNodeCommand(this.scene, id));
    this.history.execute(new CompoundCommand('Remove Nodes', commands));
    this.selection.prune(new Set(this.scene.list().map((n) => n.id)));
  }

  copySelected(): void {
    const ids = this.selection.getSelectedIds();
    this.clipboard = ids.map(id => {
      const node = this.scene.get(id);
      return node ? JSON.parse(JSON.stringify(node)) : null;
    }).filter(Boolean) as SceneNode[];
  }

  paste(): void {
    if (this.clipboard.length === 0) return;
    
    // Offset pasted nodes so they don't exactly overlap
    const offset = this.gridSize * 2;
    
    const commands: AddNodeCommand[] = [];
    const newIds: string[] = [];

    this.clipboard.forEach(node => {
      const newNode: SceneNode = {
        ...JSON.parse(JSON.stringify(node)),
        id: nextId(node.type || 'copy'),
        geometry: {
          ...node.geometry,
          x: node.geometry.x + offset,
          y: node.geometry.y + offset
        },
        zIndex: this.scene.nextZIndex()
      };
      
      if (newNode.fieldKey) {
        const match = newNode.fieldKey.match(/_copy_?(\d+)?$/);
        if (match) {
           const num = parseInt(match[1] || '1', 10);
           newNode.fieldKey = newNode.fieldKey.replace(/_copy_?(\d+)?$/, `_copy_${num + 1}`);
        } else {
           newNode.fieldKey = `${newNode.fieldKey}_copy`;
        }
      }

      commands.push(new AddNodeCommand(this.scene, newNode));
      newIds.push(newNode.id);
    });

    this.history.execute(new CompoundCommand('Paste Nodes', commands));
    this.selection.clear();
    newIds.forEach(id => this.selection.select(id));

    // Update clipboard coordinates so next paste offsets again
    this.clipboard.forEach(node => {
      node.geometry.x += offset;
      node.geometry.y += offset;
    });
  }

  duplicateSelected(): void {
    this.copySelected();
    this.paste();
  }

  moveNodes(nodeIds: string[], delta: Point): void {
    const commands = nodeIds.map(nodeId => {
      const node = this.scene.get(nodeId);
      if (!node) return null;
      const prev = node.geometry;
      const snapped = this.applySnap({ x: prev.x + delta.x, y: prev.y + delta.y });
      const next: Geometry = { ...prev, x: snapped.x, y: snapped.y };
      return new SetGeometryCommand(this.scene, nodeId, next, prev);
    }).filter(Boolean) as SetGeometryCommand[];

    if (commands.length > 0) {
      this.history.execute(new CompoundCommand('Move Nodes', commands));
    }
  }

  resizeNode(nodeId: string, size: { width: number; height: number }): void {
    this.updateNodeGeometry(nodeId, { width: Math.max(1, size.width), height: Math.max(1, size.height) });
  }

  updateNodeGeometry(nodeId: string, geom: { x?: number, y?: number, width?: number, height?: number }): void {
    const node = this.scene.get(nodeId);
    if (!node) return;
    const prev = node.geometry;
    let next: Geometry = { ...prev };
    if (geom.x !== undefined) next.x = geom.x;
    if (geom.y !== undefined) next.y = geom.y;
    if (geom.width !== undefined) next.width = Math.max(1, geom.width);
    if (geom.height !== undefined) next.height = Math.max(1, geom.height);
    
    // Snap to grid for position and size
    if (this.snapEnabled) {
       next.x = Math.round(next.x / this.gridSize) * this.gridSize;
       next.y = Math.round(next.y / this.gridSize) * this.gridSize;
       next.width = Math.round(next.width / this.gridSize) * this.gridSize;
       next.height = Math.round(next.height / this.gridSize) * this.gridSize;
       // Ensure min size after snap
       next.width = Math.max(this.gridSize, next.width);
       next.height = Math.max(this.gridSize, next.height);
    }
    
    this.history.execute(new SetGeometryCommand(this.scene, nodeId, next, prev));
  }

  reparentNodes(nodeIds: string[], parentId?: string): void {
    const commands = nodeIds.map(nodeId => {
      const node = this.scene.get(nodeId);
      if (!node) return null;
      if (parentId && !this.scene.isValidParent(nodeId, parentId)) return null;
      if (node.parentId === parentId) return null;

      const abs = this.scene.getAbsoluteGeometry(nodeId);
      const nextGeom = parentId ? this.scene.toLocal(parentId, abs) : { x: abs.x, y: abs.y };
      const nextGeometry = { ...node.geometry, x: nextGeom.x, y: nextGeom.y };

      return new ReparentNodeCommand(
        this.scene,
        nodeId,
        parentId,
        nextGeometry,
        node.parentId,
        node.geometry
      );
    }).filter(Boolean) as ReparentNodeCommand[];

    if (commands.length > 0) {
      this.history.execute(new CompoundCommand('Reparent Nodes', commands));
    }
  }

  undo(): void {
    this.history.undo();
  }

  redo(): void {
    this.history.redo();
  }

  /** Marquee/single/toggle selection over a screen-space rect (already world-space here). */
  selectAt(point: Point, additive = false): void {
    const hit = this.scene.hitTest(point);
    if (!hit) {
      if (!additive) this.selection.clear();
      return;
    }
    if (additive) this.selection.toggle(hit.id);
    else this.selection.select(hit.id);
  }

  selectRect(rect: Geometry, additive = false): void {
    const hits = this.scene.queryRect(rect).map((n) => n.id);
    if (additive) hits.forEach((id) => this.selection.toggle(id));
    else this.selection.selectMany(hits);
  }

  /** Milestone 2's "manual save" — a client-side schema snapshot. Milestone 3
   * adds the real Document Engine round trip via schema-bridge.ts; this stays
   * for the Milestone 2 sandbox's still-supported client-only export. */
  exportSnapshot(): SceneNode[] {
    return this.scene.list();
  }

  /**
   * Loads a full node set (e.g. from schema-bridge's loadFormSchemaIntoEngine)
   * as a fresh document state: replaces the scene wholesale, clears selection
   * and undo history. Not itself undoable — see SceneGraph.replaceAll's
   * docblock for why loading is not a Command.
   */
  loadNodes(nodes: SceneNode[]): void {
    this.scene.replaceAll(nodes);
    this.selection.clear();
    this.history.clear();
  }
}
