export * from './types';
export * from './table';
export * from './repeat-section';
export * from './variables';
export * from './rules';
export * from './signature';

import { tableDefinition } from './table';
import { repeatSectionDefinition } from './repeat-section';
import { variablesDefinition } from './variables';
import { rulesDefinition } from './rules';
import { signatureDefinition } from './signature';
import type { ComponentDefinition } from '../../registry/component-definition';

export const COMPLEX_COMPONENT_DEFINITIONS: ComponentDefinition<any, any>[] = [
  tableDefinition,
  repeatSectionDefinition,
  variablesDefinition,
  rulesDefinition,
  signatureDefinition,
];
