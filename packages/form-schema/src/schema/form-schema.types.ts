/**
 * FormSchema — the canonical, versioned JSON document that is the single source of
 * truth for a form (ADR-001: Schema-First Architecture). The Builder produces it,
 * the Renderer consumes it; neither owns a parallel representation.
 *
 * This is a Milestone 1 skeleton: the shapes below match the illustrative JSON in
 * Phase 2 §5 of the architecture roadmap. They are intentionally minimal — full
 * component prop typing, rule-expression evaluation, and scene-graph <-> schema
 * (de)serialization are Milestone 3+ work (see docs/architecture/MILESTONE_PLAN.md).
 * Do not add component-specific fields here; component-specific shape lives in each
 * component's own ComponentDefinition (see ../registry/component-definition.ts).
 */

export const CURRENT_SCHEMA_VERSION = '1.0';

export type PageSize = 'A4' | 'A5' | 'Letter' | 'Legal' | 'Custom';
export type PageOrientation = 'portrait' | 'landscape';

export interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  z: number;
  pageId: string;
}

export interface ValidationRule {
  kind: 'required' | 'regex' | 'range' | 'date' | 'crossField' | 'async';
  message?: string;
  [param: string]: unknown;
}

/**
 * A closed, non-executable expression tree (Phase 1 §5.3 / ADR-012's security
 * constraint: never arbitrary code, never eval/new Function). Milestone 1 only
 * defines the shape; the evaluator itself is Milestone 5 (Rule Engine).
 */
export type RuleExpression =
  | { op: 'CONST'; value: unknown }
  | { op: 'FIELD'; field: string }
  | { op: 'VAR'; path: string }
  | { op: 'IF'; cond: RuleExpression; then: RuleExpression; else?: RuleExpression }
  | { op: 'AND' | 'OR'; args: RuleExpression[] }
  | { op: 'NOT'; arg: RuleExpression }
  | { op: 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE'; left: RuleExpression; right: RuleExpression }
  | { op: 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT'; field: string };

export interface BindingRef {
  entity: 'Patient' | 'Visit' | 'Encounter' | 'Doctor' | 'Department' | 'Admission' | 'Insurance' | 'Hospital' | 'Appointment' | 'User' | string;
  field: string;
}

export interface ComponentLogic {
  visibleIf?: RuleExpression | null;
  requiredIf?: RuleExpression | null;
  readOnlyIf?: RuleExpression | null;
  calculate?: RuleExpression | null;
}

export interface ComponentPermissions {
  visibleTo: string[];
  editableBy: string[];
}

export interface LayoutProps {
  flexDirection?: 'row' | 'column';
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around';
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
  gap?: number;
  padding?: number | [number, number] | [number, number, number, number];
  wrap?: boolean;
}

/**
 * A single placed component node. `type` is a Component Registry key — the schema
 * itself never encodes rendering logic, only a reference to it (ADR-005).
 */
export interface ComponentNode<TProps = Record<string, unknown>> {
  id: string;
  type: string;
  fieldKey: string;
  geometry: Geometry;
  props: TProps;
  validation: ValidationRule[];
  logic: ComponentLogic;
  binding?: BindingRef | null;
  permissions: ComponentPermissions;
  audit: { trackChanges: boolean };
  accessibility?: { ariaLabel?: string };
  layout?: LayoutProps;
  children?: ComponentNode[];
}

export interface PageHeaderFooter {
  text?: string;
  showPageNumber?: boolean;
}

export interface PageNode {
  id: string;
  size: PageSize;
  orientation: PageOrientation;
  customWidthMm?: number;
  customHeightMm?: number;
  header?: PageHeaderFooter | null;
  footer?: PageHeaderFooter | null;
  watermark?: string | null;
  backgroundColor?: string | null;
  backgroundImageAssetId?: string | null;
  components: ComponentNode[];
}

export interface FormDataSourceRef {
  id: string;
  type: 'internal-api' | 'external-api' | 'static';
  endpoint?: string;
}

export interface FormSchema {
  schemaVersion: string;
  formId: string;
  category: 'registration' | 'consent' | 'assessment' | 'custom' | string;
  pages: PageNode[];
  dataSources: FormDataSourceRef[];
  theme?: { tokenSetId: string } | null;
}

/** Minimal structural guard — full zod validation lands with real components (Milestone 3). */
export function isFormSchema(value: unknown): value is FormSchema {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.schemaVersion === 'string' &&
    typeof v.formId === 'string' &&
    Array.isArray(v.pages)
  );
}
