import type { ComponentDefinition } from '../../registry/component-definition';
import type { ColumnsProps } from './types';

export const columnsDefinition: ComponentDefinition<ColumnsProps, string> = {
  id: 'columns',
  displayName: 'Columns',
  category: 'structural',
  icon: 'view_column',
  sdkVersion: '1.0.0',
  propertySchema: {
    sections: [
      {
        id: 'general',
        label: 'General',
        fields: [
          { key: 'count', label: 'Column Count', control: 'number' },
        ],
      },
      {
        id: 'layout',
        label: 'Layout',
        fields: [
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
    type: 'columns',
    props: { count: 2 },
    layout: { flexDirection: 'row', gap: 16, padding: 0 },
    validation: [],
    logic: {},
    permissions: { visibleTo: [], editableBy: [] },
    audit: { trackChanges: false },
    children: [], // expects children to be `column` components, but we can treat columns as flex-row container
  },
  supportedEvents: [],
  supportedValidations: [],
  supportedBindings: 'none',
};
