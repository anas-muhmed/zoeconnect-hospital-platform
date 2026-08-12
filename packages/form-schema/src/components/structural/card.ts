import type { ComponentDefinition } from '../../registry/component-definition';
import type { CardProps } from './types';

export const cardDefinition: ComponentDefinition<CardProps, string> = {
  id: 'card',
  displayName: 'Card',
  category: 'structural',
  icon: 'crop_portrait',
  sdkVersion: '1.0.0',
  propertySchema: {
    sections: [
      {
        id: 'general',
        label: 'General',
        fields: [
          { key: 'title', label: 'Title', control: 'text' },
          { key: 'elevation', label: 'Elevation', control: 'number' },
        ],
      },
      {
        id: 'layout',
        label: 'Layout',
        fields: [
          {
            key: 'layout.flexDirection',
            label: 'Direction',
            control: 'select',
            options: [
              { label: 'Row', value: 'row' },
              { label: 'Column', value: 'column' },
            ],
          },
        ],
      },
    ],
  },
  validate: () => ({ valid: true, errors: [] }),
  serialize: (v) => v,
  deserialize: (json) => (typeof json === 'string' ? json : ''),
  canHaveChildren: true,
  defaultSchema: {
    type: 'card',
    props: { title: '', elevation: 1 },
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
