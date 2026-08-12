import type { ComponentDefinition } from '../../registry/component-definition';
import type { VariablesProps } from './types';

export const variablesDefinition: ComponentDefinition<VariablesProps, string> = {
  id: 'variables',
  displayName: 'Variables Def',
  category: 'complex',
  icon: 'data_object',
  sdkVersion: '1.0.0',
  propertySchema: {
    sections: [
      {
        id: 'general',
        label: 'Variables',
        fields: [
          { key: 'variables', label: 'Variables (JSON)', control: 'text' },
        ],
      },
    ],
  },
  validate: () => ({ valid: true, errors: [] }),
  serialize: (v) => v,
  deserialize: (json) => (typeof json === 'string' ? json : ''),
  defaultSchema: {
    type: 'variables',
    props: { variables: {} },
    validation: [],
    logic: {},
    permissions: { visibleTo: [], editableBy: [] },
    audit: { trackChanges: false },
    children: [], // non-visual
  },
  supportedEvents: [],
  supportedValidations: [],
  supportedBindings: 'none',
};
