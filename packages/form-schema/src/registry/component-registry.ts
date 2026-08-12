import type { ComponentDefinition } from './component-definition';

/**
 * ComponentRegistry — the single registration point for every component type in
 * the platform (ADR-005). Milestone 1 scope: registration mechanics only (register/
 * get/list/has/unregister). No real components are registered yet — those land
 * wave-by-wave starting Milestone 3 (docs/architecture/MILESTONE_PLAN.md).
 *
 * This class is deliberately framework-agnostic (no NestJS DI, no React) so both
 * the backend (server-side validation, Phase 2 §3.3) and the frontend (palette,
 * canvas, renderer) can share one instance shape without a circular dependency.
 * Each runtime constructs and owns its own instance and registers into it —
 * sharing the *type*, not a single cross-process object.
 */
export class ComponentRegistry {
  private readonly entries = new Map<string, ComponentDefinition<any, any>>();

  register(definition: ComponentDefinition<any, any>): void {
    if (this.entries.has(definition.id)) {
      throw new Error(
        `ComponentRegistry: a component with id "${definition.id}" is already registered. ` +
          `Component ids must be unique across core components and all active plugins.`,
      );
    }
    this.entries.set(definition.id, definition);
  }

  unregister(id: string): void {
    this.entries.delete(id);
  }

  get(id: string): ComponentDefinition<any, any> | undefined {
    return this.entries.get(id);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  list(): ComponentDefinition<any, any>[] {
    return Array.from(this.entries.values());
  }

  listByCategory(category: ComponentDefinition['category']): ComponentDefinition<any, any>[] {
    return this.list().filter((d) => d.category === category);
  }

  clear(): void {
    this.entries.clear();
  }
}
