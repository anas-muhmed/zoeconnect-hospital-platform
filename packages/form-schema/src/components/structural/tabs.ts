import type { ComponentDefinition } from '../../registry/component-definition';
import type { TabsProps } from './types';

export const tabsDefinition: ComponentDefinition<TabsProps, string> = {
  id: 'tabs',
  displayName: 'Tabs',
  category: 'structural',
  icon: 'tab',
  sdkVersion: '1.0.0',
  propertySchema: {
    sections: [
      {
        id: 'general',
        label: 'General',
        fields: [
          // Array editing usually requires a special array control, we'll map to text for now
          { key: 'tabs', label: 'Tab Names', control: 'text' }, 
        ],
      },
    ],
  },
  validate: () => ({ valid: true, errors: [] }),
  serialize: (v) => v,
  deserialize: (json) => (typeof json === 'string' ? json : ''),
  canHaveChildren: true,
  defaultSchema: {
    type: 'tabs',
    props: { tabs: ['Tab 1', 'Tab 2'] },
    layout: { flexDirection: 'column', gap: 16, padding: 16 },
    validation: [],
    logic: {},
    permissions: { visibleTo: [], editableBy: [] },
    audit: { trackChanges: false },
    children: [], // children nodes should map to their respective tab index via a custom property or layout positioning
  },
  supportedEvents: [],
  supportedValidations: [],
  supportedBindings: 'none',
};
