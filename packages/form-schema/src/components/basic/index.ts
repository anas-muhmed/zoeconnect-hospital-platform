/**
 * Wave 1 ("Basic") component metadata registry (Phase 5B §4, Milestone 3).
 * These are framework-agnostic ComponentDefinitions — DesignerComponent /
 * RendererComponent are left undefined here and populated by
 * @hdsp/canvas-engine-react at registration time (see
 * register-basic-components.tsx), keeping this package React-free.
 */
export * from './types';
export * from './label';
export * from './textbox';
export * from './textarea';
export * from './checkbox';
export * from './radio';
export * from './dropdown';

import { labelDefinition } from './label';
import { textboxDefinition } from './textbox';
import { textAreaDefinition } from './textarea';
import { checkboxDefinition } from './checkbox';
import { radioDefinition } from './radio';
import { dropdownDefinition } from './dropdown';
import type { ComponentDefinition } from '../../registry/component-definition';

export const BASIC_COMPONENT_DEFINITIONS: ComponentDefinition<any, any>[] = [
  labelDefinition,
  textboxDefinition,
  textAreaDefinition,
  checkboxDefinition,
  radioDefinition,
  dropdownDefinition,
];
