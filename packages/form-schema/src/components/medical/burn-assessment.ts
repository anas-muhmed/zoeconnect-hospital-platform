import { ComponentDefinition } from '../../registry/component-definition';
import { MedicalComponentProps, MedicalComponentValue } from './types';

export const burnAssessmentDefinition: ComponentDefinition<MedicalComponentProps, MedicalComponentValue> = {
  id: 'burn_assessment',
  displayName: 'Burn Assessment (Rule of Nines)',
  category: 'medical',
  icon: 'FireIcon', 
  sdkVersion: '1.0.0',
  propertySchema: {
    sections: [
      {
        id: 'general',
        label: 'General',
        fields: [
          { key: 'label', label: 'Label', control: 'text' },
          { key: 'id', label: 'ID', control: 'text' }
        ]
      }
    ]
  },
  validate: () => ({ valid: true, errors: [] }),
  serialize: (v) => v,
  deserialize: (v) => v as MedicalComponentValue || { annotations: [] },
  defaultSchema: {
    type: 'burn_assessment',
    props: {
      asset: null, // Hardcoded or default rule of 9s SVG
      regions: []
    }
  },
  supportedEvents: ['onChange'],
  supportedValidations: ['required'],
  supportedBindings: 'none'
};

export function calculateRuleOfNines(selectedRegionIds: string[]): number {
  const regionValues: Record<string, number> = { head: 9, armLeft: 9, armRight: 9, torsoFront: 18, torsoBack: 18, legLeft: 18, legRight: 18, groin: 1 };
  return selectedRegionIds.reduce((sum, id) => sum + (regionValues[id] || 0), 0);
}
