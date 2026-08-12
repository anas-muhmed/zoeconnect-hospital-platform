import { ComponentDefinition } from '../../registry/component-definition';
import { MedicalComponentProps, MedicalComponentValue } from './types';

export const bodyDiagramDefinition: ComponentDefinition<MedicalComponentProps, MedicalComponentValue> = {
  id: 'body_diagram',
  displayName: 'Body Diagram',
  category: 'medical',
  icon: 'BodyIcon', // Placeholder
  sdkVersion: '1.0.0',
  propertySchema: {
    sections: [
      {
        id: 'general',
        label: 'General',
        fields: [
          { key: 'label', label: 'Label', control: 'text' },
          { key: 'id', label: 'ID', control: 'text' },
          { key: 'assetId', label: 'Background Asset ID', control: 'text' }
        ]
      }
    ]
  },
  validate: () => ({ valid: true, errors: [] }),
  serialize: (v) => v,
  deserialize: (v) => v as MedicalComponentValue || { annotations: [] },
  defaultSchema: {
    type: 'body_diagram',
    props: {
      asset: null,
      regions: []
    }
  },
  supportedEvents: ['onChange'],
  supportedValidations: ['required'],
  supportedBindings: 'none'
};
