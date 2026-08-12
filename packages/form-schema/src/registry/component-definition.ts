import type { ComponentNode, ValidationRule } from '../schema/form-schema.types';

export type ComponentCategory = 'basic' | 'layout' | 'medical' | 'data' | 'workflow' | 'ai' | 'visualization' | 'custom' | 'input' | 'table' | 'structural' | 'complex';
export interface ValidationContext {
  [fieldKey: string]: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Property Schema — declared metadata each component uses to auto-generate its
 * Designer property panel (Phase 5B §2 Inspector Architecture). Adding a component
 * should not require hand-building a new property panel; it declares this instead.
 * Full section/field rendering is Milestone 3 (Inspector Generator); this is the
 * data contract it will consume.
 */
export interface PropertyField {
  key: string;
  label: string;
  control: 'text' | 'number' | 'select' | 'color' | 'toggle' | 'expressionBuilder' | 'custom';
  options?: { label: string; value: string }[];
}

export interface PropertySection {
  id: 'general' | 'appearance' | 'layout' | 'validation' | 'logic' | 'events' | 'accessibility' | 'security' | 'binding' | 'advanced';
  label: string;
  fields: PropertyField[];
}

export interface PropertySchema {
  sections: PropertySection[];
}

/**
 * Every component type in the platform is a registered ComponentDefinition
 * (ADR-005: Component Registry). Adding a component is a registration exercise —
 * the canvas, renderer, and property panel are expected to iterate this registry,
 * never hardcode a per-type switch statement.
 *
 * NOTE (Milestone 1 scoping decision): DesignerComponent/RendererComponent are
 * intentionally typed as `unknown` here, not `React.ComponentType`. This package
 * is consumed by both the NestJS backend and the Next.js frontend; it must not
 * depend on React (that dependency belongs to packages/canvas-engine-react, per
 * ADR-004). Frontend code narrows these fields to real React component types at
 * the point of use. No real components are registered in Milestone 1 — this is
 * registration-mechanics only, per docs/architecture/MILESTONE_PLAN.md.
 */
export interface ComponentDefinition<TProps = Record<string, unknown>, TValue = unknown> {
  id: string;
  displayName: string;
  category: ComponentCategory;
  icon: string;
  sdkVersion: string;
  DesignerComponent?: unknown;
  RendererComponent?: unknown;
  PropertyEditor?: unknown;
  canHaveChildren?: boolean;
  acceptedChildTypes?: string[];
  maxChildren?: number;
  propertySchema: PropertySchema;
  validate: (value: TValue, rules: ValidationRule[], ctx: ValidationContext) => ValidationResult;
  serialize: (value: TValue) => unknown;
  deserialize: (json: unknown) => TValue;
  defaultSchema: Partial<ComponentNode<TProps>>;
  supportedEvents: string[];
  supportedValidations: ValidationRule['kind'][];
  supportedBindings: string[] | 'none';
}
