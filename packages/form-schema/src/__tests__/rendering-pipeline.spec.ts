import { resolveRenderTree, getPage } from '../rendering-pipeline/pipeline';
import { CURRENT_SCHEMA_VERSION, type FormSchema } from '../schema/form-schema.types';

function makeSchema(): FormSchema {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    formId: 'f1',
    category: 'custom',
    dataSources: [],
    pages: [{ id: 'p1', size: 'A4', orientation: 'portrait', components: [] }],
  };
}

describe('six-stage rendering pipeline (Milestone 4, ADR-007)', () => {
  it('resolveRenderTree is a no-op pass-through in Milestone 4 (no Resolver/Rule/Permission/Theme content yet)', () => {
    const schema = makeSchema();
    expect(resolveRenderTree(schema)).toEqual(schema);
  });

  it('getPage finds a page by id', () => {
    const schema = makeSchema();
    expect(getPage(schema, 'p1')?.id).toBe('p1');
    expect(getPage(schema, 'missing')).toBeUndefined();
  });
});
