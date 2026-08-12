import type { ComponentDefinition } from '../../registry/component-definition';
import type { RepeatSectionProps } from './types';

export const repeatSectionDefinition: ComponentDefinition<RepeatSectionProps, string> = {
  id: 'repeat-section',
  displayName: 'Repeat Section',
  category: 'complex',
  icon: 'layers',
  sdkVersion: '1.0.0',
  propertySchema: {
    sections: [
      {
        id: 'general',
        label: 'General',
        fields: [
          { key: 'minCount', label: 'Minimum Instances', control: 'number' },
          { key: 'maxCount', label: 'Maximum Instances', control: 'number' },
        ],
      },
    ],
  },
  validate: () => ({ valid: true, errors: [] }),
  serialize: (v) => v,
  deserialize: (json) => (typeof json === 'string' ? json : ''),
  canHaveChildren: true,
  defaultSchema: {
    type: 'repeat-section',
    props: { minCount: 1, maxCount: 10 },
    layout: { flexDirection: 'column', gap: 16, padding: 16 },
    validation: [],
    logic: {},
    permissions: { visibleTo: [], editableBy: [] },
    audit: { trackChanges: false },
    children: [], 
  },
  supportedEvents: [],
  supportedValidations: [],
  supportedBindings: 'none',
};
