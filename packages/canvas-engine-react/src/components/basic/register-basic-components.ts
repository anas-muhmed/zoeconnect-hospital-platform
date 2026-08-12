import { ComponentRegistry, BASIC_COMPONENT_DEFINITIONS } from '@hdsp/form-schema';
import {
  LabelDesigner,
  TextboxDesigner,
  TextAreaDesigner,
  CheckboxDesigner,
  RadioDesigner,
  DropdownDesigner,
} from './designer-components';

/** Default placement size for each Wave 1 type, used by the palette when a
 * designer clicks "Add" (Milestone 3 — the ComponentDefinition itself does
 * not carry geometry, only default props; see form-schema's defaultSchema). */
export const BASIC_COMPONENT_DEFAULT_SIZE: Record<string, { width: number; height: number }> = {
  label: { width: 220, height: 32 },
  textbox: { width: 260, height: 56 },
  textarea: { width: 260, height: 120 },
  checkbox: { width: 220, height: 32 },
  radio: { width: 260, height: 100 },
  dropdown: { width: 260, height: 56 },
};

const DESIGNER_COMPONENTS: Record<string, unknown> = {
  label: LabelDesigner,
  textbox: TextboxDesigner,
  textarea: TextAreaDesigner,
  checkbox: CheckboxDesigner,
  radio: RadioDesigner,
  dropdown: DropdownDesigner,
};

/**
 * Assembles the framework-agnostic ComponentDefinitions from @hdsp/form-schema
 * with their real React DesignerComponent and registers them into the given
 * registry (ADR-005). This is the one place in the app where form-schema's
 * React-free metadata and canvas-engine-react's React components meet.
 */
export function registerBasicComponents(registry: ComponentRegistry): void {
  BASIC_COMPONENT_DEFINITIONS.forEach((def) => {
    if (registry.has(def.id)) return;
    registry.register({ ...def, DesignerComponent: DESIGNER_COMPONENTS[def.id] });
  });
}
