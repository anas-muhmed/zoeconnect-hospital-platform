import { SceneNode, Geometry } from './scene-node';
import { EventBus } from '../events/event-bus';

/**
 * SceneGraph — owns the set of nodes on a single page/canvas (Phase 3 §2).
 * Milestone 2 uses a flat map (no page/layer hierarchy yet — that is later
 * milestone content); hit-testing is a simple reverse-zIndex linear scan,
 * which comfortably meets the Milestone 2 exit criterion's 500-node budget.
 * A real spatial index (quadtree/R-tree) is deferred until profiling on real
 * documents shows the linear scan is insufficient (Execution Mode Rule 1 —
 * only revisit a decision for a measured performance issue, not speculatively).
 */
export class SceneGraph {
  private nodes = new Map<string, SceneNode>();

  constructor(private readonly bus: EventBus) {}

  add(node: SceneNode): void {
    if (this.nodes.has(node.id)) {
      throw new Error(`SceneGraph: node "${node.id}" already exists`);
    }
    this.nodes.set(node.id, node);
    this.bus.emit({ type: 'scene:changed' });
  }

  remove(id: string): SceneNode | undefined {
    const node = this.nodes.get(id);
    if (node) {
      this.nodes.delete(id);
      this.bus.emit({ type: 'scene:changed' });
    }
    return node;
  }

  get(id: string): SceneNode | undefined {
    return this.nodes.get(id);
  }

  has(id: string): boolean {
    return this.nodes.has(id);
  }

  updateGeometry(id: string, geometry: Partial<Geometry>): void {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`SceneGraph: node "${id}" not found`);
    node.geometry = { ...node.geometry, ...geometry };
    this.bus.emit({ type: 'scene:changed' });
  }

  /** Restores a node's geometry without validation — used by undo. */
  setGeometry(id: string, geometry: Geometry): void {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`SceneGraph: node "${id}" not found`);
    node.geometry = geometry;
    this.bus.emit({ type: 'scene:changed' });
  }

  /** Replaces a node's props wholesale — used by SetPropsCommand (Milestone 3
   * Inspector Generator edits) and by undo. */
  setProps(id: string, props: unknown): void {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`SceneGraph: node "${id}" not found`);
    node.props = props;
    this.bus.emit({ type: 'scene:changed' });
  }

  setParent(id: string, parentId?: string): void {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`SceneGraph: node "${id}" not found`);
    if (parentId && !this.nodes.has(parentId)) throw new Error(`SceneGraph: parent "${parentId}" not found`);
    if (parentId && !this.isValidParent(id, parentId)) throw new Error(`SceneGraph: invalid parent assignment (cycle or self)`);
    node.parentId = parentId;
    this.bus.emit({ type: 'scene:changed' });
  }

  getChildren(parentId?: string): SceneNode[] {
    return this.list().filter(n => n.parentId === parentId);
  }

  getDescendants(id: string): SceneNode[] {
    const children = this.getChildren(id);
    return children.reduce((acc, child) => {
      return [...acc, child, ...this.getDescendants(child.id)];
    }, [] as SceneNode[]);
  }

  isValidParent(childId: string, parentId: string): boolean {
    if (childId === parentId) return false;
    const descendants = this.getDescendants(childId);
    if (descendants.find(d => d.id === parentId)) return false;
    return true;
  }

  getAbsoluteGeometry(id: string): Geometry {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`SceneGraph: node "${id}" not found`);
    if (!node.parentId) return node.geometry;
    
    const parentAbs = this.getAbsoluteGeometry(node.parentId);
    return {
      ...node.geometry,
      x: parentAbs.x + node.geometry.x,
      y: parentAbs.y + node.geometry.y,
    };
  }

  toLocal(parentId: string, worldPoint: { x: number; y: number }): { x: number; y: number } {
    const parentAbs = this.getAbsoluteGeometry(parentId);
    return { x: worldPoint.x - parentAbs.x, y: worldPoint.y - parentAbs.y };
  }

  toWorld(id: string, localPoint: { x: number; y: number }): { x: number; y: number } {
    const node = this.nodes.get(id);
    if (!node) return localPoint;
    if (!node.parentId) return localPoint;
    const parentAbs = this.getAbsoluteGeometry(node.parentId);
    return { x: parentAbs.x + localPoint.x, y: parentAbs.y + localPoint.y };
  }

  /** All nodes, back-to-front render order (ascending zIndex). */
  list(): SceneNode[] {
    return [...this.nodes.values()].sort((a, b) => a.zIndex - b.zIndex);
  }

  size(): number {
    return this.nodes.size;
  }

  clear(): void {
    this.nodes.clear();
    this.bus.emit({ type: 'scene:changed' });
  }

  /** Bulk-replaces the entire node set — used when loading a saved document
   * (Milestone 3's "Reload" step). Bypasses the command system entirely: a
   * freshly loaded document is not an undoable edit, it's a fresh starting
   * state (the engine facade also clears CommandHistory alongside this). */
  replaceAll(nodes: SceneNode[]): void {
    this.nodes = new Map(nodes.map((n) => [n.id, n]));
    this.bus.emit({ type: 'scene:changed' });
  }

  /** Topmost node under a world-space point, or undefined. */
  hitTest(point: { x: number; y: number }): SceneNode | undefined {
    const hits = this.list().filter((n) => {
      if (!n.visible) return false;
      const abs = this.getAbsoluteGeometry(n.id);
      return (
        point.x >= abs.x &&
        point.x <= abs.x + abs.width &&
        point.y >= abs.y &&
        point.y <= abs.y + abs.height
      );
    });
    return hits[hits.length - 1];
  }

  /** All nodes whose bounding box intersects a world-space marquee rect. */
  queryRect(rect: Geometry): SceneNode[] {
    const x2 = rect.x + rect.width;
    const y2 = rect.y + rect.height;
    return this.list().filter((n) => {
      if (!n.visible) return false;
      const abs = this.getAbsoluteGeometry(n.id);
      const nx2 = abs.x + abs.width;
      const ny2 = abs.y + abs.height;
      return abs.x < x2 && nx2 > rect.x && abs.y < y2 && ny2 > rect.y;
    });
  }

  nextZIndex(): number {
    return this.nodes.size === 0 ? 0 : Math.max(...[...this.nodes.values()].map((n) => n.zIndex)) + 1;
  }
}
