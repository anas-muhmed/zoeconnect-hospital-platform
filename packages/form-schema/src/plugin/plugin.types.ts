import type { ComponentDefinition } from '../registry/component-definition';

/** The platform's current Plugin SDK version. Bumped only on breaking changes to
 * the FormBuilderPlugin contract itself (Phase 4B §5 / ADR-006) — not on ordinary
 * platform feature releases. */
export const CURRENT_SDK_VERSION = '1.0.0';

export interface ToolbarButtonDef {
  id: string;
  label: string;
  icon: string;
}

export interface ShortcutDef {
  keys: string;
  commandId: string;
}

export interface LifecycleHooks {
  beforeAddNode?: (node: unknown) => void | false;
  afterAddNode?: (node: unknown) => void;
  beforeDelete?: (nodeId: string) => void | false;
  afterDelete?: (nodeId: string) => void;
  beforeSerialize?: () => void;
  afterSerialize?: (schema: unknown) => void;
  beforeUndo?: () => void;
  afterRedo?: () => void;
}

/**
 * FormBuilderPlugin — the versioned manifest contract a plugin implements to
 * contribute components, templates, validators, and chrome extensions without
 * touching core platform code (ADR-006: Plugin SDK). No real plugins exist yet in
 * Milestone 1 — this is the interface only, exercised end-to-end starting
 * Milestone 7 (docs/architecture/MILESTONE_PLAN.md).
 */
export interface FormBuilderPlugin {
  id: string;
  displayName: string;
  version: string;
  /** Semver range this plugin was built against, e.g. '^1.0.0'. Checked by
   * PluginCompatibilityService before activation. */
  sdkVersion: string;
  components?: ComponentDefinition<any, any>[];
  validators?: unknown[]; // Type to be defined later
  renderers?: unknown[];
  dataSources?: unknown[];
  exporters?: unknown[];
  toolbarContributions?: ToolbarButtonDef[];
  keyboardShortcuts?: ShortcutDef[];
  lifecycleHooks?: LifecycleHooks;
  onInstall?(): void | Promise<void>;
  onActivate?(): void;
}

export type CompatibilityStatus = 'compatible' | 'incompatible' | 'unknown';

export interface CompatibilityResult {
  status: CompatibilityStatus;
  reason?: string;
}
