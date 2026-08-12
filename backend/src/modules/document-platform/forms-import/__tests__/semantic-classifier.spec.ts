import { RuleBasedClassifierProvider } from '../classifier/rule-based-classifier.provider';
import { LayoutElement } from '../entities/import-job.entity';

function makeEl(overrides: Partial<LayoutElement>): LayoutElement {
  return {
    id: 'le-1',
    kind: 'label',
    text: '',
    boundingBox: { x: 40, y: 60, width: 200, height: 20 },
    pageIndex: 0,
    ...overrides,
  };
}

describe('RuleBasedClassifierProvider', () => {
  let provider: RuleBasedClassifierProvider;

  beforeEach(() => {
    provider = new RuleBasedClassifierProvider();
  });

  const cases: Array<[string, Partial<LayoutElement>, string]> = [
    ['Patient Name:', {}, 'textbox'],
    ['Date of Birth:', {}, 'textbox'],
    ['Gender:', {}, 'radio'],
    ['M / F', {}, 'radio'],
    ['Department:', {}, 'dropdown'],
    ['Diagnosis:', {}, 'textarea'],
    ['Signature:', { kind: 'signature_area' }, 'signature'],
    ['Blood Group:', {}, 'dropdown'],
    ['Age:', {}, 'textbox'],
    ['Weight (kg):', {}, 'textbox'],
    ['BP (mmHg):', {}, 'textbox'],
    ['Complaints:', {}, 'textarea'],
    ['Body Diagram', {}, 'body_diagram'],
    ['Dental Chart', {}, 'dental_chart'],
    ['Burn Assessment / TBSA', {}, 'burn_assessment'],
  ];

  test.each(cases)('"%s" → %s', (text, extra, expectedType) => {
    const el = makeEl({ text, ...extra });
    const result = provider.classifyElement(el);
    expect(result.componentType).toBe(expectedType);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.fieldKey).toBeTruthy();
    expect(typeof result.needsReview).toBe('boolean');
  });

  it('assigns classifierSource = "rule"', () => {
    const el = makeEl({ text: 'Patient Name:' });
    const result = provider.classifyElement(el);
    expect(result.classifierSource).toBe('rule');
  });

  it('low-confidence fields have needsReview = true', () => {
    // Generic field_box with no matching keyword
    const el = makeEl({ kind: 'field_box', text: '', boundingBox: { x: 40, y: 60, width: 100, height: 24 } });
    const result = provider.classifyElement(el);
    expect(result.needsReview).toBe(result.confidence < 0.7);
  });

  it('classifies label elements with the same text consistently', () => {
    const els = [
      makeEl({ id: 'le-1', text: 'Department:' }),
      makeEl({ id: 'le-2', text: 'Department:' }),
    ];
    // Both produce the same base key — deduplication is the SemanticClassifier's responsibility
    const results = els.map((e) => provider.classifyElement(e));
    expect(results[0].fieldKey).toBe(results[1].fieldKey);
    expect(results[0].componentType).toBe(results[1].componentType);
  });

  it('nursing assessment fields regression test', async () => {
    const nursingFields = [
      'Patient Name:', 'Date of Birth:', 'Age:', 'Gender:', 'Ward:', 'Bed No.:',
      'Admission Date:', 'Doctor Name:', 'Chief Complaints:', 'Diagnosis:',
      'Blood Group:', 'Weight (kg):', 'BP (mmHg):', 'Pulse (bpm):', 'Temperature (°F):',
      'Pain Level:', 'Signature:', 'Nurse Name:',
    ];
    const elements = nursingFields.map((text, i) => makeEl({ id: `le-${i}`, text }));
    const results = await provider.classify(elements);
    expect(results.length).toBeGreaterThan(0);
    const types = results.map((r) => r.componentType);
    expect(types).toContain('textbox');
    expect(types).toContain('radio');
    expect(types).toContain('textarea');
    expect(types).toContain('dropdown');
  });
});
