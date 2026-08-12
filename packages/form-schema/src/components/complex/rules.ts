import type { ComponentDefinition } from '../../registry/component-definition';
import type { RulesProps } from './types';

export const rulesDefinition: ComponentDefinition<RulesProps, string> = {
  id: 'rules',
  displayName: 'Rules Def',
  category: 'complex',
  icon: 'rule',
  sdkVersion: '1.0.0',
  propertySchema: {
    sections: [
      {
        id: 'general',
        label: 'Rules',
        fields: [
          { key: 'rules', label: 'Rules (JSON)', control: 'text' },
        ],
      },
    ],
  },
  validate: () => ({ valid: true, errors: [] }),
  serialize: (v) => v,
  deserialize: (json) => (typeof json === 'string' ? json : ''),
  defaultSchema: {
    type: 'rules',
    props: { rules: {} },
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
