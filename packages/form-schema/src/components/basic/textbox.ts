import type { ComponentDefinition } from '../../registry/component-definition';
import { runStandardValidations } from './validate-helpers';
import type { TextboxProps } from './types';

export const textboxDefinition: ComponentDefinition<TextboxProps, string> = {
  id: 'textbox',
  displayName: 'Textbox',
  category: 'input',
  icon: 'input',
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
    type: 'textbox',
    fieldKey: 'textbox',
    props: { label: 'Text Field', placeholder: '', defaultValue: '', maxLength: 255, required: false },
    validation: [],
    logic: {},
    permissions: { visibleTo: [], editableBy: [] },
    audit: { trackChanges: true },
  },
  supportedEvents: ['change', 'blur', 'focus'],
  supportedValidations: ['required', 'regex', 'range'],
  supportedBindings: ['Patient', 'Visit', 'Encounter'],
};
