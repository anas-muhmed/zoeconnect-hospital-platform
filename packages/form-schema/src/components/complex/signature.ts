import type { ComponentDefinition, ValidationContext } from '../../registry/component-definition';

export interface SignatureProps {
  label: string;
  provider: 'internal' | 'external';
  providerConfig?: Record<string, unknown>;
}

export const signatureDefinition: ComponentDefinition<SignatureProps, string> = {
  id: 'signature',
  displayName: 'Signature',
  category: 'complex',
  icon: 'drive_file_rename_outline',
  sdkVersion: '1.0.0',
  propertySchema: {
    sections: [
      {
        id: 'general',
        label: 'General',
        fields: [
          { key: 'label', label: 'Label', control: 'text' },
          { key: 'provider', label: 'Provider', control: 'select', options: [{ label: 'Internal', value: 'internal' }, { label: 'External', value: 'external' }] }
        ]
      }
    ]
  },
  defaultSchema: {
    type: 'signature',
    props: { label: 'Patient Signature', provider: 'internal' },
    geometry: { x: 0, y: 0, w: 300, h: 100, z: 0, pageId: 'default' },
    logic: {},
    validation: [{ kind: 'required' }],
    permissions: { visibleTo: [], editableBy: [] },
    audit: { trackChanges: true },
    fieldKey: 'signature',
  },
  validate: (value, rules, ctx: ValidationContext) => {
    const isRequired = rules.some((r) => r.kind === 'required');
    if (isRequired && !value) return { valid: false, errors: ['Signature is required'] };
    // Server-side re-validation (ADR-012) will actually verify the cryptographic signature hash if provided.
    // For pure schema validation, just ensure it is present if required.
    return { valid: true, errors: [] };
  },
  supportedEvents: [],
  supportedValidations: ['required'],
  supportedBindings: [],
  serialize: (v) => v,
  deserialize: (json) => (typeof json === 'string' ? json : ''),
};
