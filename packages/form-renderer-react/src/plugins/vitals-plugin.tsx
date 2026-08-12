import React, { useState } from 'react';
import type { FormBuilderPlugin, ComponentDefinition } from '@hdsp/form-schema';

export const vitalsDefinition: ComponentDefinition<any, Record<string, string>> = {
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
  deserialize: (v) => (v as Record<string, string>) || {},
  RendererComponent: ({ props, value, onChange }: any) => {
    const v = (value as Record<string, string>) || {};
    
    const handleChange = (key: string, val: string) => {
      onChange({ ...v, [key]: val });
    };

    return (
      <div style={{ border: '1px solid #90caf9', borderRadius: 8, padding: 16, height: '100%', boxSizing: 'border-box', backgroundColor: '#fff' }}>
        <div style={{ fontWeight: 'bold', color: '#1976d2', marginBottom: 12 }}>{props.label}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: '#555' }}>
            HR (bpm)
            <input 
              type="number" 
              value={v.hr || ''} 
              onChange={e => handleChange('hr', e.target.value)}
              style={{ marginTop: 4, padding: 6, border: '1px solid #ccc', borderRadius: 4 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: '#555' }}>
            BP (mmHg)
            <input 
              type="text" 
              placeholder="120/80"
              value={v.bp || ''} 
              onChange={e => handleChange('bp', e.target.value)}
              style={{ marginTop: 4, padding: 6, border: '1px solid #ccc', borderRadius: 4 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: '#555' }}>
            Temp (°C)
            <input 
              type="number" 
              step="0.1"
              value={v.temp || ''} 
              onChange={e => handleChange('temp', e.target.value)}
              style={{ marginTop: 4, padding: 6, border: '1px solid #ccc', borderRadius: 4 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: '#555' }}>
            SpO2 (%)
            <input 
              type="number" 
              value={v.spo2 || ''} 
              onChange={e => handleChange('spo2', e.target.value)}
              style={{ marginTop: 4, padding: 6, border: '1px solid #ccc', borderRadius: 4 }}
            />
          </label>
        </div>
      </div>
    );
  }
};

export const VitalsPlugin: FormBuilderPlugin = {
  id: 'com.hdsp.plugins.vitals',
  displayName: 'HDSP Vitals Plugin',
  version: '1.0.0',
  sdkVersion: '^1.0.0',
  components: [vitalsDefinition],
  onActivate: () => {
    console.log('[VitalsPlugin Runtime] Activated successfully.');
  }
};
