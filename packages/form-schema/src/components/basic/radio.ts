import type { ComponentDefinition } from '../../registry/component-definition';
import { runStandardValidations } from './validate-helpers';
import type { RadioProps } from './types';

export const radioDefinition: ComponentDefinition<RadioProps, string> = {
  id: 'radio',
  displayName: 'Radio Group',
  category: 'input',
  icon: 'radio-button-checked',
  sdkVersion: '1.0.0',
  propertySchema: {
    sections: [
      {
        id: 'general',
        label: 'General',
        fields: [{ key: 'label', label: 'Label', control: 'text' }],
      },
      {
        id: 'validation',
        label: 'Validation',
        fields: [{ key: 'required', label: 'Required', control: 'toggle' }],
      },
    ],
  },
  validate: (value, rules) => runStandardValidations(value, rules, (v) => typeof v !== 'string' || v.length === 0),
  serialize: (v) => v,
  deserialize: (json) => (typeof json === 'string' ? json : ''),
  defaultSchema: {
    type: 'radio',
    fieldKey: 'radio',
    props: {
      label: 'Radio Group',
      options: [
        { label: 'Option 1', value: 'option_1' },
        { label: 'Option 2', value: 'option_2' },
      ],
      defaultValue: '',
      required: false,
    },
    validation: [],
    logic: {},
    permissions: { visibleTo: [], editableBy: [] },
    audit: { trackChanges: true },
  },
  supportedEvents: ['change'],
  supportedValidations: ['required'],
  supportedBindings: 'none',
};
