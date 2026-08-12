/**
 * @hdsp/canvas-engine — framework-agnostic canvas engine core (ADR-004).
 *
 * MILESTONE 3 ADDITION ("Basic Components", docs/architecture/MILESTONE_PLAN.md):
 * a FormSchema<->SceneGraph bridge (schema-bridge/) wiring the engine to
 * ADR-001's FormSchema — the "Save"/"Reload" halves of Design→Save→Reload→Render.
 * This depends on @hdsp/form-schema (data-only: types + zod + semver, not
 * React/DOM), which does not violate ADR-004's zero-React/DOM constraint —
 * see the package-boundary test for what IS enforced (no react/react-dom).
 *
 * MILESTONE 2 SCOPE ("Canvas Core"): scene graph, viewport (pan/zoom/fit),
 * selection (single/multi/marquee), grid + snap-to-grid, and a command system
 * with undo/redo — proven against one test-only Rectangle node.
 */
export const CANVAS_ENGINE_VERSION = '0.3.0-milestone3-basic-components';

export * from './scene/scene-node';
export * from './scene/scene-graph';
export * from './viewport/viewport';
export * from './selection/selection-model';
export * from './grid/grid';
export * from './events/event-bus';
export * from './commands/command';
export * from './commands/command-history';
export * from './commands/scene-commands';
export * from './engine/canvas-engine';
export * from './schema-bridge/scene-to-schema';
export * from './schema-bridge/schema-to-scene';
