import type { FormSchema, ComponentNode } from '../schema/form-schema.types';
import type { RenderContext } from './pipeline';

/**
 * Variables Engine (Phase 5B)
 * Traverses the schema and replaces {{variable.name}} mustache-style templates
 * in text properties with actual values from the RenderContext or a provided data object.
 */
export function interpolateVariables(schema: FormSchema, ctx: RenderContext): FormSchema {
  // Deep clone to avoid mutating the original schema (if not already cloned)
  const resolvedSchema: FormSchema = JSON.parse(JSON.stringify(schema));

  const variablesMap: Record<string, any> = {
    'branchId': ctx.branchId ?? '',
    'departmentCode': ctx.departmentCode ?? '',
    'userId': ctx.userId ?? '',
    ...(ctx.variables || {})
  };

  const resolvePath = (path: string, obj: any): any => {
    return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
  };

  const interpolateString = (str: string): string => {
    return str.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path) => {
      const val = resolvePath(path, variablesMap);
      if (val !== undefined) {
        return String(val);
      }
      return match; // Leave unresolved variables intact
    });
  };

  const traverseAndInterpolate = (component: ComponentNode) => {
    // Interpolate known text properties (e.g. Label text, Section title)
    if (component.props) {
      for (const [key, value] of Object.entries(component.props)) {
        if (typeof value === 'string') {
          (component.props as any)[key] = interpolateString(value);
        }
      }
    }

    if (component.children) {
      component.children.forEach(traverseAndInterpolate);
    }
  };

  resolvedSchema.pages.forEach((page) => {
    page.components.forEach(traverseAndInterpolate);
  });

  return resolvedSchema;
}
