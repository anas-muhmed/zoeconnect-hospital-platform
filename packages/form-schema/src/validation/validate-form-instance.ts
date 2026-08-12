import type { FormSchema, ComponentNode } from '../schema/form-schema.types';
import type { ComponentDefinition } from '../registry/component-definition';
import { RuleEngine } from '../rendering-pipeline/rule-engine';

export interface FormInstanceValidationResult {
  valid: boolean;
  errors: Record<string, string[]>;
}

export interface ValidationExecutionContext {
  variables?: Record<string, unknown>;
}

/**
 * Validates a filled instance's answers against its FormSchema (Milestone 4,
 * ADR-012 — this is what powers BOTH client-side inline validation in the
 * Renderer and the server's authoritative re-validation on finalize; the
 * exact same function, not two implementations that could drift). Generic
 * over `definitions` (ADR-005): never hardcodes which component types exist,
 * so it works for Wave 1 today and later waves without modification.
 */
export function validateAnswersAgainstSchema(
  schema: FormSchema,
  answers: Record<string, unknown>,
  definitions: ComponentDefinition[],
  executionContext?: ValidationExecutionContext,
): FormInstanceValidationResult {
  const byId = new Map(definitions.map((d) => [d.id, d]));
  const errors: Record<string, string[]> = {};
  const evalContext = { ...answers, ...(executionContext?.variables || {}) };

  function validateNode(component: ComponentNode) {
    // If the component is explicitly hidden by a rule, we skip validation for it and its children.
    if (component.logic?.visibleIf) {
      const isVisible = RuleEngine.evaluate(component.logic.visibleIf, evalContext);
      if (!isVisible) return;
    }

    const definition = byId.get(component.type);
    if (definition) {
      const value = answers[component.fieldKey];
      const result = definition.validate(value, component.validation, answers);
      if (!result.valid) {
        errors[component.fieldKey] = result.errors;
      }
    }

    if (component.children && component.children.length > 0) {
      for (const child of component.children) {
        validateNode(child);
      }
    }
  }

  const allComponents: ComponentNode[] = schema.pages.flatMap((p) => p.components);
  for (const component of allComponents) {
    validateNode(component);
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
