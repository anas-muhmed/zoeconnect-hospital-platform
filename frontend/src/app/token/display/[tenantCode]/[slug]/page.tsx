'use client';

/**
 * Named Display Page (Cloud) — /token/display/:tenantCode/:slug
 * Full-screen TV board for a custom named page created by a superadmin.
 * Layout is fetched from GET /token/display/:tenantCode/:slug.
 * Falls back to a "not found" screen if the slug is unknown or inactive.
 *
 * Shares the same canvas renderer and WebSocket live-state as /token/display.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { io }     from 'socket.io-client';
import Box        from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { initTokenAudio, announceToken, resetAudioMode, getAudioStatus, preloadVoices } from '@/lib/audio/tokenAudio';
import { TokenCalledPayload } from '@/lib/hooks/useTokenSocket';
import { DisplayLayout, DEFAULT_LAYOUT } from '@/app/token/display-config/types';
import { RenderElement }                  from '@/app/token/display-config/renderer';
import { useFullscreenToggle }            from '@/lib/hooks/useFullscreenToggle';
import { resolveSocketBaseUrl } from '@/lib/utils/socket-url';

const WS_URL = resolveSocketBaseUrl();

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PublicCounterSlot {
  id:            string;
  counterNumber: number;
  currentToken:  number | null;
  isOccupied:    boolean;
}

interface PublicLocationState {
  id:           string;
  code:         string;
  label:        string;
  isActive:     boolean;
  displayOrder: number;
  counters:     PublicCounterSlot[];
  calledTokens: number[];
}

type RenderLocation = {
  code: string;
  label: string;
  counters: { id: string; counterNumber: number; currentToken: number | null }[];
};

type RenderRecent = {
  tokenNumber:   number;
  locationLabel: string;
  locationCode:  string;
  counterNumber: number;
};

// ── WebSocket hook ────────────────────────────────────────────────────────────

function usePublicSocket(
  onTokenCalled:  (payload: TokenCalledPayload) => void,
) {
  const [locations, setLocations] = useState<PublicLocationState[]>([]);
  const [connected, setConnected] = useState(false);
  const cbRef = useRef(onTokenCalled);
  useEffect(() => { cbRef.current = onTokenCalled; }, [onTokenCalled]);

  useEffect(() => {
    const socket = io(`${WS_URL}/token`, {
      transports: ['websocket'],
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 8_000,
    });
    socket.on('connect',       () => setConnected(true));
    socket.on('disconnect',    () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('token:state',   (data: PublicLocationState[]) => setLocations(data));
    socket.on('token:called',  (p: TokenCalledPayload) => cbRef.current(p));
    return () => { socket.disconnect(); };
  }, []);

  return { locations, connected };
}

// ── Flash hook ────────────────────────────────────────────────────────────────

function useFlash() {
  const [flashId, setFlashId] = useState<string | null>(null);
  const flash = useCallback((id: string) => {
    setFlashId(id);
    setTimeout(() => setFlashId(null), 2_200);
  }, []);
  return { flashId, flash };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NamedDisplayPage() {
  const params = useParams();
  const slug   = typeof params?.slug === 'string' ? params.slug : (params?.slug?.[0] ?? '');
  const tenantCode = typeof params?.tenantCode === 'string' ? params.tenantCode : (params?.tenantCode?.[0] ?? '');

  const [layout,      setLayout]      = useState<DisplayLayout | null>(null);
  const [pageTitle,   setPageTitle]   = useState('');
  const [notFound,    setNotFound]    = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [recentCalls, setRecentCalls] = useState<RenderRecent[]>([]);
  const [canvasW,     setCanvasW]     = useState(1920);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { flashId, flash } = useFlash();

  // Track canvas width for em scaling
  useEffect(() => {
    const obs = new ResizeObserver(([e]) => setCanvasW(e.contentRect.width));
    if (canvasRef.current) obs.observe(canvasRef.current);
    return () => obs.disconnect();
  }, []);

  // Fetch named page config by slug
  useEffect(() => {
    if (!slug || !tenantCode) return;
    fetch(`${API_BASE}/token/display/${tenantCode}/${slug}`)
      .then(async (r) => {
        if (!r.ok) {
          try {
            const errJson = await r.json();
            console.error('[Diagnostic 404 Error from Backend]', errJson);
          } catch {
            console.error('[Diagnostic 404 Error from Backend]', r.statusText);
          }
          setNotFound(true); 
          return null; 
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        if (!data.isActive) { setNotFound(true); return; }
        setPageTitle(data.title ?? slug);
        const lay = data.layout;
        if (lay?.version === 2) {
          setLayout(lay as DisplayLayout);
        } else {
          // Page exists but has no layout yet — show blank canvas
          setLayout({ ...DEFAULT_LAYOUT, elements: [] });
        }
      })
      .catch(() => setNotFound(true));
  }, [slug, tenantCode]);

  // Audio setup
  useEffect(() => {
    initTokenAudio().then(() => {}).catch(() => {});
    try {
      const ctx = new AudioContext();
      if (ctx.state === 'running') {
        if ('speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance(''); u.volume = 0;
          window.speechSynthesis.speak(u);
        }
        setAudioUnlocked(true);
      }
      ctx.close();
    } catch { /* ignore */ }
  }, []);

  const unlockAudio = useCallback(() => {
    const primer = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    primer.play().catch(() => {});
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance('Display ready');
      u.volume = 1; u.rate = 0.9;
      window.speechSynthesis.speak(u);
    }
    resetAudioMode();
    preloadVoices();           // warm up voice list so female voice is ready
    initTokenAudio().catch(() => {});
    setAudioUnlocked(true);
  }, []);

  const handleTokenCalled = useCallback((payload: TokenCalledPayload) => {
    flash(payload.counterId);
    setRecentCalls((prev) => {
      const next: RenderRecent = {
        tokenNumber:   payload.tokenNumber,
        locationLabel: payload.locationLabel,
        locationCode:  payload.locationCode,
        counterNumber: payload.counterNumber,
      };
      return [next, ...prev].slice(0, 50);
    });
    announceToken(payload.tokenNumber, payload.counterNumber).catch(() => {});
  }, [flash]);

  const { locations, connected } = usePublicSocket(handleTokenCalled);

  const renderLocations = useMemo<RenderLocation[]>(() => {
    return locations
      .filter((l) => l.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }, [locations]);

  const sortedElements = useMemo(
    () => layout ? [...layout.elements].sort((a, b) => (a.config.zIndex ?? 1) - (b.config.zIndex ?? 1)) : [],
    [layout],
  );

  // ── Not found ──────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <Box sx={{ width: '100vw', height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: '#0d1117', color: '#fff', gap: 2 }}>
        <Typography sx={{ fontSize: '3rem', opacity: 0.3 }}>📺</Typography>
        <Typography sx={{ fontSize: '1.4rem', fontWeight: 700 }}>Display page not found</Typography>
        <Typography sx={{ fontSize: '0.9rem', opacity: 0.4 }}>/token/display/{tenantCode}/{slug}</Typography>
      </Box>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!layout) {
    return (
      <Box sx={{ width: '100vw', height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#0d1117' }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#4caf50', boxShadow: '0 0 12px #4caf50', animation: 'pulse 1s infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.2 } } }} />
      </Box>
    );
  }

  const { toggleFullScreen } = useFullscreenToggle();

  // ── Canvas ─────────────────────────────────────────────────────────────────
  return (
    <Box 
      onDoubleClick={toggleFullScreen}
      sx={{ width: '100vw', height: '100dvh', overflow: 'hidden', bgcolor: '#000', userSelect: 'none' }}
    >
      <Box
        ref={canvasRef}
        sx={{
          position: 'relative',
          width: '100vw',
          height: '100dvh',
          backgroundColor: layout.backgroundColor,
          overflow: 'hidden',
          fontSize: '1vw',
          transition: 'background-color 0.5s ease',
        }}
      >
        <style>{`
          @keyframes tokenFlash {
            0%   { background-color: transparent; }
            12%  { background-color: rgba(255,215,0,0.35); }
            28%  { background-color: transparent; }
            44%  { background-color: rgba(255,215,0,0.35); }
            60%  { background-color: transparent; }
            76%  { background-color: rgba(255,215,0,0.18); }
            100% { background-color: transparent; }
          }
        `}</style>

        {sortedElements.map((el) => (
          <Box
            key={el.id}
            sx={{
              position: 'absolute',
              left:   `${el.x}%`,
              top:    `${el.y}%`,
              width:  `${el.w}%`,
              height: `${el.h}%`,
              zIndex: el.config.zIndex ?? 1,
              boxSizing: 'border-box',
            }}
          >
            <RenderElement
              el={el}
              locations={renderLocations as any}
              recentCalls={recentCalls}
              flashId={flashId}
            />
          </Box>
        ))}

        {/* Connection dot */}
        <Box sx={{ position: 'absolute', top: 8, right: 12, display: 'flex', alignItems: 'center', gap: 0.6, zIndex: 9999, opacity: 0.5 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: connected ? '#4caf50' : '#f44336', boxShadow: connected ? '0 0 8px #4caf50' : '0 0 8px #f44336' }} />
          <Typography sx={{ color: '#fff', fontSize: '0.7vw', letterSpacing: 1 }}>
            {connected ? pageTitle || slug : 'Reconnecting…'}
          </Typography>
        </Box>
      </Box>

      {/* Audio unlock overlay */}
      {!audioUnlocked && (
        <Box
          onClick={unlockAudio}
          sx={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            zIndex: 9999, display: 'flex', alignItems: 'center', gap: 1,
            px: 3, py: 1.25, borderRadius: 8, cursor: 'pointer',
            backgroundColor: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.25)',
            backdropFilter: 'blur(8px)',
            '&:hover': { backgroundColor: 'rgba(255,255,255,0.22)' },
          }}
        >
          <Typography sx={{ fontSize: '1.2rem' }}>🔇</Typography>
          <Typography sx={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem', letterSpacing: 1 }}>
            Tap to enable audio
          </Typography>
        </Box>
      )}
    </Box>
  );
}
