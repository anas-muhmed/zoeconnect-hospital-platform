import { isFormSchema, CURRENT_SCHEMA_VERSION, type FormSchema } from '../schema/form-schema.types';

describe('FormSchema shape guard (ADR-001 — Milestone 1: types only, no serializer yet)', () => {
  it('accepts a minimal, structurally valid schema', () => {
    const schema: FormSchema = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      formId: 'test-form',
      category: 'custom',
      pages: [],
      dataSources: [],
    };
    expect(isFormSchema(schema)).toBe(true);
  });

  it('rejects a value missing required top-level fields', () => {
    expect(isFormSchema({ formId: 'x' })).toBe(false);
    expect(isFormSchema(null)).toBe(false);
    expect(isFormSchema('not an object')).toBe(false);
  });
});
