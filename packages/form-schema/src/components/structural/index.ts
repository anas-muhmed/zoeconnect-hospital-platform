export * from './types';
export * from './container';
export * from './section';
export * from './card';
export * from './columns';
export * from './tabs';
export * from './accordion';

import { containerDefinition } from './container';
import { sectionDefinition } from './section';
import { cardDefinition } from './card';
import { columnsDefinition } from './columns';
import { tabsDefinition } from './tabs';
import { accordionDefinition } from './accordion';
import type { ComponentDefinition } from '../../registry/component-definition';

export const STRUCTURAL_COMPONENT_DEFINITIONS: ComponentDefinition<any, any>[] = [
  containerDefinition,
  sectionDefinition,
  cardDefinition,
  columnsDefinition,
  tabsDefinition,
  accordionDefinition,
];
