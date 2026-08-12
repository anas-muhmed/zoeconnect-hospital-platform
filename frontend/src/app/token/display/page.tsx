'use client';

/**
 * Token Display Board — /token/display
 * Full-screen TV board. No login required.
 * Layout (canvas-based) loaded from backend via GET /token/public/display-config
 * and hot-reloaded via config:updated WebSocket event.
 *
 * Uses the enterprise canvas system: elements positioned absolutely in %,
 * font-size on canvas container = 1vw so em units scale correctly.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { io }          from 'socket.io-client';
import Box             from '@mui/material/Box';
import Typography      from '@mui/material/Typography';

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

// Shape expected by RenderElement — compatible superset
type RenderLocation = {
  code: string;
  label: string;
  counters: { id: string; counterNumber: number; currentToken: number | null }[];
};

type RenderRecent = {
  tokenNumber: number;
  locationLabel: string;
  locationCode: string;
  counterNumber: number;
};

// ── WebSocket hook ────────────────────────────────────────────────────────────

function usePublicSocket(
  onTokenCalled:   (payload: TokenCalledPayload) => void,
  onLayoutUpdate:  (layout: DisplayLayout) => void,
  branchId:        string | null,
  ready:           boolean,
  displayToken:    string | null,
) {
  const [locations, setLocations] = useState<PublicLocationState[]>([]);
  const [connected, setConnected] = useState(false);
  const onTokenCalledRef  = useRef(onTokenCalled);
  const onLayoutUpdateRef = useRef(onLayoutUpdate);
  useEffect(() => { onTokenCalledRef.current  = onTokenCalled;  }, [onTokenCalled]);
  useEffect(() => { onLayoutUpdateRef.current = onLayoutUpdate; }, [onLayoutUpdate]);

  useEffect(() => {
    // Wait until any location→branch resolution has finished so the socket
    // joins the correct `branch:<id>` room on the very first connect — the
    // gateway defaults to DEFAULT_BRANCH_ID when no branchId is supplied,
    // which previously left every non-default-branch display blank.
    if (!ready) return;

    const socket = io(`${WS_URL}/token`, {
      transports: ['websocket'],
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 8_000,
      // Cloud Token Queue Display fix (2026-07-31): passing displayToken
      // lets the gateway resolve this location's real tenant directly
      // (globally unique, self-identifying) instead of guessing from the
      // request hostname — which cloud tenants, having no per-tenant
      // subdomain, can't reliably provide. See TokenGateway.handleConnection().
      query: {
        ...(branchId ? { branchId } : {}),
        ...(displayToken ? { displayToken } : {}),
      },
    });
    socket.on('connect',        () => setConnected(true));
    socket.on('disconnect',     () => setConnected(false));
    socket.on('connect_error',  () => setConnected(false));
    socket.on('token:state',    (data: PublicLocationState[]) => setLocations(data));
    socket.on('token:called',   (p: TokenCalledPayload)       => onTokenCalledRef.current(p));
    socket.on('config:updated', (incoming: any) => {
      // Accept version-2 canvas layouts; ignore old theme objects
      if (incoming?.version === 2) {
        onLayoutUpdateRef.current(incoming as DisplayLayout);
      }
    });
    return () => { socket.disconnect(); };
  }, [branchId, ready, displayToken]);

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

// ── Main display page ─────────────────────────────────────────────────────────

export default function TokenDisplayPage() {
  const { flashId, flash }    = useFlash();
  const [recentCalls, setRecentCalls]     = useState<RenderRecent[]>([]);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [audioStatus,   setAudioStatus]   = useState('detecting…');
  const [layout, setLayout]               = useState<DisplayLayout>(DEFAULT_LAYOUT);
  const [canvasW, setCanvasW]             = useState(1920);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Track canvas width for em scaling (1vw when fullscreen, but we use ResizeObserver for safety)
  useEffect(() => {
    const obs = new ResizeObserver(([e]) => setCanvasW(e.contentRect.width));
    if (canvasRef.current) obs.observe(canvasRef.current);
    return () => obs.disconnect();
  }, []);

  // Load saved layout on mount
  useEffect(() => {
    fetch(`${API_BASE}/token/public/display-config`)
      .then((r) => r.json())
      .then((saved) => {
        if (saved?.version === 2) setLayout(saved as DisplayLayout);
      })
      .catch(() => {});
  }, []);

  // Handle layout hot-reload from WS
  const handleLayoutUpdate = useCallback((incoming: DisplayLayout) => {
    setLayout(incoming);
  }, []);

  // Audio setup
  useEffect(() => {
    initTokenAudio().then(() => setAudioStatus(getAudioStatus())).catch(() => {});
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
      const u = new SpeechSynthesisUtterance('Token queue display ready');
      u.volume = 1; u.rate = 0.9;
      window.speechSynthesis.speak(u);
    }
    resetAudioMode();
    preloadVoices();
    initTokenAudio().then(() => setAudioStatus(getAudioStatus())).catch(() => {});
    setAudioUnlocked(true);
  }, []);

  // URL params — `token` (preferred, globally unique, tenant-self-identifying —
  // see TokenLocation.displayToken's doc comment) and the legacy `location`
  // code param (kept for backward compatibility; self-hosted was never
  // affected by the cloud cross-tenant blank-screen bug this fixes, since
  // 'default' is genuinely its only tenant).
  const displayTokenParam = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('token');
  }, []);
  const locationFilter = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('location');
  }, []);

  // Resolve the filtered location's real branchId + code before opening the
  // socket. Without this, the socket would join the default branch's room
  // and a display for any other branch's location would never receive
  // state — and for a cloud tenant, the gateway would resolve the wrong
  // tenant entirely without displayToken passed through (see
  // usePublicSocket() below and TokenGateway.handleConnection()).
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branchResolved, setBranchResolved] = useState(false);
  const [resolvedCode, setResolvedCode] = useState<string | null>(locationFilter);

  useEffect(() => {
    if (!displayTokenParam && !locationFilter) { setBranchResolved(true); return; }
    let cancelled = false;
    const url = displayTokenParam
      ? `${API_BASE}/token/public/location/by-token/${encodeURIComponent(displayTokenParam)}`
      : `${API_BASE}/token/public/location/${encodeURIComponent(locationFilter!)}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((loc) => {
        if (cancelled) return;
        if (loc?.branchId) setBranchId(loc.branchId);
        if (loc?.code) setResolvedCode(loc.code);
        setBranchResolved(true);
      })
      .catch(() => { if (!cancelled) setBranchResolved(true); });
    return () => { cancelled = true; };
  }, [displayTokenParam, locationFilter]);

  const handleTokenCalled = useCallback((payload: TokenCalledPayload) => {
    if (resolvedCode && payload.locationCode !== resolvedCode) return;
    flash(payload.counterId);
    setRecentCalls((prev) => {
      const next: RenderRecent = {
        tokenNumber:   payload.tokenNumber,
        locationLabel: payload.locationLabel,
        locationCode:  payload.locationCode,
        counterNumber: payload.counterNumber,
      };
      return [next, ...prev].slice(0, 50); // keep plenty — recent-bar element controls maxItems
    });
    announceToken(payload.tokenNumber, payload.counterNumber).catch(() => {});
  }, [flash, resolvedCode]);

  const { locations, connected } = usePublicSocket(handleTokenCalled, handleLayoutUpdate, branchId, branchResolved, displayTokenParam);

  // Build render-compatible location list, filtered by URL param
  const renderLocations = useMemo<RenderLocation[]>(() => {
    return locations
      .filter((l) => l.isActive && (resolvedCode ? l.code === resolvedCode : true))
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }, [locations, resolvedCode]);

  // Sort elements by z-index for rendering
  const sortedElements = useMemo(
    () => [...layout.elements].filter(Boolean).sort((a, b) => (a.config?.zIndex ?? 1) - (b.config?.zIndex ?? 1)),
    [layout.elements],
  );

  const { toggleFullScreen } = useFullscreenToggle();

  return (
    <Box
      onDoubleClick={toggleFullScreen}
      sx={{
        width: '100vw',
        height: '100dvh',
        overflow: 'hidden',
        bgcolor: '#000',
        userSelect: 'none',
      }}
    >
      {/* ── Full-screen canvas ───────────────────────────────────────── */}
      {/* font-size: 1vw means 1em = 1% of viewport width, matching the editor */}
      <Box
        ref={canvasRef}
        sx={{
          position: 'relative',
          width: '100vw',
          height: '100dvh',
          backgroundColor: layout.backgroundColor,
          overflow: 'hidden',
          fontSize: '1vw', // critical: 1em = 1% canvas width everywhere
          transition: 'background-color 0.5s ease',
        }}
      >
        {/* Flash keyframe */}
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

        {/* Connection status dot (always visible in corner) */}
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 0.6,
            zIndex: 9999,
            opacity: 0.6,
          }}
        >
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: connected ? '#4caf50' : '#f44336', boxShadow: connected ? '0 0 8px #4caf50' : '0 0 8px #f44336' }} />
          <Typography sx={{ color: '#fff', fontSize: '0.7vw', letterSpacing: 1 }}>
            {connected ? 'Live' : 'Reconnecting…'}
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
            transition: 'background 0.2s',
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
