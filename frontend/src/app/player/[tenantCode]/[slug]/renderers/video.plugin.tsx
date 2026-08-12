'use client';

import { useRef } from 'react';
import type { CMSRendererPlugin, ContentRendererProps } from './plugin-types';

function VideoRenderer({ item, mediaOrigin, onAdvance }: ContentRendererProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  return (
    <video
      ref={videoRef}
      src={`${mediaOrigin}${item.url}`}
      autoPlay
      muted={item.muted}
      loop={item.loopPlayback}
      onEnded={() => { if (!item.loopPlayback) onAdvance(); }}
      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
    />
  );
}

export const videoPlugin: CMSRendererPlugin = {
  id: 'video',
  name: 'Video',
  icon: 'Videocam',
  contentType: 'VIDEO',
  description: 'Plays an uploaded video, muted by default, optionally looping.',
  isWidget: false,
  Component: VideoRenderer,
};
