import React from 'react';
import type { ComponentDefinition, PropertyField } from '@hdsp/form-schema';
import type { SceneNode } from '@hdsp/canvas-engine';

/**
 * Inspector Generator (Phase 5B §2, pulled forward to Milestone 3) — the
 * property panel is generated from a ComponentDefinition's `propertySchema`,
 * not hand-built per component type. Adding a Wave 1+ component means
 * declaring propertySchema fields, not writing new panel UI (ADR-005's
 * "registration, not hardcoding" principle applied to the Inspector too).
 *
 * Milestone 3 supports the 'text' | 'number' | 'select' | 'toggle' controls,
 * which is everything Wave 1 components need. 'color' / 'expressionBuilder' /
 * 'custom' render a "not yet supported" placeholder — those are later-wave
 * concerns (Phase 5B §2.3's custom escape hatch is Milestone 6).
 */
export interface InspectorGeneratorProps {
  node: SceneNode;
  definition: ComponentDefinition;
  onChange: (nextProps: Record<string, unknown>) => void;
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: PropertyField;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  switch (field.control) {
    case 'text':
      return (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%' }}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          value={typeof value === 'number' ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: '100%' }}
        />
      );
    case 'toggle':
      return <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
    case 'select':
      return (
        <select value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} style={{ width: '100%' }}>
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    case 'color':
      return (
        <input
          type="color"
          value={typeof value === 'string' ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%', height: 24, padding: 0 }}
        />
      );
    case 'expressionBuilder':
      return (
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%', minHeight: 60, fontFamily: 'monospace', fontSize: 11 }}
          placeholder="e.g. {{ patient.age }} > 18"
        />
      );
    case 'custom':
      return (
        <textarea
          value={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)}
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value));
            } catch (err) {
              // Ignore invalid JSON while typing
            }
          }}
          style={{ width: '100%', minHeight: 100, fontFamily: 'monospace', fontSize: 11 }}
        />
      );
    default:
      return <em style={{ fontSize: 12, color: '#999' }}>Not yet supported (later milestone)</em>;
  }
}

export function InspectorGenerator({ node, definition, onChange }: InspectorGeneratorProps) {
  const props = node.props as Record<string, unknown>;
  const [advancedMode, setAdvancedMode] = React.useState(false);

  function setField(key: string, value: unknown) {
    onChange({ ...props, [key]: value });
  }

  const CustomEditor = definition.PropertyEditor as React.ComponentType<any> | undefined;

  return (
    <div data-testid="inspector-generator" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
        <span>{definition.displayName}</span>
        <label style={{ fontSize: 10, fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={advancedMode} onChange={(e) => setAdvancedMode(e.target.checked)} />
          Dev Mode
        </label>
      </div>
      {definition.propertySchema.sections.map((section) => (
        <div key={section.id}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 4 }}>{section.label}</div>
          {section.fields.map((field) => {
            if (field.control === 'custom' && !advancedMode) return null;
            return (
              <label key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6, fontSize: 12 }}>
                {field.label}
                <FieldControl field={field} value={props[field.key]} onChange={(v) => setField(field.key, v)} />
              </label>
            );
          })}
        </div>
      ))}
      
      {CustomEditor && (
        <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
          <CustomEditor node={node} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
