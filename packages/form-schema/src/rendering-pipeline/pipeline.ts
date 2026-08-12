import type { FormSchema, PageNode } from '../schema/form-schema.types';

/**
 * Six-stage rendering pipeline (ADR-007): Resolver → Layout → Rule →
 * Permission → Theme → Renderer. Every render — Designer preview and
 * production Runtime alike — passes through the same stages, so
 * preview-equals-runtime is structural, not merely tested for.
 *
 * MILESTONE 4 SCOPE: only the Renderer stage (mounting components against a
 * schema) has real content. The other five stages are pass-through
 * identity functions — there is no branch/department override data yet
 * (Resolver, Milestone 5 — ADR-011), no computed layout beyond each
 * component's own stored geometry (Layout, later), no Rule Engine
 * (Milestone 5), no Permission Engine (later), and no Theme/Design Tokens
 * wiring yet (later). Declaring them now — even as no-ops — means later
 * milestones fill in a stage's real logic without restructuring the
 * pipeline shape itself.
 */
import type { Operation } from 'fast-json-patch';
import { interpolateVariables } from './variables-engine';
import { RuleEngine } from './rule-engine';
import { applySchemaOverrides } from './resolver-engine';

export interface RenderContext {
  branchId?: string;
  departmentCode?: string;
  userId?: string;
  userRoles?: string[];
  
  // Milestone 5 additions
  patches?: Operation[];
  variables?: Record<string, unknown>;
  formData?: Record<string, any>;
}

export type PipelineStage = (schema: FormSchema, ctx: RenderContext) => FormSchema;

/** Resolver stage — branch/department override merge. (Milestone 5, ADR-011) */
export const resolverStage: PipelineStage = (schema, ctx) => {
  if (ctx.patches && ctx.patches.length > 0) {
    return applySchemaOverrides(schema, ctx.patches);
  }
  return schema;
};

/** Layout stage — computed/responsive layout beyond stored geometry. Pass-through. */
export const layoutStage: PipelineStage = (schema) => schema;

/** Rule stage — visibleIf evaluation and variable interpolation. (Milestone 5) */
export const ruleStage: PipelineStage = (schema, ctx) => {
  // 1. Interpolate string variables
  let resolvedSchema = interpolateVariables(schema, ctx);
  
  // 2. Evaluate rules (visibleIf)
  const formData = ctx.formData || {};
  const evalContext = { ...formData, ...(ctx.variables || {}) };
  
  const filterInvisible = (components: import('../schema/form-schema.types').ComponentNode[]) => {
    return components.filter(c => {
      // visibleIf explicitly evaluating to false hides the component.
      if (c.logic?.visibleIf) {
        const isVisible = RuleEngine.evaluate(c.logic.visibleIf, evalContext);
        if (!isVisible) return false;
      }
      
      // Recursively filter children
      if (c.children && c.children.length > 0) {
        c.children = filterInvisible(c.children);
      }
      return true;
    });
  };
  
  resolvedSchema.pages.forEach(page => {
    page.components = filterInvisible(page.components);
  });
  
  return resolvedSchema;
};

/** Permission stage — per-field visibleTo/editableBy enforcement. */
export const permissionStage: PipelineStage = (schema, ctx) => {
  const userRoles = ctx.userRoles || [];

  const filterPermissions = (components: import('../schema/form-schema.types').ComponentNode[]) => {
    return components.filter(c => {
      // 1. Check visibleTo
      if (c.permissions?.visibleTo && c.permissions.visibleTo.length > 0) {
        const canSee = c.permissions.visibleTo.some(role => userRoles.includes(role));
        if (!canSee) return false;
      }
      
      // 2. Check editableBy
      if (c.permissions?.editableBy && c.permissions.editableBy.length > 0) {
        const canEdit = c.permissions.editableBy.some(role => userRoles.includes(role));
        if (!canEdit) {
          // If not editable, we force it to be readOnly
          c.logic = c.logic || {};
          // Convert the current logic to statically read-only
          c.logic.readOnlyIf = { op: 'CONST', value: true };
        }
      }

      if (c.children && c.children.length > 0) {
        c.children = filterPermissions(c.children);
      }
      return true;
    });
  };

  schema.pages.forEach(page => {
    page.components = filterPermissions(page.components);
  });

  return schema;
};

/** Theme stage — Design Token resolution. Pass-through. */
export const themeStage: PipelineStage = (schema) => schema;

/**
 * Composes all six stages in ADR-007's fixed order. The Renderer stage
 * itself is not a data transform (it mounts React components), so it is
 * NOT part of this function — this returns the fully-resolved schema that
 * a Renderer (e.g. @hdsp/form-renderer-react's FormRenderer) then mounts.
 */
export function resolveRenderTree(schema: FormSchema, ctx: RenderContext = {}): FormSchema {
  return [resolverStage, layoutStage, ruleStage, permissionStage, themeStage].reduce(
    (acc, stage) => stage(acc, ctx),
    schema,
  );
}

/** Convenience accessor — most Milestone 4 consumers only care about the first page. */
export function getPage(schema: FormSchema, pageId: string): PageNode | undefined {
  return schema.pages.find((p) => p.id === pageId);
}
