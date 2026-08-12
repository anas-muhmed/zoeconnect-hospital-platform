'use client';

import { useEffect } from 'react';
import type { CMSRendererPlugin, ContentRendererProps } from './plugin-types';

function ImageRenderer({ item, mediaOrigin, onAdvance }: ContentRendererProps) {
  useEffect(() => {
    const seconds = item.durationSeconds ?? 10;
    const timer = setTimeout(onAdvance, seconds * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.itemId]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${mediaOrigin}${item.url}`}
      alt=""
      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
    />
  );
}

export const imagePlugin: CMSRendererPlugin = {
  id: 'image',
  name: 'Image',
  icon: 'Image',
  contentType: 'IMAGE',
  description: 'Displays an uploaded image for a configured duration.',
  isWidget: false,
  Component: ImageRenderer,
};
