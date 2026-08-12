import { ComponentRegistry } from '../registry/component-registry';
import { bodyDiagramDefinition } from '../components/medical/body-diagram';
import { burnAssessmentDefinition } from '../components/medical/burn-assessment';
import { FormSchema } from '../schema/form-schema.types';
import { validateAnswersAgainstSchema } from '../validation/validate-form-instance';

describe('Medical Components (Wave 4)', () => {
  let registry: ComponentRegistry;

  beforeEach(() => {
    registry = new ComponentRegistry();
    registry.register(bodyDiagramDefinition);
    registry.register(burnAssessmentDefinition);
  });

  it('can assemble and validate a Nursing Assessment template snippet', () => {
    const nursingAssessmentSchema: FormSchema = {
      schemaVersion: '1.0.0',
      formId: 'nursing_assessment_1',
      category: 'assessment',
      dataSources: [],
      pages: [
        {
          id: 'page1',
          size: 'A4',
          orientation: 'portrait',
          components: [
            {
              id: 'burn_chart',
              type: 'burn_assessment',
              fieldKey: 'burn_chart_1',
              validation: [],
              geometry: { x: 0, y: 0, w: 400, h: 500, z: 0, pageId: 'page1' },
              logic: {},
              permissions: { visibleTo: [], editableBy: [] },
              audit: { trackChanges: false },
              props: {
                label: 'Burn Assessment Chart',
                asset: null,
                regions: [
                  { id: 'head', label: 'Head (9%)', svgPath: '...' }
                ]
              }
            }
          ]
        }
      ]
    };

    // Construct an instance simulating user input
    const instanceData = {
      'burn_chart_1': {
        annotations: [
          { id: 'a1', type: 'region_selection', regionId: 'head' }
        ]
      }
    };

    const result = validateAnswersAgainstSchema(nursingAssessmentSchema, instanceData, registry.list());
    expect(result.valid).toBe(true);
  });
});

import { calculateRuleOfNines } from '../components/medical/burn-assessment';
it('calculates rule of nines', () => {
  expect(calculateRuleOfNines(['head', 'torsoFront'])).toBe(27);
});
