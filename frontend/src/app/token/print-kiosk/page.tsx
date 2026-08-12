'use client';
import { Suspense } from 'react';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import PrintIcon from '@mui/icons-material/Print';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import GroupsIcon from '@mui/icons-material/Groups';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { apiClient } from '@/lib/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { alpha } from '@mui/material/styles';
import { io, Socket } from 'socket.io-client';
import { resolveSocketBaseUrl } from '@/lib/utils/socket-url';

const WS_URL = resolveSocketBaseUrl();

// ── Types ──────────────────────────────────────────────────────────────────────

interface CounterSlot {
  id: string;
  counterNumber: number;
  currentToken: number | null;
  isOccupied: boolean;
}

interface Location {
  id: string;
  code: string;
  label: string;
  isActive: boolean;
  counters: CounterSlot[];
  calledTokens: number[];
  issuedCount: number;
}

interface PrintConfig {
  hospitalName: string;
  tagline: string;
  footerText: string;
  paperSize: string;
  kioskBackgroundUrl: string;
  lineSpacing?: number; // vertical spacing multiplier, 1 = normal
  lineIntensity?: Record<string, number>; // per-line 0-100 "color intensity" (opacity)
  lineFontSize?: Record<string, number>; // per-line font size in px
  lineFontFamily?: Record<string, string>; // per-line CSS font-family
}

interface RecentLocation {
  locationId: string;
  locationLabel: string;
}

type KioskStep = 'select' | 'confirm';

// ── Recent location helpers ────────────────────────────────────────────────────

const RECENT_KEY = 'hdsp:kiosk:recent_locs';
const MAX_RECENT = 6;

function loadRecentLocs(): RecentLocation[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; }
}

function saveRecentLoc(loc: RecentLocation) {
  const existing = loadRecentLocs().filter((r) => r.locationId !== loc.locationId);
  localStorage.setItem(RECENT_KEY, JSON.stringify([loc, ...existing].slice(0, MAX_RECENT)));
}

// ── Helper ─────────────────────────────────────────────────────────────────────

function getWaitingCount(loc: Location): number {
  const calledSet = new Set(loc.calledTokens);
  let waiting = 0;
  for (let i = 1; i <= loc.issuedCount; i++) {
    if (!calledSet.has(i)) waiting++;
  }
  return waiting;
}

// ── Main component ─────────────────────────────────────────────────────────────

function TokenKioskPage() {
  const queryClient  = useQueryClient();
  const searchParams = useSearchParams();
  const branchId     = searchParams.get('branchId') ?? undefined;

  const [step,             setStep]            = useState<KioskStep>('select');
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [issuedToken,      setIssuedToken]      = useState<string | null>(null);
  const [recentLocs,       setRecentLocs]       = useState<RecentLocation[]>([]);

  // ── Fetch print config ────────────────────────────────────────────────────────
  const { data: config } = useQuery({
    queryKey: ['public-print-config'],
    queryFn: () => apiClient.get('/token/print-config').then((res) => res.data as PrintConfig),
  });

  // ── Fetch locations ───────────────────────────────────────────────────────────
  const { data: locations = [], isLoading: loadingLocs } = useQuery({
    queryKey: ['public-kiosk-locations', branchId],
    queryFn: () => {
      const params = branchId ? `?branchId=${branchId}` : '';
      return apiClient.get(`/token/public/state${params}`).then((res) => res.data as Location[]);
    },
    refetchInterval: 10_000,
  });

  // ── Socket.io real-time updates ───────────────────────────────────────────────
  useEffect(() => {
    const socket: Socket = io(`${WS_URL}/token`, {
      transports: ['websocket'],
      ...(branchId ? { query: { branchId } } : {}),
    });

    socket.on('token:state', (data: Location[]) =>
      queryClient.setQueryData(['public-kiosk-locations'], data));

    socket.on('token:issued', ({ locationId, issuedCount }: { locationId: string; issuedCount: number }) => {
      queryClient.setQueryData(['public-kiosk-locations'], (old: Location[] | undefined) =>
        old ? old.map((loc) => loc.id === locationId ? { ...loc, issuedCount } : loc) : old);
    });

    socket.on('token:called', (payload: { locationId: string; tokenNumber: number }) => {
      queryClient.setQueryData(['public-kiosk-locations'], (old: Location[] | undefined) =>
        old ? old.map((loc) =>
          loc.id === payload.locationId && !loc.calledTokens.includes(payload.tokenNumber)
            ? { ...loc, calledTokens: [...loc.calledTokens, payload.tokenNumber] }
            : loc,
        ) : old);
    });

    socket.on('config:updated', (newConfig: PrintConfig) =>
      queryClient.setQueryData(['public-print-config'], newConfig));

    return () => { socket.disconnect(); };
  }, [queryClient, branchId]);

  // Keep selectedLocation in sync with real-time updates
  useEffect(() => {
    if (selectedLocation) {
      const updated = locations.find((l) => l.id === selectedLocation.id);
      if (updated) setSelectedLocation(updated);
    }
  }, [locations, selectedLocation]);

  // Load recents from localStorage
  useEffect(() => { setRecentLocs(loadRecentLocs()); }, []);

  const activeLocations = locations.filter((l) => l.isActive);

  // ── Issue token ───────────────────────────────────────────────────────────────
  const issueMutation = useMutation({
    mutationFn: (locationId: string) =>
      apiClient
        .post(`/token/locations/${locationId}/issue`)
        .then((res) => res.data.fullToken as string),
    onSuccess: (fullToken) => {
      setIssuedToken(fullToken);
      if (selectedLocation) {
        saveRecentLoc({ locationId: selectedLocation.id, locationLabel: selectedLocation.label });
        setRecentLocs(loadRecentLocs());
      }
      setTimeout(() => {
        window.print();
        setIssuedToken(null);
        setStep('select');
        setSelectedLocation(null);
      }, 100);
    },
  });

  const handleSelectLocation = (loc: Location) => {
    setSelectedLocation(loc);
    setStep('confirm');
  };

  const handlePrint = () => {
    if (!selectedLocation) return;
    issueMutation.mutate(selectedLocation.id);
  };

  // ── Styling ───────────────────────────────────────────────────────────────────
  const printWidth  = config?.paperSize || '80mm';
  const isSmall     = printWidth.includes('58');
  const lineSpacing = config?.lineSpacing ?? 1;
  const sp = (basePx: number) => `${basePx * lineSpacing}px`;
  // See token/kiosk/[code]/page.tsx's PrintReceipt for the full explanation:
  // thermal print heads threshold/dither instead of rendering true grayscale,
  // so a "light" CSS opacity that reads fine on-screen can print as barely
  // visible or blank on paper. Floor TEXT opacity at print time; the divider
  // (a decorative rule, not text) keeps its configured value unchanged.
  const PRINT_MIN_TEXT_OPACITY = 0.85;
  const intensity   = (key: string, fallback = 100) => Math.max((config?.lineIntensity?.[key] ?? fallback) / 100, PRINT_MIN_TEXT_OPACITY);
  const dividerOpacity = (fallback = 30) => (config?.lineIntensity?.divider ?? fallback) / 100;
  const fontPx      = (key: string, fallback: number) => `${config?.lineFontSize?.[key] ?? fallback}px`;
  const fontFam     = (key: string) => {
    const f = config?.lineFontFamily?.[key];
    return f && f !== 'inherit' ? f : undefined;
  };
  const hasBg       = !!config?.kioskBackgroundUrl;
  const textColor   = hasBg ? 'white' : '#1e293b';
  const subtextColor = hasBg ? 'rgba(255,255,255,0.7)' : 'text.secondary';
  const nextToken   = selectedLocation ? selectedLocation.issuedCount + 1 : null;

  const cardSx = {
    p: { xs: 2.5, md: 3 },
    cursor: 'pointer',
    borderRadius: 4,
    border: '2px solid',
    borderColor: hasBg ? 'rgba(255,255,255,0.2)' : 'divider',
    bgcolor: hasBg ? 'rgba(255,255,255,0.85)' : 'white',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1.5,
    transition: 'all 0.2s',
    textAlign: 'center' as const,
    '&:hover': {
      borderColor: 'primary.main',
      transform: 'translateY(-4px)',
      boxShadow: '0 12px 30px rgba(0,0,0,0.15)',
    },
  };

  return (
    <>
      {/* ── On-screen UI ──────────────────────────────────────────────────────── */}
      <Box sx={{
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
            {step === 'confirm' && (
              <Button
                startIcon={<ArrowBackIcon />}
                onClick={() => { setStep('select'); setSelectedLocation(null); }}
                sx={{ fontWeight: 700, color: hasBg ? 'white' : 'primary.main' }}
              >
                Back
              </Button>
            )}
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
                {step === 'select' ? 'Select your service' : (selectedLocation?.label ?? '')}
              </Typography>
            </Box>
          </Box>

          {/* Content */}
          <Box sx={{
            flex: 1,
            p: { xs: 2, sm: 3, md: 6 },
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            '@media (orientation: landscape)': { flexDirection: 'row', justifyContent: 'space-evenly' },
          }}>

            {/* ── Location selection ──────────────────────────────────────────── */}
            {step === 'select' && (
              <Box sx={{ width: '100%', maxWidth: 1100 }}>
                <Typography
                  variant="h3" fontWeight={900} textAlign="center" mb={{ xs: 3, md: 5 }}
                  color={textColor}
                  sx={{ textShadow: hasBg ? '0 2px 10px rgba(0,0,0,0.5)' : 'none', fontSize: { xs: '2rem', md: '3rem' } }}
                >
                  Where are you heading today?
                </Typography>

                {/* Recently visited */}
                {recentLocs.length > 0 && (
                  <Box sx={{ mb: 4 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, justifyContent: 'center' }}>
                      <AccessTimeIcon sx={{ color: subtextColor, fontSize: '1rem' }} />
                      <Typography variant="subtitle1" fontWeight={700} color={subtextColor}>
                        Recently visited
                      </Typography>
                    </Box>
                    <Grid container spacing={2} justifyContent="center">
                      {recentLocs.map((r) => {
                        const loc = activeLocations.find((l) => l.id === r.locationId);
                        if (!loc) return null;
                        return (
                          <Grid item xs={12} sm={6} md={4} key={r.locationId}>
                            <Paper
                              elevation={hasBg ? 8 : 0}
                              onClick={() => handleSelectLocation(loc)}
                              sx={{ ...cardSx, borderColor: hasBg ? 'rgba(255,255,255,0.3)' : 'primary.main', borderWidth: 2 }}
                            >
                              <Box sx={{ bgcolor: (t) => alpha(t.palette.primary.main, 0.1), color: 'primary.main', p: 1.5, borderRadius: '50%' }}>
                                <MedicalServicesIcon />
                              </Box>
                              <Box>
                                <Typography variant="h6" fontWeight={800} color="#0f172a" lineHeight={1.2}>
                                  {loc.label}
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mt: 0.5, color: 'text.secondary' }}>
                                  <GroupsIcon fontSize="small" />
                                  <Typography variant="body2" fontWeight={600}>{getWaitingCount(loc)} waiting</Typography>
                                </Box>
                              </Box>
                            </Paper>
                          </Grid>
                        );
                      })}
                    </Grid>
                  </Box>
                )}

                {/* All active locations */}
                {loadingLocs ? (
                  <Box display="flex" justifyContent="center">
                    <CircularProgress sx={{ color: hasBg ? 'white' : 'primary.main' }} />
                  </Box>
                ) : (
                  <Grid container spacing={{ xs: 2, md: 3 }} justifyContent="center">
                    {activeLocations.map((loc) => (
                      <Grid item xs={12} sm={6} md={4} key={loc.id}>
                        <Paper elevation={hasBg ? 8 : 0} onClick={() => handleSelectLocation(loc)} sx={cardSx}>
                          <Box sx={{ bgcolor: (t) => alpha(t.palette.secondary.main, 0.1), color: 'secondary.main', p: 2, borderRadius: '50%' }}>
                            <MedicalServicesIcon fontSize="large" />
                          </Box>
                          <Box>
                            <Typography variant="h6" fontWeight={800} color="#0f172a">
                              {loc.label}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mt: 0.5, color: 'text.secondary' }}>
                              <GroupsIcon fontSize="small" />
                              <Typography variant="body2" fontWeight={600}>{getWaitingCount(loc)} waiting</Typography>
                            </Box>
                          </Box>
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </Box>
            )}

            {/* ── Confirm + print ─────────────────────────────────────────────── */}
            {step === 'confirm' && (
              <ConfirmScreen
                location={selectedLocation}
                nextToken={nextToken}
                isPending={issueMutation.isPending}
                onPrint={handlePrint}
                hasBg={hasBg}
              />
            )}

          </Box>
        </Box>
      </Box>

      {/* ── Printable receipt ─────────────────────────────────────────────────── */}
      <Box sx={{
        display: 'none',
        '@media print': {
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'flex-start', textAlign: 'center', padding: '0', margin: '0',
          width: printWidth, color: 'black', overflow: 'hidden',
        },
        '& .MuiTypography-root': { overflowWrap: 'anywhere', wordBreak: 'break-word' },
      }}>
        <style type="text/css" media="print">{`@page { size: auto; margin: 0; } body { margin: 0; padding: 10px; }`}</style>
        {config && (
          <Box sx={{ width: '100%', pt: 2, pb: 4, px: 1 }}>
            {/* Hospital name printed exactly as typed in Print Config -- case is never forced */}
            <Typography variant="h5" fontWeight={900} sx={{ mb: sp(8), fontSize: fontPx('hospitalName', isSmall ? 19.2 : 24), fontFamily: fontFam('hospitalName'), lineHeight: 1.2, opacity: intensity('hospitalName') }}>
              {config.hospitalName}
            </Typography>
            <Typography variant="subtitle2" sx={{ mb: sp(8), fontWeight: 600, fontStyle: 'italic', color: '#333', fontSize: fontPx('tagline', isSmall ? 12 : 14), fontFamily: fontFam('tagline'), opacity: intensity('tagline') }}>
              {config.tagline}
            </Typography>

            <Typography variant="subtitle1" sx={{ mb: sp(4), fontWeight: 800, fontSize: fontPx('locationLabel', isSmall ? 13.6 : 16), fontFamily: fontFam('locationLabel'), opacity: intensity('locationLabel') }}>
              {selectedLocation?.label}
            </Typography>

            <Box sx={{ border: '3px solid black', px: 2, py: 2, my: sp(16), borderRadius: 2, opacity: intensity('tokenNumber') }}>
              <Typography variant="h2" fontWeight={900} sx={{ fontSize: fontPx('tokenNumber', isSmall ? 48 : 72), fontFamily: fontFam('tokenNumber'), lineHeight: 1 }}>
                {issuedToken || nextToken}
              </Typography>
            </Box>

            <Box sx={{ borderTop: `1px dashed rgba(0,0,0, ${dividerOpacity()})`, pt: sp(16), mt: sp(8) }}>
              <Typography variant="body2" sx={{ fontWeight: 700, fontSize: fontPx('dateText', isSmall ? 11.2 : 13.6), fontFamily: fontFam('dateText'), opacity: intensity('dateText', 60) }}>
                Date: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
              </Typography>

              {config.footerText && (
                <Typography variant="caption" sx={{ mt: sp(24), display: 'block', mx: 'auto', textAlign: 'center', fontWeight: 600, fontSize: fontPx('footerText', isSmall ? 10.4 : 12.8), fontFamily: fontFam('footerText'), opacity: intensity('footerText') }}>
                  {config.footerText}
                </Typography>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </>
  );
}

// ── ConfirmScreen ──────────────────────────────────────────────────────────────

function ConfirmScreen({
  location,
  nextToken,
  isPending,
  onPrint,
  hasBg,
}: {
  location: Location | null;
  nextToken: number | null;
  isPending: boolean;
  onPrint: () => void;
  hasBg: boolean;
}) {
  const waiting = location ? getWaitingCount(location) : 0;

  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      width: '100%', maxWidth: 600,
      '@media (orientation: landscape)': { flexDirection: 'row', gap: 4, maxWidth: 900 },
    }}>
      <Box sx={{ flex: 1, textAlign: 'center', mb: { xs: 4 } }}>
        <Typography
          variant="h3" fontWeight={900}
          color={hasBg ? 'white' : '#1e293b'}
          sx={{ textShadow: hasBg ? '0 2px 10px rgba(0,0,0,0.5)' : 'none' }}
        >
          You selected
          <br />
          <span style={{ color: '#10B981' }}>{location?.label}</span>
        </Typography>
        <Typography variant="h6" color={hasBg ? 'rgba(255,255,255,0.8)' : 'text.secondary'} mt={2}>
          {location ? `${waiting} people are currently waiting.` : 'Loading…'}
        </Typography>
      </Box>

      <Paper elevation={hasBg ? 12 : 0} sx={{
        p: { xs: 4, md: 6 }, borderRadius: 6,
        border: '1px solid', borderColor: hasBg ? 'rgba(255,255,255,0.2)' : 'divider',
        bgcolor: hasBg ? 'rgba(255,255,255,0.95)' : 'white',
        backdropFilter: 'blur(10px)',
        textAlign: 'center', width: '100%', maxWidth: 450,
        boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
      }}>
        <Typography variant="h6" color="text.secondary" fontWeight={700} mb={2} textTransform="uppercase">
          Your token will be
        </Typography>

        <Typography variant="h1" fontWeight={900} sx={{ fontSize: { xs: '7rem', md: '9rem' }, color: '#0f172a', lineHeight: 1, mb: 6 }}>
          {nextToken !== null ? nextToken : <CircularProgress size={80} />}
        </Typography>

        <Button
          variant="contained"
          size="large"
          fullWidth
          disabled={isPending || nextToken === null || !location}
          onClick={onPrint}
          sx={{
            py: 3, fontSize: '1.75rem', fontWeight: 900, borderRadius: 4,
            background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
            boxShadow: '0 8px 24px rgba(37,99,235,0.4)',
            '&:hover': { background: 'linear-gradient(135deg, #1D4ED8, #1e3a8a)', transform: 'scale(1.02)' },
            transition: 'all 0.2s',
          }}
        >
          {isPending ? 'PRINTING...' : 'PRINT TOKEN'}
        </Button>
      </Paper>
    </Box>
  );
}

export default function TokenKioskPageWrapper() { return <Suspense fallback={null}><TokenKioskPage /></Suspense>; }
