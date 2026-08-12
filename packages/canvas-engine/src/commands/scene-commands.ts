import { Command } from './command';
import { SceneGraph } from '../scene/scene-graph';
import { SceneNode, Geometry } from '../scene/scene-node';

export class CompoundCommand implements Command {
  constructor(readonly name: string, private readonly commands: Command[]) {}
  execute(): void {
    this.commands.forEach((c) => c.execute());
  }
  undo(): void {
    // Undo in reverse order
    [...this.commands].reverse().forEach((c) => c.undo());
  }
}

export class AddNodeCommand implements Command {
  readonly name = 'Add Node';
  constructor(private readonly graph: SceneGraph, private readonly node: SceneNode) {}
  execute(): void {
    this.graph.add(this.node);
  }
  undo(): void {
    this.graph.remove(this.node.id);
  }
}

export class RemoveNodeCommand implements Command {
  readonly name = 'Remove Node';
  private removedNodes: SceneNode[] = [];
  constructor(private readonly graph: SceneGraph, private readonly nodeId: string) {}
  execute(): void {
    const descendants = this.graph.getDescendants(this.nodeId);
    // Remove descendants first (bottom-up) so we don't violate integrity
    const toRemove = [...descendants.reverse(), this.graph.get(this.nodeId)].filter(Boolean) as SceneNode[];
    this.removedNodes = toRemove;
    toRemove.forEach(n => this.graph.remove(n.id));
  }
  undo(): void {
    // Add back top-down
    [...this.removedNodes].reverse().forEach(n => this.graph.add(n));
  }
}

/** Covers both move and resize — both are just a geometry replacement. */
export class SetGeometryCommand implements Command {
  readonly name = 'Move/Resize Node';
  constructor(
    private readonly graph: SceneGraph,
    private readonly nodeId: string,
    private readonly nextGeometry: Geometry,
    private readonly prevGeometry: Geometry,
  ) {}
  execute(): void {
    this.graph.setGeometry(this.nodeId, this.nextGeometry);
  }
  undo(): void {
    this.graph.setGeometry(this.nodeId, this.prevGeometry);
  }
}

/** Milestone 3 — backs Inspector Generator edits (Phase 5B §2). */
export class SetPropsCommand implements Command {
  readonly name = 'Edit Properties';
  constructor(
    private readonly graph: SceneGraph,
    private readonly nodeId: string,
    private readonly nextProps: unknown,
    private readonly prevProps: unknown,
  ) {}
  execute(): void {
    this.graph.setProps(this.nodeId, this.nextProps);
  }
  undo(): void {
    this.graph.setProps(this.nodeId, this.prevProps);
  }
}

export class ReparentNodeCommand implements Command {
  readonly name = 'Reparent Node';
  constructor(
    private readonly graph: SceneGraph,
    private readonly nodeId: string,
    private readonly nextParentId: string | undefined,
    private readonly nextGeometry: Geometry,
    private readonly prevParentId: string | undefined,
    private readonly prevGeometry: Geometry,
  ) {}
  execute(): void {
    this.graph.setParent(this.nodeId, this.nextParentId);
    this.graph.setGeometry(this.nodeId, this.nextGeometry);
  }
  undo(): void {
    this.graph.setParent(this.nodeId, this.prevParentId);
    this.graph.setGeometry(this.nodeId, this.prevGeometry);
  }
}
