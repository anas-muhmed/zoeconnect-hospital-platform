import type { ComponentDefinition } from '../../registry/component-definition';
import { runStandardValidations } from './validate-helpers';
import type { CheckboxProps } from './types';

export const checkboxDefinition: ComponentDefinition<CheckboxProps, boolean> = {
  id: 'checkbox',
  displayName: 'Checkbox',
  category: 'input',
  icon: 'check-box',
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
        fields: [{ key: 'required', label: 'Required (must be checked)', control: 'toggle' }],
      },
    ],
  },
  validate: (value, rules) => runStandardValidations(value, rules, (v) => v !== true),
  serialize: (v) => v,
  deserialize: (json) => json === true,
  defaultSchema: {
    type: 'checkbox',
    fieldKey: 'checkbox',
    props: { label: 'Checkbox', defaultChecked: false, required: false },
    validation: [],
    logic: {},
    permissions: { visibleTo: [], editableBy: [] },
    audit: { trackChanges: true },
  },
  supportedEvents: ['change'],
  supportedValidations: ['required'],
  supportedBindings: 'none',
};
