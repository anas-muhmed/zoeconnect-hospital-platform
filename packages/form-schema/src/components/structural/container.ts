import type { ComponentDefinition } from '../../registry/component-definition';
import type { ContainerProps } from './types';

/**
 * Container (Wave 2)
 */
export const containerDefinition: ComponentDefinition<ContainerProps, string> = {
  id: 'container',
  displayName: 'Container',
  category: 'structural',
  icon: 'crop_square',
  sdkVersion: '1.0.0',
  propertySchema: {
    sections: [
      {
        id: 'general',
        label: 'General',
        fields: [{ key: 'label', label: 'Label', control: 'text' }],
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
          {
            key: 'layout.gap',
            label: 'Gap (px)',
            control: 'number',
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
    type: 'container',
    props: { label: 'Container' },
    layout: { flexDirection: 'column', gap: 8, padding: 8 },
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
