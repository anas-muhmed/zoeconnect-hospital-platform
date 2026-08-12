/**
 * Wave 1 ("Basic") component prop shapes (Phase 5B §4, Milestone 3). Each type
 * is intentionally minimal — just enough to prove the Design→Save→Reload→Render
 * round trip and the Inspector Generator against real components. Richer props
 * (formatting, masks, async validation, etc.) are added incrementally in later
 * waves without changing this shape's contract.
 */
export interface SelectOption {
  label: string;
  value: string;
}

export interface LabelProps {
  text: string;
  variant: 'body' | 'heading' | 'subheading';
  align: 'left' | 'center' | 'right';
}

export interface TextboxProps {
  label: string;
  placeholder: string;
  defaultValue: string;
  maxLength: number;
  required: boolean;
}

export interface TextAreaProps {
  label: string;
  placeholder: string;
  defaultValue: string;
  rows: number;
  maxLength: number;
  required: boolean;
}

export interface CheckboxProps {
  label: string;
  defaultChecked: boolean;
  required: boolean;
}

export interface RadioProps {
  label: string;
  options: SelectOption[];
  defaultValue: string;
  required: boolean;
}

export interface DropdownProps {
  label: string;
  options: SelectOption[];
  placeholder: string;
  defaultValue: string;
  required: boolean;
}
