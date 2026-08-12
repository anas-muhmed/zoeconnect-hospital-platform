'use client';

/**
 * TickerOverlay --- the CMS player's persistent scrolling ticker bar.
 *
 * Deliberately independent of the main content pipeline in page.tsx: it
 * polls its own endpoint (GET /cms/player/:slug/ticker) on its own interval
 * and renders as a fixed-position layer that sits on top of whatever the
 * playlist/maintenance/emergency layer is currently showing, so a ticker
 * message never interrupts or gets interrupted by content playback. This
 * mirrors the always-visible emergency banner already in page.tsx, but is
 * opt-in per display (tickerEnabled) rather than triggered by an incident.
 *
 * The scroll animation itself reuses the CSS keyframe technique from the
 * token module's marquee canvas element (frontend/src/app/token/display-config/renderer.tsx)
 * -- a doubled text string translated by -50% on an infinite linear loop --
 * since that's already a proven, GPU-cheap way to do a seamless ticker.
 *
 * Message *content* is fully resolved server-side (CmsTickerService) --
 * this component only ever renders whatever text array it's handed. Future
 * dynamic sources (emergency mirror, live queue feed, external API feed)
 * plug in entirely on the backend; no changes needed here.
 */

import { useState, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/api\/v1\/?$/, '');
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? `${API_ORIGIN}/api/v1`;

const POLL_INTERVAL_MS = 30_000;

interface TickerMessage {
  id: string;
  text: string;
  sourceType: 'MANUAL' | 'EMERGENCY' | 'QUEUE' | 'API_FEED';
}

interface TickerPayload {
  enabled: boolean;
  position: 'top' | 'bottom';
  speed: number;
  backgroundColor: string | null;
  textColor: string | null;
  fontSize: number;
  separator: string;
  messages: TickerMessage[];
}

const EMPTY_TICKER: TickerPayload = {
  enabled: false, position: 'bottom', speed: 3, backgroundColor: null, textColor: null,
  fontSize: 1.4, separator: '     •     ', messages: [],
};

export default function TickerOverlay({ slug }: { slug: string }) {
  const [ticker, setTicker] = useState<TickerPayload>(EMPTY_TICKER);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const fetchTicker = () => {
      fetch(`${API_BASE}/cms/player/${slug}/ticker`)
        .then(res => (res.ok ? res.json() : null))
        .then((data: TickerPayload | null) => {
          if (data && mountedRef.current) setTicker(data);
        })
        .catch(() => { /* ticker is best-effort -- never disrupt the main player on failure */ });
    };
    fetchTicker();
    const id = setInterval(fetchTicker, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [slug]);

  if (!ticker.enabled || ticker.messages.length === 0) return null;

  const speed = Math.max(0.5, Math.min(10, ticker.speed || 3));
  const duration = 60 / speed;
  const animName = `cmsTicker_${Math.round(speed * 10)}`;
  const combinedText = ticker.messages.map(m => m.text).join(ticker.separator || '     •     ');
  const text = combinedText + (ticker.separator || '     •     ');

  return (
    <Box
      sx={{
        position: 'absolute',
        left: 0, right: 0,
        top: ticker.position === 'top' ? 0 : undefined,
        bottom: ticker.position === 'bottom' ? 0 : undefined,
        zIndex: 20, // above content and above the emergency banner's own z-index of 10
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        height: '3.2em',
        bgcolor: ticker.backgroundColor ?? 'rgba(0,0,0,0.75)',
        boxShadow: 3,
      }}
    >
      <style>{`@keyframes ${animName} { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
      <Box sx={{ display: 'inline-block', whiteSpace: 'nowrap', animation: `${animName} ${duration}s linear infinite`, willChange: 'transform' }}>
        <span style={{
          color: ticker.textColor ?? '#fff',
          fontSize: `${ticker.fontSize ?? 1.4}em`,
          fontWeight: 600,
          letterSpacing: '1px',
        }}>
          {text + text}
        </span>
      </Box>
    </Box>
  );
}
