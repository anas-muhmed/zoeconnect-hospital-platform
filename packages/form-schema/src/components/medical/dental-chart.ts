import { ComponentDefinition } from '../../registry/component-definition';
import { MedicalComponentProps, MedicalComponentValue } from './types';

export const dentalChartDefinition: ComponentDefinition<MedicalComponentProps, MedicalComponentValue> = {
  id: 'dental_chart',
  displayName: 'Dental Chart',
  category: 'medical',
  icon: 'ToothIcon', 
  sdkVersion: '1.0.0',
  propertySchema: {
    sections: [
      {
        id: 'general',
        label: 'General',
        fields: [
          { key: 'label', label: 'Label', control: 'text' },
          { key: 'id', label: 'ID', control: 'text' },
          { key: 'chartType', label: 'Chart Type (Adult/Child)', control: 'select', options: [{label: 'Adult', value: 'adult'}, {label: 'Child', value: 'child'}] }
        ]
      }
    ]
  },
  validate: () => ({ valid: true, errors: [] }),
  serialize: (v) => v,
  deserialize: (v) => v as MedicalComponentValue || { annotations: [] },
  defaultSchema: {
    type: 'dental_chart',
    props: {
      asset: null,
      regions: []
    }
  },
  supportedEvents: ['onChange'],
  supportedValidations: ['required'],
  supportedBindings: 'none'
};
