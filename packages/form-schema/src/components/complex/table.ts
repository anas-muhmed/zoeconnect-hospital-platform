import type { ComponentDefinition } from '../../registry/component-definition';
import type { TableProps } from './types';

export const tableDefinition: ComponentDefinition<TableProps, string> = {
  id: 'table',
  displayName: 'Table',
  category: 'complex',
  icon: 'table_chart',
  sdkVersion: '1.0.0',
  propertySchema: {
    sections: [
      {
        id: 'general',
        label: 'General',
        fields: [
          { key: 'columns', label: 'Columns', control: 'text' },
          { key: 'minRows', label: 'Minimum Rows', control: 'number' },
          { key: 'maxRows', label: 'Maximum Rows', control: 'number' },
        ],
      },
    ],
  },
  validate: () => ({ valid: true, errors: [] }),
  serialize: (v) => v,
  deserialize: (json) => (typeof json === 'string' ? json : ''),
  defaultSchema: {
    type: 'table',
    props: { columns: ['Column 1', 'Column 2'], minRows: 1 },
    validation: [],
    logic: {},
    permissions: { visibleTo: [], editableBy: [] },
    audit: { trackChanges: false },
    children: [], // children nodes represent cell templates, mapping to columns
  },
  supportedEvents: [],
  supportedValidations: [],
  supportedBindings: 'none',
};
