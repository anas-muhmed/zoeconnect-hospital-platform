import type { ComponentDefinition } from '../../registry/component-definition';
import type { LabelProps } from './types';

/**
 * Label (Wave 1 — Phase 5B §4). Display-only: no value, no validation, no
 * binding in Milestone 3 (variable interpolation is Milestone 5's Variables
 * Engine). DesignerComponent/RendererComponent are filled in by
 * canvas-engine-react at registration (this package stays React-free).
 */
export const labelDefinition: ComponentDefinition<LabelProps, string> = {
  id: 'label',
  displayName: 'Label',
  category: 'basic',
  icon: 'text-fields',
  sdkVersion: '1.0.0',
  propertySchema: {
    sections: [
      {
        id: 'general',
        label: 'General',
        fields: [{ key: 'text', label: 'Text', control: 'text' }],
      },
      {
        id: 'appearance',
        label: 'Appearance',
        fields: [
          {
            key: 'variant',
            label: 'Style',
            control: 'select',
            options: [
              { label: 'Body', value: 'body' },
              { label: 'Heading', value: 'heading' },
              { label: 'Subheading', value: 'subheading' },
            ],
          },
          {
            key: 'align',
            label: 'Alignment',
            control: 'select',
            options: [
              { label: 'Left', value: 'left' },
              { label: 'Center', value: 'center' },
              { label: 'Right', value: 'right' },
            ],
          },
        ],
      },
    ],
  },
  validate: () => ({ valid: true, errors: [] }),
  serialize: (v) => v,
  deserialize: (json) => (typeof json === 'string' ? json : ''),
  defaultSchema: {
    type: 'label',
    props: { text: 'Label', variant: 'body', align: 'left' },
    validation: [],
    logic: {},
    permissions: { visibleTo: [], editableBy: [] },
    audit: { trackChanges: false },
  },
  supportedEvents: [],
  supportedValidations: [],
  supportedBindings: 'none',
};
