import type { FormSchema, PageNode, ComponentNode, PageSize, PageOrientation } from '@hdsp/form-schema';
import { CURRENT_SCHEMA_VERSION } from '@hdsp/form-schema';
import type { CanvasEngine } from '../engine/canvas-engine';

export interface SceneToSchemaMeta {
  formId: string;
  category: FormSchema['category'];
  pageId: string;
  pageSize?: PageSize;
  pageOrientation?: PageOrientation;
}

/**
 * Serializes a CanvasEngine's current scene into a FormSchema (ADR-001,
 * Milestone 3). This is the "Save" half of Design→Save→Reload→Render — the
 * engine has zero opinion about persistence; this is pure data mapping.
 * The Milestone 2 Rectangle test shape is intentionally excluded: only real,
 * registered form components round-trip through the Document Engine.
 */
export function sceneGraphToFormSchema(engine: CanvasEngine, meta: SceneToSchemaMeta): FormSchema {
  const nodes = engine.getState().nodes.filter((n) => n.type !== 'rectangle');

  const rawComponents = new Map<string, ComponentNode>();
  const rootComponents: ComponentNode[] = [];

  // First pass: create all component nodes (flat)
  for (const n of nodes) {
    rawComponents.set(n.id, {
      id: n.id,
      type: n.type,
      fieldKey: n.fieldKey ?? n.id,
      geometry: {
        x: n.geometry.x,
        y: n.geometry.y,
        w: n.geometry.width,
        h: n.geometry.height,
        rotation: n.geometry.rotation,
        z: n.zIndex,
        pageId: meta.pageId,
      },
      props: n.props,
      validation: [],
      logic: {},
      binding: null,
      permissions: { visibleTo: [], editableBy: [] },
      audit: { trackChanges: true },
      // Milestone 5: Layout behavior from props if defined
      layout: (n.props as any).layout,
      children: [],
    });
  }

  // Second pass: wire up children based on parentId
  for (const n of nodes) {
    const component = rawComponents.get(n.id)!;
    if (n.parentId && rawComponents.has(n.parentId)) {
      rawComponents.get(n.parentId)!.children!.push(component);
    } else {
      rootComponents.push(component);
    }
  }

  // Cleanup empty children arrays for cleaner JSON
  for (const comp of rawComponents.values()) {
    if (comp.children && comp.children.length === 0) {
      delete comp.children;
    }
  }

  const page: PageNode = {
    id: meta.pageId,
    size: meta.pageSize ?? 'A4',
    orientation: meta.pageOrientation ?? 'portrait',
    components: rootComponents,
  };

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    formId: meta.formId,
    category: meta.category,
    pages: [page],
    dataSources: [],
  };
}
