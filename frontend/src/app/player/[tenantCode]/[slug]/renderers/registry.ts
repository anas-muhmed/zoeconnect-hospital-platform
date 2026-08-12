'use client';

import type { CMSContentType, CMSRendererPlugin } from './plugin-types';
import { imagePlugin } from './image.plugin';
import { videoPlugin } from './video.plugin';
import { queueWidgetPlugin } from './queue-widget.plugin';

/** Every registered renderer plugin. Add a new plugin here (and nowhere else) to make it playable. */
export const CMS_RENDERER_PLUGINS: CMSRendererPlugin[] = [
  imagePlugin,
  videoPlugin,
  queueWidgetPlugin,
];

const REGISTRY: Partial<Record<CMSContentType, CMSRendererPlugin>> = Object.fromEntries(
  CMS_RENDERER_PLUGINS.map(p => [p.contentType, p]),
) as Partial<Record<CMSContentType, CMSRendererPlugin>>;

export function getPlugin(type: CMSContentType): CMSRendererPlugin | undefined {
  return REGISTRY[type];
}

export function listPlugins(): CMSRendererPlugin[] {
  return CMS_RENDERER_PLUGINS;
}

/** Widget plugins (not file-backed) -- these are what the admin "Add Widget" picker offers. */
export function getWidgetPlugins(): CMSRendererPlugin[] {
  return CMS_RENDERER_PLUGINS.filter(p => p.isWidget);
}
