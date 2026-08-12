'use client';

/**
 * CMS Player — content renderer registry (compatibility shim).
 *
 * As of Phase 5 Sprint 0, actual renderers are formalized CMSRendererPlugin
 * implementations under ./renderers/ (see renderers/plugin-types.ts for the
 * contract, renderers/registry.ts for the plugin list). This file re-exports
 * the pieces page.tsx already imports so the player core needed zero changes,
 * plus the new plugin-oriented exports (listPlugins/getWidgetPlugins) for the
 * admin UI's "Add Widget" picker.
 *
 * The player core (page.tsx) still never branches on content type directly:
 * it looks up a renderer by `mediaType` via getRenderer() and delegates both
 * display and "when to advance" to it. Adding a new plugin (PDF, HTML
 * widget, weather, RSS, dashboard, clock, embedded page, etc.) means:
 * implement a new CMSRendererPlugin under ./renderers/, register it in
 * renderers/registry.ts, and extend the CMSContentType union. No changes to
 * page.tsx or the playback loop are required.
 */

import type { ComponentType } from 'react';
import type { CMSContentType, ContentRendererProps } from './renderers/plugin-types';
import { getPlugin } from './renderers/registry';

export type {
  CMSContentType as ContentType,
  SnapshotItem,
  ContentRendererProps,
  CMSRendererPlugin,
  PluginConfigField,
  ValidationResult,
} from './renderers/plugin-types';

export { listPlugins, getWidgetPlugins } from './renderers/registry';

export interface CMSContentRenderer {
  type: CMSContentType;
  Component: ComponentType<ContentRendererProps>;
}

export function getRenderer(type: CMSContentType): CMSContentRenderer | undefined {
  const plugin = getPlugin(type);
  if (!plugin) return undefined;
  return { type: plugin.contentType, Component: plugin.Component };
}
