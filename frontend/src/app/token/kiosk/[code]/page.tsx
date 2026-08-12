'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams }                   from 'next/navigation';
import Box            from '@mui/material/Box';
import Typography     from '@mui/material/Typography';
import Button         from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import PrintIcon      from '@mui/icons-material/Print';
import GroupsIcon     from '@mui/icons-material/Groups';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { apiClient }  from '@/lib/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { useFullscreenToggle } from '@/lib/hooks/useFullscreenToggle';
import { resolveSocketBaseUrl } from '@/lib/utils/socket-url';

const WS_URL = resolveSocketBaseUrl();

// ── Types ──────────────────────────────────────────────────────────────────────

interface CounterSlot {
  id: string;
  counterNumber: number;
  currentToken: number | null;
  isOccupied: boolean;
}

interface LocationData {
  id: string;
  code: string;
  label: string;
  isActive: boolean;
  branchId: string | null;
  counters: CounterSlot[];
  calledTokens: number[];
  issuedCount: number;
}

interface PrintConfig {
  hospitalName:      string;
  tagline:           string;
  footerText:        string;
  paperSize:         string;
  kioskBackgroundUrl: string;
  lineSpacing?:      number; // vertical spacing multiplier, 1 = normal
  lineIntensity?:    Record<string, number>; // per-line 0-100 "color intensity" (opacity)
  lineFontSize?:     Record<string, number>; // per-line font size in px
  lineFontFamily?:   Record<string, string>; // per-line CSS font-family
}

function getWaitingCount(loc: LocationData): number {
  const calledSet = new Set(loc.calledTokens);
  let waiting = 0;
  for (let i = 1; i <= loc.issuedCount; i++) {
    if (!calledSet.has(i)) waiting++;
  }
  return waiting;
}

// ── Print receipt ──────────────────────────────────────────────────────────────

function PrintReceipt({
  tokenNumber,
  location,
  config,
}: {
  tokenNumber: number;
  location:   LocationData;
  config?:    PrintConfig;
}) {
  const paperWidth = config?.paperSize || '80mm';
  const isSmall    = paperWidth.includes('58');
  const spacing    = config?.lineSpacing ?? 1;
  const sp = (basePx: number) => `${basePx * spacing}px`;
  // Thermal print heads don't render true grayscale -- they threshold/dither
  // each dot, so a CSS opacity that looks like a soft light-gray on a screen
  // (e.g. the 60% "Your Token Number"/date defaults, or even 100% on a thin
  // font) can come out on paper as barely-there or invisible. Floor TEXT
  // opacity at print time so the intensity slider can still de-emphasize a
  // line without making it unreadable on physical paper. The divider line is
  // decorative, not text, so it keeps its configured (possibly very light)
  // value unchanged.
  const PRINT_MIN_TEXT_OPACITY = 0.85;
  const intensity  = (key: string, fallback = 100) => Math.max((config?.lineIntensity?.[key] ?? fallback) / 100, PRINT_MIN_TEXT_OPACITY);
  const dividerOpacity = (fallback = 30) => (config?.lineIntensity?.divider ?? fallback) / 100;
  const fontPx     = (key: string, fallback: number) => `${config?.lineFontSize?.[key] ?? fallback}px`;
  const fontFam    = (key: string) => {
    const f = config?.lineFontFamily?.[key];
    return f && f !== 'inherit' ? f : undefined;
  };

  return (
    <Box
      className="print-only"
      sx={{
        display: 'none',
        '@media print': {
          display: 'block',
          width: paperWidth,
          fontFamily: 'monospace',
          p: 2,
          overflow: 'hidden',
        },
        '& .MuiTypography-root': { overflowWrap: 'anywhere', wordBreak: 'break-word' },
      }}
    >
      {/* Margin:0 leaves Chrome's print engine no room to draw its own
          date/title/URL header & footer, so the receipt prints clean. */}
      <style type="text/css" media="print">{`@page { size: auto; margin: 0; } body { margin: 0; }`}</style>
      <Box sx={{ textAlign: 'center', mb: sp(16) }}>
        {/* Hospital name printed exactly as typed in Print Config -- case is never forced */}
        <Typography variant={isSmall ? 'h6' : 'h5'} fontWeight={900} sx={{ fontSize: fontPx('hospitalName', isSmall ? 19.2 : 24), fontFamily: fontFam('hospitalName'), opacity: intensity('hospitalName') }}>
          {config?.hospitalName || 'Token Receipt'}
        </Typography>
        {config?.tagline && (
          <Typography variant="caption" display="block" sx={{ fontWeight: 600, fontSize: fontPx('tagline', 13), fontFamily: fontFam('tagline'), opacity: intensity('tagline') }}>
            {config.tagline}
          </Typography>
        )}
      </Box>

      <Box sx={{ textAlign: 'center', my: sp(24) }}>
        <Typography variant="caption" display="block" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, mb: sp(8), fontSize: fontPx('tokenLabel', 11), fontFamily: fontFam('tokenLabel'), opacity: intensity('tokenLabel', 60) }}>
          Your Token Number
        </Typography>
        <Typography variant={isSmall ? 'h2' : 'h1'} fontWeight={900} letterSpacing={4} sx={{ fontSize: fontPx('tokenNumber', isSmall ? 48 : 72), fontFamily: fontFam('tokenNumber'), opacity: intensity('tokenNumber') }}>
          {tokenNumber}
        </Typography>
        <Typography variant="body2" sx={{ mt: sp(8), fontWeight: 600, fontSize: fontPx('locationLabel', 14), fontFamily: fontFam('locationLabel'), opacity: intensity('locationLabel') }}>
          {location.label}
        </Typography>
      </Box>

      <Box sx={{ borderTop: `1px dashed rgba(0,0,0, ${dividerOpacity()})`, pt: sp(16), textAlign: 'center' }}>
        <Typography variant="caption" display="block" sx={{ fontWeight: 700, fontSize: fontPx('dateText', 12), fontFamily: fontFam('dateText'), opacity: intensity('dateText', 60) }}>
          {new Date().toLocaleString()}
        </Typography>
        {config?.footerText && (
          <Typography variant="caption" display="block" sx={{ mt: sp(8), fontWeight: 600, fontSize: fontPx('footerText', 12), fontFamily: fontFam('footerText'), opacity: intensity('footerText') }}>
            {config.footerText}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PerLocationKioskPage() {
  const { code }      = useParams<{ code: string }>();
  const queryClient   = useQueryClient();
  const [issuedToken, setIssuedToken] = useState<number | null>(null);
  const socketRef     = useRef<Socket | null>(null);

  const { toggleFullScreen } = useFullscreenToggle();

  // ── Fetch this location ───────────────────────────────────────────────────────
  const {
    data: location,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['public-location', code],
    queryFn:  () =>
      apiClient
        .get(`/token/public/location/${code}`)
        .then((res) => res.data as LocationData),
    retry: false,
    refetchInterval: 15_000,
  });

  // ── Fetch print config ────────────────────────────────────────────────────────
  const { data: config } = useQuery({
    queryKey: ['public-print-config'],
    queryFn:  () =>
      apiClient.get('/token/print-config').then((res) => res.data as PrintConfig),
  });

  // ── Socket.io real-time updates ───────────────────────────────────────────────
  useEffect(() => {
    if (!location) return;

    const branchId = location.branchId;
    const socket: Socket = io(`${WS_URL}/token`, {
      transports: ['websocket'],
      ...(branchId ? { query: { branchId } } : {}),
    });
    socketRef.current = socket;

    socket.on('token:state', (data: LocationData[]) => {
      const updated = data.find((l) => l.id === location.id);
      if (updated) {
        queryClient.setQueryData(['public-location', code], updated);
      }
    });

    socket.on('token:issued', ({ locationId, issuedCount }: { locationId: string; issuedCount: number }) => {
      if (locationId === location.id) {
        queryClient.setQueryData(['public-location', code], (old: LocationData | undefined) =>
          old ? { ...old, issuedCount } : old);
      }
    });

    socket.on('token:called', (payload: { locationId: string; tokenNumber: number }) => {
      if (payload.locationId === location.id) {
        queryClient.setQueryData(['public-location', code], (old: LocationData | undefined) =>
          old && !old.calledTokens.includes(payload.tokenNumber)
            ? { ...old, calledTokens: [...old.calledTokens, payload.tokenNumber] }
            : old,
        );
      }
    });

    socket.on('config:updated', (newConfig: PrintConfig) =>
      queryClient.setQueryData(['public-print-config'], newConfig));

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [location?.id, location?.branchId, code, queryClient]);

  // ── Issue token ───────────────────────────────────────────────────────────────
  const issueMutation = useMutation({
    mutationFn: () =>
      apiClient
        .post(`/token/locations/${location!.id}/issue`)
        .then((res) => res.data.tokenNumber as number),
    onSuccess: (tokenNum) => {
      setIssuedToken(tokenNum);
      setTimeout(() => {
        window.print();
        setIssuedToken(null);
      }, 100);
    },
  });

  // ── Styling ───────────────────────────────────────────────────────────────────
  const hasBg       = !!config?.kioskBackgroundUrl;
  const textColor   = hasBg ? 'white' : '#1e293b';
  const subtextColor = hasBg ? 'rgba(255,255,255,0.75)' : 'text.secondary';
  const nextToken   = location ? location.issuedCount + 1 : null;
  const waiting     = location ? getWaitingCount(location) : 0;

  // ── Loading / error ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={64} />
      </Box>
    );
  }

  if (isError || !location) {
    return (
      <Box sx={{
        minHeight: '100dvh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 2, p: 4, textAlign: 'center',
      }}>
        <ErrorOutlineIcon sx={{ fontSize: 72, color: 'error.main', opacity: 0.7 }} />
        <Typography variant="h5" fontWeight={700} color="error.main">
          Location not found
        </Typography>
        <Typography color="text.secondary" maxWidth={400}>
          No active service location with code <strong>{code}</strong> exists.
          Please contact staff to get the correct kiosk link.
        </Typography>
      </Box>
    );
  }

  return (
    <>
      {/* ── Print receipt (hidden on screen) ──────────────────────────────────── */}
      {issuedToken !== null && (
        <PrintReceipt tokenNumber={issuedToken} location={location} config={config} />
      )}

      {/* ── On-screen UI ──────────────────────────────────────────────────────── */}
      <Box 
        onDoubleClick={toggleFullScreen}
        sx={{
        minHeight: '100dvh',
        bgcolor: '#f8fafc',
        // Safe-area support (touch interaction audit, Phase 2): see
        // frontend/src/app/kiosk/[slug]/page.tsx for the full rationale --
        // same edge-to-edge kiosk Shell pattern.
        padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
        backgroundImage: hasBg ? `url(${config!.kioskBackgroundUrl})` : 'none',
        // 'contain' + 'no-repeat' so the uploaded image always fits fully
        // inside the frame instead of being cropped/zoomed by 'cover'.
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        display: 'flex',
        flexDirection: 'column',
        '@media print': { display: 'none' },
      }}>
        {hasBg && (
          <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.5)', zIndex: 0 }} />
        )}

        <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1 }}>

          {/* Header */}
          <Box sx={{
            p: { xs: 2, md: 3 },
            bgcolor: hasBg ? 'rgba(0,0,0,0.4)' : 'white',
            backdropFilter: 'blur(10px)',
            borderBottom: '1px solid',
            borderColor: hasBg ? 'rgba(255,255,255,0.1)' : 'divider',
            display: 'flex', alignItems: 'center', gap: 2,
          }}>
            <Box sx={{
              width: { xs: 40, md: 48 }, height: { xs: 40, md: 48 }, borderRadius: 2,
              background: 'linear-gradient(135deg, #059669, #10B981)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', boxShadow: '0 4px 12px rgba(16,185,129,0.3)', flexShrink: 0,
            }}>
              <PrintIcon fontSize="small" sx={{ fontSize: { md: '1.5rem' } }} />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={800} color={hasBg ? 'white' : '#0f172a'} lineHeight={1.2} fontSize={{ xs: '1.1rem', md: '1.25rem' }}>
                {config?.hospitalName || 'Self-Service Token Kiosk'}
              </Typography>
              <Typography variant="caption" color={subtextColor}>
                {location.label}
              </Typography>
            </Box>
          </Box>

          {/* Main content */}
          <Box sx={{
            flex: 1,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            p: { xs: 3, md: 6 },
            gap: 4,
          }}>

            {/* Service name */}
            <Box sx={{ textAlign: 'center' }}>
              <Typography
                variant="h3" fontWeight={900} color={textColor}
                sx={{
                  textShadow: hasBg ? '0 2px 10px rgba(0,0,0,0.5)' : 'none',
                  fontSize: { xs: '2rem', md: '3rem' },
                  mb: 1,
                }}
              >
                {location.label}
              </Typography>
              <Typography variant="h6" color={subtextColor} fontWeight={500}>
                {config?.tagline || 'Take a token and wait for your turn'}
              </Typography>
            </Box>

            {/* Stats */}
            <Box sx={{
              display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center',
            }}>
              <Box sx={{
                px: 4, py: 2.5,
                bgcolor: hasBg ? 'rgba(255,255,255,0.15)' : 'white',
                backdropFilter: 'blur(10px)',
                borderRadius: 3,
                border: '1px solid',
                borderColor: hasBg ? 'rgba(255,255,255,0.2)' : 'divider',
                textAlign: 'center',
                minWidth: 140,
              }}>
                <AccessTimeIcon sx={{ fontSize: 28, color: hasBg ? 'rgba(255,255,255,0.8)' : 'warning.main', mb: 0.5 }} />
                <Typography variant="h4" fontWeight={900} color={hasBg ? 'white' : '#0f172a'}>
                  {waiting}
                </Typography>
                <Typography variant="caption" color={subtextColor} fontWeight={600} textTransform="uppercase" letterSpacing={1}>
                  Waiting
                </Typography>
              </Box>

              <Box sx={{
                px: 4, py: 2.5,
                bgcolor: hasBg ? 'rgba(255,255,255,0.15)' : 'white',
                backdropFilter: 'blur(10px)',
                borderRadius: 3,
                border: '1px solid',
                borderColor: hasBg ? 'rgba(255,255,255,0.2)' : 'divider',
                textAlign: 'center',
                minWidth: 140,
              }}>
                <GroupsIcon sx={{ fontSize: 28, color: hasBg ? 'rgba(255,255,255,0.8)' : 'primary.main', mb: 0.5 }} />
                <Typography variant="h4" fontWeight={900} color={hasBg ? 'white' : '#0f172a'}>
                  {nextToken}
                </Typography>
                <Typography variant="caption" color={subtextColor} fontWeight={600} textTransform="uppercase" letterSpacing={1}>
                  Your Token
                </Typography>
              </Box>
            </Box>

            {/* Print button */}
            <Button
              variant="contained"
              size="large"
              onClick={() => issueMutation.mutate()}
              disabled={issueMutation.isPending}
              startIcon={issueMutation.isPending ? <CircularProgress size={20} color="inherit" /> : <PrintIcon />}
              sx={{
                py: 2.5, px: 8,
                fontSize: { xs: '1.25rem', md: '1.5rem' },
                fontWeight: 800,
                borderRadius: 4,
                background: 'linear-gradient(135deg, #059669, #10B981)',
                boxShadow: '0 8px 24px rgba(16,185,129,0.4)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #047857, #059669)',
                  boxShadow: '0 12px 32px rgba(16,185,129,0.5)',
                  transform: 'translateY(-2px)',
                },
                transition: 'all 0.2s',
              }}
            >
              {issueMutation.isPending ? 'Printing…' : 'PRINT TOKEN'}
            </Button>

            {issueMutation.isError && (
              <Typography color="error" variant="body2" fontWeight={600}>
                Failed to issue token. Please try again.
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
    </>
  );
}
