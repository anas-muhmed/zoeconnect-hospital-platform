import type { ComponentDefinition } from '../../registry/component-definition';
import type { AccordionProps } from './types';

export const accordionDefinition: ComponentDefinition<AccordionProps, string> = {
  id: 'accordion',
  displayName: 'Accordion',
  category: 'structural',
  icon: 'view_day',
  sdkVersion: '1.0.0',
  propertySchema: {
    sections: [
      {
        id: 'general',
        label: 'General',
        fields: [
          { key: 'panels', label: 'Panels', control: 'text' },
          { key: 'multiple', label: 'Allow Multiple Open', control: 'toggle' },
        ],
      },
    ],
  },
  validate: () => ({ valid: true, errors: [] }),
  serialize: (v) => v,
  deserialize: (json) => (typeof json === 'string' ? json : ''),
  canHaveChildren: true,
  defaultSchema: {
    type: 'accordion',
    props: { panels: ['Panel 1', 'Panel 2'], multiple: false },
    layout: { flexDirection: 'column', gap: 0, padding: 0 },
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
