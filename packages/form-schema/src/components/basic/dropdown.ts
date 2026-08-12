import type { ComponentDefinition } from '../../registry/component-definition';
import { runStandardValidations } from './validate-helpers';
import type { DropdownProps } from './types';

export const dropdownDefinition: ComponentDefinition<DropdownProps, string> = {
  id: 'dropdown',
  displayName: 'Dropdown',
  category: 'input',
  icon: 'arrow-drop-down-circle',
  sdkVersion: '1.0.0',
  propertySchema: {
    sections: [
      {
        id: 'general',
        label: 'General',
        fields: [
          { key: 'label', label: 'Label', control: 'text' },
          { key: 'placeholder', label: 'Placeholder', control: 'text' },
        ],
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
    type: 'dropdown',
    fieldKey: 'dropdown',
    props: {
      label: 'Dropdown',
      options: [
        { label: 'Option 1', value: 'option_1' },
        { label: 'Option 2', value: 'option_2' },
      ],
      placeholder: 'Select…',
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
