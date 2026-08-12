import { SchemaGenerator } from '../schema-gen/schema-generator';
import { ClassifiedField } from '../entities/import-job.entity';
import { CURRENT_SCHEMA_VERSION } from '@hdsp/form-schema';

const makeField = (overrides: Partial<ClassifiedField>): ClassifiedField => ({
  id: 'cf-1',
  layoutElementId: 'le-1',
  pageIndex: 0,
  label: 'Test Field',
  fieldKey: 'test_field',
  componentType: 'textbox',
  confidence: 0.9,
  needsReview: false,
  classifierSource: 'ai',
  boundingBox: { x: 40, y: 60, width: 200, height: 24 },
  suggestedProps: {},
  ...overrides,
});

describe('SchemaGenerator', () => {
  let generator: SchemaGenerator;

  beforeEach(() => {
    generator = new SchemaGenerator();
  });

  it('produces a FormSchema with the correct structure', () => {
    const fields = [makeField({})];
    const schema = generator.generate(fields, 'Test Form', 1);

    expect(schema).toHaveProperty('formId');
    expect(schema).toHaveProperty('schemaVersion', CURRENT_SCHEMA_VERSION);
    expect(schema).toHaveProperty('pages');
    expect(Array.isArray(schema.pages)).toBe(true);
    expect(schema.pages[0]).toHaveProperty('components');
    expect(Array.isArray(schema.pages[0].components)).toBe(true);
  });

  it('generates one page per PDF page', () => {
    const fields = [makeField({ pageIndex: 0 }), makeField({ id: 'cf-2', pageIndex: 1, fieldKey: 'field_2' })];
    const schema = generator.generate(fields, 'Multi-Page', 2);
    expect(schema.pages).toHaveLength(2);
    expect(schema.pages[0].id).toBe('page-1');
    expect(schema.pages[1].id).toBe('page-2');
  });

  it('offsets components on later pages vertically', () => {
    const fields = [
      makeField({ pageIndex: 0, fieldKey: 'f1', boundingBox: { x: 40, y: 60, width: 200, height: 24 } }),
      makeField({ id: 'cf-2', pageIndex: 1, fieldKey: 'f2', boundingBox: { x: 40, y: 60, width: 200, height: 24 } }),
    ];
    const schema = generator.generate(fields, 'Multi', 2);
    const c1 = schema.pages[0].components[0];
    const c2 = schema.pages[1].components[0];
    expect(c2.geometry.y).toBeGreaterThan(c1.geometry.y);
  });

  it('embeds _importMeta with confidence on each component', () => {
    const field = makeField({ confidence: 0.82, needsReview: false, classifierSource: 'ai' });
    const schema = generator.generate([field], 'Test', 1);
    const comp = schema.pages[0].components[0];
    expect((comp.props as any)._importMeta).toBeDefined();
    expect((comp.props as any)._importMeta.confidence).toBe(0.82);
    expect((comp.props as any)._importMeta.needsReview).toBe(false);
  });

  it('enforces minimum component dimensions', () => {
    const field = makeField({ componentType: 'signature', boundingBox: { x: 10, y: 10, width: 5, height: 5 } });
    const schema = generator.generate([field], 'Test', 1);
    const comp = schema.pages[0].components[0];
    expect(comp.geometry.w).toBeGreaterThanOrEqual(260);
    expect(comp.geometry.h).toBeGreaterThanOrEqual(100);
  });

  it('sets fieldKey on each component', () => {
    const fields = [
      makeField({ fieldKey: 'patient_name' }),
      makeField({ id: 'cf-2', fieldKey: 'diagnosis' }),
    ];
    const schema = generator.generate(fields, 'Test', 1);
    const keys = schema.pages[0].components.map((c) => c.fieldKey);
    expect(keys).toContain('patient_name');
    expect(keys).toContain('diagnosis');
  });

  it('handles empty field list gracefully', () => {
    const schema = generator.generate([], 'Empty', 1);
    expect(schema.pages[0].components).toHaveLength(0);
    expect(schema.pages).toHaveLength(1);
  });

  it('places geometry fields correctly (x, y, w, h, z, pageId)', () => {
    const field = makeField({ boundingBox: { x: 100, y: 200, width: 300, height: 50 } });
    const schema = generator.generate([field], 'Test', 1);
    const g = schema.pages[0].components[0].geometry;
    expect(g.x).toBe(100);
    expect(g.y).toBe(200);
    expect(g.w).toBeGreaterThanOrEqual(200);
    expect(g.h).toBeGreaterThanOrEqual(44);
    expect(g.pageId).toBe('page-1');
  });
});
