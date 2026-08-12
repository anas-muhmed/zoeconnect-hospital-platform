import { validateAnswersAgainstSchema } from '../validation/validate-form-instance';
import { BASIC_COMPONENT_DEFINITIONS } from '../components/basic';
import { CURRENT_SCHEMA_VERSION, type FormSchema } from '../schema/form-schema.types';

function makeSchema(): FormSchema {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    formId: 'f1',
    category: 'custom',
    dataSources: [],
    pages: [
      {
        id: 'p1',
        size: 'A4',
        orientation: 'portrait',
        components: [
          {
            id: 'n1', type: 'textbox', fieldKey: 'full_name',
            geometry: { x: 0, y: 0, w: 100, h: 30, z: 0, pageId: 'p1' },
            props: {}, validation: [{ kind: 'required' }], logic: {},
            permissions: { visibleTo: [], editableBy: [] }, audit: { trackChanges: true },
          },
          {
            id: 'n2', type: 'checkbox', fieldKey: 'consent',
            geometry: { x: 0, y: 40, w: 100, h: 30, z: 1, pageId: 'p1' },
            props: {}, validation: [{ kind: 'required' }], logic: {},
            permissions: { visibleTo: [], editableBy: [] }, audit: { trackChanges: true },
          },
        ],
      },
    ],
  };
}

describe('validateAnswersAgainstSchema (Milestone 4, ADR-012)', () => {
  it('reports errors for missing required fields', () => {
    const result = validateAnswersAgainstSchema(makeSchema(), {}, BASIC_COMPONENT_DEFINITIONS);
    expect(result.valid).toBe(false);
    expect(result.errors.full_name).toBeDefined();
    expect(result.errors.consent).toBeDefined();
  });

  it('passes when all required fields are answered', () => {
    const result = validateAnswersAgainstSchema(
      makeSchema(),
      { full_name: 'Jane Doe', consent: true },
      BASIC_COMPONENT_DEFINITIONS,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('skips components whose type is not in the provided definitions (unregistered/unknown types)', () => {
    const schema = makeSchema();
    schema.pages[0].components.push({
      id: 'n3', type: 'some-future-medical-component', fieldKey: 'x',
      geometry: { x: 0, y: 80, w: 10, h: 10, z: 2, pageId: 'p1' },
      props: {}, validation: [{ kind: 'required' }], logic: {},
      permissions: { visibleTo: [], editableBy: [] }, audit: { trackChanges: false },
    });
    const result = validateAnswersAgainstSchema(
      schema,
      { full_name: 'Jane Doe', consent: true },
      BASIC_COMPONENT_DEFINITIONS,
    );
    expect(result.valid).toBe(true);
  });
});
