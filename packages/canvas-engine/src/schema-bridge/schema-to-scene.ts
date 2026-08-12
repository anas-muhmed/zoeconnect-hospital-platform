import type { FormSchema } from '@hdsp/form-schema';
import type { SceneNode } from '../scene/scene-node';
import type { CanvasEngine } from '../engine/canvas-engine';

/**
 * Deserializes a FormSchema into a CanvasEngine's scene (ADR-001, Milestone 3)
 * — the "Reload" half of Design→Save→Reload→Render. Milestone 3 has no
 * multi-page canvas UI yet, so all pages' components are flattened onto the
 * single scene the engine hosts; real multi-page navigation is later
 * milestone work (Phase 3 §2's page model).
 */
export function loadFormSchemaIntoEngine(schema: FormSchema, engine: CanvasEngine): void {
  const nodes: SceneNode[] = [];

  function processComponent(c: import('@hdsp/form-schema').ComponentNode, parentId?: string) {
    nodes.push({
      id: c.id,
      type: c.type,
      fieldKey: c.fieldKey,
      geometry: {
        x: c.geometry.x,
        y: c.geometry.y,
        width: c.geometry.w,
        height: c.geometry.h,
        rotation: c.geometry.rotation,
      },
      zIndex: c.geometry.z,
      locked: false,
      visible: true,
      props: c.layout ? { ...c.props, layout: c.layout } : c.props,
      parentId,
    });
    
    if (c.children && c.children.length > 0) {
      for (const child of c.children) {
        processComponent(child, c.id);
      }
    }
  }

  for (const page of schema.pages) {
    for (const c of page.components) {
      processComponent(c);
    }
  }
  engine.loadNodes(nodes);
}
