/**
 * CMS Renderer Plugin SDK (Phase 5, Sprint 0).
 *
 * Formalizes the contract every piece of on-screen content implements --
 * file-backed media (Image, Video) and non-file "widgets" (Queue Widget,
 * and future HTML/Dashboard/PDF/Clock/Weather/RSS/Embedded-Page plugins)
 * are both just CMSRendererPlugin implementations registered in
 * renderers/registry.ts. The player core (page.tsx) and the playback loop
 * never branch on content type -- they resolve a plugin by contentType and
 * delegate both rendering and "when to advance" to it. Adding a new plugin
 * never requires touching the player core.
 *
 * Adapted to React idioms rather than an imperative container/render/destroy
 * API: `Component` *is* the render/destroy lifecycle (mount/unmount via
 * React), and `preload` is an optional hook for plugins that need to warm up
 * non-asset state (e.g. an initial data fetch) before being shown.
 */

import type { ComponentType } from 'react';

/** Keep this union in sync with the backend's CMSPlaylistItem.widgetType / CMSMedia.mediaType values. */
export type CMSContentType = 'IMAGE' | 'VIDEO' | 'QUEUE_WIDGET';

export interface SnapshotItem {
  itemId: string;
  /** Null for widget items (not file-backed) -- see CMSPlaylistItem.mediaId nullability, Phase 5. */
  mediaId: string | null;
  url: string;
  mimeType: string;
  mediaType: CMSContentType;
  durationSeconds: number | null;
  muted: boolean;
  loopPlayback: boolean;
  playFull: boolean;
  /** Widget items only: plugin-specific settings (e.g. Queue Widget's referenceId/theme/refreshSeconds). */
  configuration?: Record<string, unknown> | null;
}

export interface ContentRendererProps {
  item: SnapshotItem;
  mediaOrigin: string;
  /** Renderer calls this when it's done displaying its content and playback should move to the next item. */
  onAdvance: () => void;
}

export interface PluginConfigField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  options?: { value: string; label: string }[];
  defaultValue?: unknown;
  helperText?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface CMSRendererPlugin {
  /** Stable machine id, e.g. 'image', 'video', 'queue-widget'. Distinct from contentType for readability. */
  id: string;
  /** Display name used in the admin "Add Widget" picker. */
  name: string;
  /** MUI icon name (resolved via an icon lookup map in the admin UI, e.g. 'Queue', 'Image'). */
  icon: string;
  /** The CMSPlaylistItem.mediaType / widgetType this plugin handles. */
  contentType: CMSContentType;
  description: string;
  /** True for non-file-backed plugins that can be added to a playlist directly (no media upload). */
  isWidget: boolean;
  /** Drives an auto-generated config form in the admin "Add Widget" dialog. Omitted for file-backed plugins. */
  configSchema?: PluginConfigField[];
  validateConfig?(config: unknown): ValidationResult;
  /** Optional warm-up hook (e.g. an initial data fetch) run before the item is first shown. Never required. */
  preload?(item: SnapshotItem): Promise<void>;
  Component: ComponentType<ContentRendererProps>;
}
