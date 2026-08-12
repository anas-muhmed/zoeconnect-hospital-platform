import React from 'react';
import type {
  LabelProps,
  TextboxProps,
  TextAreaProps,
  CheckboxProps,
  RadioProps,
  DropdownProps,
} from '@hdsp/form-schema';

/**
 * Wave 1 RendererComponents (Milestone 4, ADR-003/ADR-007's Renderer stage).
 * Unlike the Designer components (canvas-engine-react), these are fully
 * interactive: they read/write the actual field value via `value`/`onChange`
 * and surface a validation error inline. This is the "real fill experience"
 * half of Builder/Renderer separation.
 */
export interface RendererFieldProps<TProps, TValue> {
  fieldKey: string;
  props: TProps;
  value: TValue;
  error?: string[];
  onChange: (value: TValue) => void;
  onBlur: () => void;
}

const fieldWrapStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 };
const errorStyle: React.CSSProperties = { color: '#c62828', fontSize: 12 };

export function LabelRenderer({ props }: RendererFieldProps<LabelProps, never>) {
  const fontSize = props.variant === 'heading' ? 20 : props.variant === 'subheading' ? 16 : 14;
  const fontWeight = props.variant === 'body' ? 400 : 600;
  return <div style={{ fontSize, fontWeight, textAlign: props.align, marginBottom: 12 }}>{props.text}</div>;
}

export function TextboxRenderer({ fieldKey, props, value, error, onChange, onBlur }: RendererFieldProps<TextboxProps, string>) {
  return (
    <div style={fieldWrapStyle}>
      <label htmlFor={fieldKey}>
        {props.label}
        {props.required ? ' *' : ''}
      </label>
      <input
        id={fieldKey}
        type="text"
        placeholder={props.placeholder}
        maxLength={props.maxLength}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      {error?.map((msg) => (
        <span key={msg} style={errorStyle}>
          {msg}
        </span>
      ))}
    </div>
  );
}

export function TextAreaRenderer({ fieldKey, props, value, error, onChange, onBlur }: RendererFieldProps<TextAreaProps, string>) {
  return (
    <div style={fieldWrapStyle}>
      <label htmlFor={fieldKey}>
        {props.label}
        {props.required ? ' *' : ''}
      </label>
      <textarea
        id={fieldKey}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
        rows={props.rows}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      {error?.map((msg) => (
        <span key={msg} style={errorStyle}>
          {msg}
        </span>
      ))}
    </div>
  );
}

export function CheckboxRenderer({ fieldKey, props, value, error, onChange, onBlur }: RendererFieldProps<CheckboxProps, boolean>) {
  return (
    <div style={fieldWrapStyle}>
      <label htmlFor={fieldKey} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          id={fieldKey}
          type="checkbox"
          checked={value ?? false}
          onChange={(e) => onChange(e.target.checked)}
          onBlur={onBlur}
        />
        {props.label}
        {props.required ? ' *' : ''}
      </label>
      {error?.map((msg) => (
        <span key={msg} style={errorStyle}>
          {msg}
        </span>
      ))}
    </div>
  );
}

export function RadioRenderer({ fieldKey, props, value, error, onChange, onBlur }: RendererFieldProps<RadioProps, string>) {
  return (
    <div style={fieldWrapStyle}>
      <span>
        {props.label}
        {props.required ? ' *' : ''}
      </span>
      {props.options.map((opt) => (
        <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="radio"
            name={fieldKey}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            onBlur={onBlur}
          />
          {opt.label}
        </label>
      ))}
      {error?.map((msg) => (
        <span key={msg} style={errorStyle}>
          {msg}
        </span>
      ))}
    </div>
  );
}

export function DropdownRenderer({ fieldKey, props, value, error, onChange, onBlur }: RendererFieldProps<DropdownProps, string>) {
  return (
    <div style={fieldWrapStyle}>
      <label htmlFor={fieldKey}>
        {props.label}
        {props.required ? ' *' : ''}
      </label>
      <select id={fieldKey} value={value ?? ''} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}>
        <option value="">{props.placeholder}</option>
        {props.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error?.map((msg) => (
        <span key={msg} style={errorStyle}>
          {msg}
        </span>
      ))}
    </div>
  );
}
