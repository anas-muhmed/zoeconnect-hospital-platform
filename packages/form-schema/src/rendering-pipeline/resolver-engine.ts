import type { FormSchema } from '../schema/form-schema.types';
import * as jsonpatch from 'fast-json-patch';

/**
 * Resolver Engine (Phase 5B, ADR-011)
 * Takes a base FormSchema and applies an array of RFC 6902 JSON Patches to it.
 * This is used to merge departmental or branch-level overrides dynamically.
 */
export function applySchemaOverrides(schema: FormSchema, patches: jsonpatch.Operation[]): FormSchema {
  if (!patches || patches.length === 0) {
    return schema;
  }

  // fast-json-patch's applyPatch mutates the document if mutateDocument is true.
  // We use deep clone to ensure pure function semantics in the pipeline.
  const clonedSchema = JSON.parse(JSON.stringify(schema));
  
  try {
    const result = jsonpatch.applyPatch(clonedSchema, patches, false, false);
    return result.newDocument as FormSchema;
  } catch (err) {
    console.error('Resolver Engine: Failed to apply JSON patches', err);
    // If patching fails (e.g. invalid path), return base schema to ensure availability,
    // though in a stricter system we might throw or return a validation error.
    return schema;
  }
}
