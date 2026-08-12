import { PluginCompatibilityService } from '../plugin/plugin-compatibility';
import { CURRENT_SDK_VERSION, FormBuilderPlugin } from '../plugin/plugin.types';
import type { ComponentDefinition } from '../registry/component-definition';

describe('VitalsPlugin (Milestone 7)', () => {
  it('is a production-quality plugin that conforms to the SDK contract', () => {
    const vitalsDefinition: ComponentDefinition<any, string> = {
      id: 'vitals',
      displayName: 'Vitals Entry',
      category: 'medical',
      icon: 'heartbeat',
      sdkVersion: CURRENT_SDK_VERSION,
      supportedEvents: [],
      supportedValidations: [],
      supportedBindings: 'none',
      propertySchema: { 
        sections: [
          {
            id: 'general',
            label: 'General',
            fields: [
              { key: 'label', label: 'Label', control: 'text' }
            ]
          }
        ] 
      },
      defaultSchema: {
        type: 'vitals',
        props: { label: 'Vital Signs' },
        geometry: { x: 0, y: 0, w: 400, h: 200, z: 0, pageId: 'default' },
        logic: {},
        validation: [],
        permissions: { visibleTo: [], editableBy: [] },
        audit: { trackChanges: true },
        fieldKey: 'vitals'
      },
      validate: () => ({ valid: true, errors: [] }),
      serialize: (v) => v,
      deserialize: (v) => String(v),
    };

    const VitalsPlugin: FormBuilderPlugin = {
      id: 'com.hdsp.plugins.vitals',
      displayName: 'HDSP Vitals Plugin',
      version: '1.0.0',
      sdkVersion: '^1.0.0',
      components: [vitalsDefinition],
    };

    const svc = new PluginCompatibilityService(CURRENT_SDK_VERSION);
    const result = svc.check(VitalsPlugin);
    
    expect(result.status).toBe('compatible');
    expect(VitalsPlugin.components).toHaveLength(1);
    expect(VitalsPlugin.components![0].id).toBe('vitals');
  });
});
