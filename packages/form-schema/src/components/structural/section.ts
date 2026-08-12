import type { ComponentDefinition } from '../../registry/component-definition';
import type { SectionProps } from './types';

export const sectionDefinition: ComponentDefinition<SectionProps, string> = {
  id: 'section',
  displayName: 'Section',
  category: 'structural',
  icon: 'view_agenda',
  sdkVersion: '1.0.0',
  propertySchema: {
    sections: [
      {
        id: 'general',
        label: 'General',
        fields: [
          { key: 'title', label: 'Title', control: 'text' },
          { key: 'collapsible', label: 'Collapsible', control: 'toggle' },
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
    type: 'section',
    props: { title: 'New Section', collapsible: false },
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
