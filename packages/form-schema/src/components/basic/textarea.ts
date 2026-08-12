import type { ComponentDefinition } from '../../registry/component-definition';
import { runStandardValidations } from './validate-helpers';
import type { TextAreaProps } from './types';

export const textAreaDefinition: ComponentDefinition<TextAreaProps, string> = {
  id: 'textarea',
  displayName: 'Text Area',
  category: 'input',
  icon: 'notes',
  sdkVersion: '1.0.0',
  propertySchema: {
    sections: [
      {
        id: 'general',
        label: 'General',
        fields: [
          { key: 'label', label: 'Field Label', control: 'text' },
          { key: 'placeholder', label: 'Placeholder', control: 'text' },
          { key: 'defaultValue', label: 'Default Value', control: 'text' },
          { key: 'rows', label: 'Rows', control: 'number' },
        ],
      },
      {
        id: 'validation',
        label: 'Validation',
        fields: [
          { key: 'required', label: 'Required', control: 'toggle' },
          { key: 'maxLength', label: 'Max Length', control: 'number' },
        ],
      },
    ],
  },
  validate: (value, rules) =>
    runStandardValidations(value, rules, (v) => typeof v !== 'string' || v.trim().length === 0),
  serialize: (v) => v,
  deserialize: (json) => (typeof json === 'string' ? json : ''),
  defaultSchema: {
    type: 'textarea',
    fieldKey: 'textarea',
    props: { label: 'Text Area', placeholder: '', defaultValue: '', rows: 4, maxLength: 2000, required: false },
    validation: [],
    logic: {},
    permissions: { visibleTo: [], editableBy: [] },
    audit: { trackChanges: true },
  },
  supportedEvents: ['change', 'blur', 'focus'],
  supportedValidations: ['required', 'regex', 'range'],
  supportedBindings: ['Patient', 'Visit', 'Encounter'],
};
