import type { ValidationRule } from '../../schema/form-schema.types';
import type { ValidationContext, ValidationResult } from '../../registry/component-definition';

/** Shared "required" + "regex" checks reused across Wave 1 input components. */
export function runStandardValidations(
  value: unknown,
  rules: ValidationRule[],
  isEmpty: (v: unknown) => boolean,
): ValidationResult {
  const errors: string[] = [];
  for (const rule of rules) {
    if (rule.kind === 'required' && isEmpty(value)) {
      errors.push(rule.message ?? 'This field is required.');
    }
    if (rule.kind === 'regex' && typeof value === 'string' && typeof rule.pattern === 'string') {
      const re = new RegExp(rule.pattern);
      if (value.length > 0 && !re.test(value)) {
        errors.push(rule.message ?? 'This field is not in the expected format.');
      }
    }
    if (rule.kind === 'range' && typeof value === 'string') {
      const min = typeof rule.min === 'number' ? rule.min : undefined;
      const max = typeof rule.max === 'number' ? rule.max : undefined;
      if (min !== undefined && value.length < min) errors.push(rule.message ?? `Must be at least ${min} characters.`);
      if (max !== undefined && value.length > max) errors.push(rule.message ?? `Must be at most ${max} characters.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// Re-exported so component files don't each need their own ValidationContext import.
export type { ValidationContext };
