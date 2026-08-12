import React from 'react';
import type { FormBuilderPlugin, ComponentDefinition } from '@hdsp/form-schema';

export const vitalsDefinition: ComponentDefinition<any, string> = {
  id: 'vitals',
  displayName: 'Vitals Entry',
  category: 'medical',
  icon: 'monitor_heart',
  sdkVersion: '1.0.0',
  propertySchema: {
    sections: [
      {
        id: 'general',
        label: 'General',
        fields: [{ key: 'label', label: 'Label', control: 'text' }]
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
  supportedEvents: [],
  supportedValidations: [],
  supportedBindings: [],
  serialize: (v) => v,
  deserialize: (v) => typeof v === 'string' ? v : '',
  DesignerComponent: ({ node }: any) => (
    <div style={{ border: '2px solid #2196f3', borderRadius: 8, padding: 16, height: '100%', boxSizing: 'border-box', backgroundColor: '#e3f2fd' }}>
      <div style={{ fontWeight: 'bold', color: '#1976d2', marginBottom: 12 }}>{node.props.label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ padding: 8, backgroundColor: '#fff', border: '1px solid #bbdefb', borderRadius: 4 }}>HR: [__] bpm</div>
        <div style={{ padding: 8, backgroundColor: '#fff', border: '1px solid #bbdefb', borderRadius: 4 }}>BP: [__]/[__]</div>
        <div style={{ padding: 8, backgroundColor: '#fff', border: '1px solid #bbdefb', borderRadius: 4 }}>Temp: [__] °C</div>
        <div style={{ padding: 8, backgroundColor: '#fff', border: '1px solid #bbdefb', borderRadius: 4 }}>SpO2: [__] %</div>
      </div>
    </div>
  )
};

export const VitalsPlugin: FormBuilderPlugin = {
  id: 'com.hdsp.plugins.vitals',
  displayName: 'HDSP Vitals Plugin',
  version: '1.0.0',
  sdkVersion: '^1.0.0',
  components: [vitalsDefinition],
  onActivate: () => {
    console.log('[VitalsPlugin] Activated successfully.');
  }
};
