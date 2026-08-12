import React from 'react';
import type { SceneNode } from '@hdsp/canvas-engine';
import type {
  LabelProps,
  TextboxProps,
  TextAreaProps,
  CheckboxProps,
  RadioProps,
  DropdownProps,
} from '@hdsp/form-schema';

/**
 * Wave 1 Designer components (Phase 5B §4, Milestone 3). These render the
 * Design-time appearance of each component inside the canvas — they are NOT
 * the Runtime fill experience (Milestone 4's Renderer stage, ADR-007); no
 * value state is captured or submitted here, and fields render `disabled` so
 * a designer can select/drag the node instead of typing into it.
 */

const boxStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  fontSize: 14,
  pointerEvents: 'none', // let the canvas host handle selection/drag, not the widget
};

export function LabelDesigner({ node }: { node: SceneNode<LabelProps> }) {
  const { text, variant, align } = node.props;
  const fontSize = variant === 'heading' ? 20 : variant === 'subheading' ? 16 : 14;
  const fontWeight = variant === 'body' ? 400 : 600;
  return (
    <div style={{ ...boxStyle, fontSize, fontWeight, textAlign: align, display: 'flex', alignItems: 'center' }}>
      {text}
    </div>
  );
}

export function TextboxDesigner({ node }: { node: SceneNode<TextboxProps> }) {
  const { label, placeholder, defaultValue, required } = node.props;
  return (
    <div style={{ ...boxStyle, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11, color: '#555' }}>
        {label}
        {required ? ' *' : ''}
      </span>
      <input disabled placeholder={placeholder} defaultValue={defaultValue} style={{ width: '100%' }} />
    </div>
  );
}

export function TextAreaDesigner({ node }: { node: SceneNode<TextAreaProps> }) {
  const { label, placeholder, defaultValue, rows, required } = node.props;
  return (
    <div style={{ ...boxStyle, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11, color: '#555' }}>
        {label}
        {required ? ' *' : ''}
      </span>
      <textarea disabled placeholder={placeholder} defaultValue={defaultValue} rows={rows} style={{ width: '100%', resize: 'none' }} />
    </div>
  );
}

export function CheckboxDesigner({ node }: { node: SceneNode<CheckboxProps> }) {
  const { label, defaultChecked, required } = node.props;
  return (
    <label style={{ ...boxStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
      <input type="checkbox" disabled defaultChecked={defaultChecked} />
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
    </label>
  );
}

export function RadioDesigner({ node }: { node: SceneNode<RadioProps> }) {
  const { label, options, defaultValue, required } = node.props;
  return (
    <div style={boxStyle}>
      <div style={{ fontSize: 11, color: '#555' }}>
        {label}
        {required ? ' *' : ''}
      </div>
      {options.map((opt) => (
        <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
          <input type="radio" disabled defaultChecked={opt.value === defaultValue} />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

export function DropdownDesigner({ node }: { node: SceneNode<DropdownProps> }) {
  const { label, options, placeholder, defaultValue, required } = node.props;
  return (
    <div style={{ ...boxStyle, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11, color: '#555' }}>
        {label}
        {required ? ' *' : ''}
      </span>
      <select disabled defaultValue={defaultValue} style={{ width: '100%' }}>
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
