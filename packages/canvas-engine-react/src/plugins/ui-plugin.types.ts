import { ReactNode, ComponentType } from 'react';

/**
 * Defines a lazy-loaded panel for the left dock (e.g. Explorer, Components, Layers, AI Studio).
 */
export interface DesignerPanelPlugin {
  id: string;
  title: string;
  icon: ReactNode;
  lazyLoader: () => Promise<{ default: ComponentType<any> }>;
  priority: number;
}

/**
 * Defines an extensible tab for the right Inspector panel (e.g. Properties, Appearance, Validation).
 */
export interface InspectorTabPlugin {
  id: string;
  title: string;
  icon?: ReactNode;
  lazyLoader: () => Promise<{ default: ComponentType<any> }>;
  priority: number;
}

/**
 * Defines a contribution to the bottom Status Bar.
 */
export interface StatusBarItemPlugin {
  id: string;
  alignment: 'left' | 'right';
  priority: number;
  render: () => ReactNode;
}
