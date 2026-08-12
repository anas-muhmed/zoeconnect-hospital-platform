'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import PrintIcon from '@mui/icons-material/Print';
import GroupsIcon from '@mui/icons-material/Groups';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFullscreenToggle } from '@/lib/hooks/useFullscreenToggle';
import { resolveSocketBaseUrl } from '@/lib/utils/socket-url';

const API_BASE = '/api/v1';
// Standardized on the shared resolveSocketBaseUrl() helper (see that
// file's doc comment) for consistency with every other Token Queue
// realtime page -- this page's own prior `window.location.origin` fallback
// wasn't actually broken (it already ignored NEXT_PUBLIC_WS_URL entirely),
// but having every page resolve this the exact same way is one less thing
// to reason about later.
const WS_URL = resolveSocketBaseUrl();

// ── Types ─────────────────────────────────────────────────────────────────────

interface KioskAssignment {
  id: string;
  assignmentType: 'SERVICE_CENTER' | 'LOCATION';
  serviceCenterId?: string | null;
  serviceCenterName?: string | null;
  locationId?: string | null;
  locationCode?: string | null;
  locationLabel?: string | null;
  displayOrder: number;
}

interface KioskConfig {
  kioskSlug: string;
  kioskType: 'MULTIPLE' | 'SINGLE' | 'DISPLAY_ONLY';
  branchId: string;
  assignments: KioskAssignment[];
}

interface PrintConfig {
  hospitalName: string;
  tagline: string;
  footerText: string;
  paperSize: string;
  kioskBackgroundUrl: string;
  printBufferTime: number; // seconds; 0 = skip confirmation screen
  lineSpacing?: number; // vertical spacing multiplier, 1 = normal
  lineIntensity?: Record<string, number>; // per-line 0-100 "color intensity" (opacity)
  lineFontSize?: Record<string, number>; // per-line font size in px
  lineFontFamily?: Record<string, string>; // per-line CSS font-family
}

interface IssueResult {
  tokenNumber: number;
  fullToken: string;
  tokenPrefix: string;
}

// Payload shape from token:state (old public state system)
interface LocationStatePub {
  id: string;
  issuedCount: number;
  calledTokens: number[];
  /** HIS-sourced service center ID, null for LOCATION-mode locations. See buildStateMaps(). */
  serviceCenterId: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function assignmentLabel(a: KioskAssignment): string {
  return a.serviceCenterName ?? a.locationLabel ?? a.serviceCenterId ?? a.locationId ?? 'Service';
}

// Build waiting and issuedCount maps from the token:state broadcast payload.
//
// SERVICE_CENTER-type assignments never have a locationId of their own (see
// TokenKioskAssignment's docstring -- location_id is populated only for
// LOCATION-type assignments), so matching must use serviceCenterId against
// the state array's own serviceCenterId field, NOT against `id` (which is
// always the bridged TokenLocation's own UUID, never the raw HIS service
// center ID the assignment actually carries). Matching serviceCenterId
// against `id` can never succeed -- that was the whole bug: waiting stuck
// at 0 and the next-token preview stuck at 1 on every reload for any
// SERVICE_CENTER-mode kiosk.
function buildStateMaps(
  assignments: KioskAssignment[],
  stateArr: LocationStatePub[],
): { waiting: Record<string, number>; issuedCounts: Record<string, number> } {
  const waiting: Record<string, number> = {};
  const issuedCounts: Record<string, number> = {};
  for (const a of assignments) {
    const loc = stateArr.find((s) =>
      (a.locationId && s.id === a.locationId) ||
      (a.serviceCenterId && s.serviceCenterId === a.serviceCenterId),
    );
    if (loc) {
      waiting[a.id] = Math.max(0, loc.issuedCount - loc.calledTokens.length);
      issuedCounts[a.id] = loc.issuedCount;
    }
  }
  return { waiting, issuedCounts };
}

// ── Print Receipt ─────────────────────────────────────────────────────────────

function PrintReceipt({ result, label, config }: {
  result: IssueResult;
  label: string;
  config?: PrintConfig;
}) {
  const paperWidth = config?.paperSize || '80mm';
  const isSmall = paperWidth.includes('58');
  const spacing = config?.lineSpacing ?? 1;
  const sp = (basePx: number) => `${basePx * spacing}px`;
  const intensity = (key: string, fallback = 100) => (config?.lineIntensity?.[key] ?? fallback) / 100;
  const fontPx = (key: string, fallback: number) => `${config?.lineFontSize?.[key] ?? fallback}px`;
  const fontFam = (key: string) => {
    const f = config?.lineFontFamily?.[key];
    return f && f !== 'inherit' ? f : undefined;
  };
  return (
    <Box sx={{ display: 'none', '@media print': { display: 'block', width: paperWidth, fontFamily: 'monospace', p: 2, overflow: 'hidden' }, '& .MuiTypography-root': { overflowWrap: 'anywhere', wordBreak: 'break-word' } }}>
      {/* Margin:0 leaves Chrome's print engine no room to draw its own
          date/title/URL header & footer, so the receipt prints clean. */}
      <style type="text/css" media="print">{`@page { size: auto; margin: 0; } body { margin: 0; }`}</style>
      <Box sx={{ textAlign: 'center', mb: sp(16) }}>
        {/* Hospital name printed exactly as typed in Print Config -- case is never forced */}
        <Typography variant={isSmall ? 'h6' : 'h5'} fontWeight={900} sx={{ fontSize: fontPx('hospitalName', isSmall ? 19.2 : 24), fontFamily: fontFam('hospitalName'), opacity: intensity('hospitalName') }}>{config?.hospitalName || 'Token Receipt'}</Typography>
        {config?.tagline && <Typography variant="caption" display="block" sx={{ fontSize: fontPx('tagline', 13), fontFamily: fontFam('tagline'), opacity: intensity('tagline') }}>{config.tagline}</Typography>}
      </Box>
      <Box sx={{ textAlign: 'center', my: sp(24) }}>
        <Typography variant="caption" display="block" sx={{ textTransform: 'uppercase', letterSpacing: 2, mb: sp(8), fontSize: fontPx('tokenLabel', 11), fontFamily: fontFam('tokenLabel'), opacity: intensity('tokenLabel', 60) }}>Your Token Number</Typography>
        <Typography variant={isSmall ? 'h2' : 'h1'} fontWeight={900} letterSpacing={4} sx={{ fontSize: fontPx('tokenNumber', isSmall ? 48 : 72), fontFamily: fontFam('tokenNumber'), opacity: intensity('tokenNumber') }}>
          {result.fullToken}
        </Typography>
        <Typography variant="body2" sx={{ mt: sp(8), fontWeight: 600, fontSize: fontPx('locationLabel', 14), fontFamily: fontFam('locationLabel'), opacity: intensity('locationLabel') }}>{label}</Typography>
      </Box>
      <Box sx={{ borderTop: `1px dashed rgba(0,0,0, ${intensity('divider', 30)})`, pt: sp(16), textAlign: 'center' }}>
        <Typography variant="caption" display="block" sx={{ fontSize: fontPx('dateText', 12), fontFamily: fontFam('dateText'), opacity: intensity('dateText', 60) }}>{new Date().toLocaleString()}</Typography>
        {config?.footerText && <Typography variant="caption" display="block" sx={{ mt: sp(8), fontSize: fontPx('footerText', 12), fontFamily: fontFam('footerText'), opacity: intensity('footerText') }}>{config.footerText}</Typography>}
      </Box>
    </Box>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PermanentKioskPage() {
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<KioskAssignment | null>(null);
  const [issuedToken, setIssuedToken] = useState<IssueResult | null>(null);
  const [waiting, setWaiting] = useState<Record<string, number>>({});
  const [issuedCounts, setIssuedCounts] = useState<Record<string, number>>({});
  const [countdown, setCountdown] = useState(10);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const printBufferRef = useRef<number>(5); // always holds latest printBufferTime

  const { toggleFullScreen } = useFullscreenToggle();

  // 1. Kiosk config
  const { data: config, isLoading, isError } = useQuery<KioskConfig>({
    queryKey: ['kiosk-config', slug],
    queryFn: () => axios.get(`${API_BASE}/kiosk/${slug}`).then((r) => r.data),
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });

  // 2. Print config — poll every 30 s as fallback if WS event is missed
  const { data: printCfg } = useQuery<PrintConfig>({
    queryKey: ['public-print-config'],
    queryFn: () => axios.get(`${API_BASE}/token/print-config`).then((r) => r.data),
    staleTime: 0,
    refetchInterval: 30_000,
  });

  // Keep a ref so onSuccess always reads the latest value (avoids stale closure)
  useEffect(() => {
    printBufferRef.current = printCfg?.printBufferTime ?? 5;
  }, [printCfg?.printBufferTime]);

  // 3. Auto-select MULTIPLE
  useEffect(() => {
    if (config?.kioskType === 'MULTIPLE' && config.assignments.length > 0) {
      setSelected(config.assignments[0]);
    }
  }, [config]);

  // 4. Initial waiting load via REST (once on mount)
  //
  // Bug fix (2026-07-31, real incident -- kiosk showing "Your Token Will Be
  // 1" and "0 people waiting" while the counter panel was already well
  // ahead, on a kiosk that "was working fine before"): this used to call
  // `GET /token/public/state?branchId=...`, which resolves tenant from the
  // request's Host header (SubdomainTenantMiddleware) -- unavailable when
  // the app is reached via a plain host with no subdomain (localhost in
  // dev, or any cloud tenant without per-tenant subdomains configured).
  // With no tenant resolved, the response either matched none of this
  // kiosk's assignments (silently defaulting waiting/issuedCount to 0, i.e.
  // exactly this symptom) or briefly risked mixing in another tenant's
  // cached snapshot. `kiosk/:slug/public-state` resolves the kiosk's own
  // tenant from its slug instead (same tenant-independent lookup its config
  // endpoint already uses), so it's correct regardless of how the kiosk is
  // being accessed.
  useEffect(() => {
    if (!config?.assignments?.length) return;
    (async () => {
      try {
        const r = await axios.get(`${API_BASE}/kiosk/${slug}/public-state`);
        const arr: LocationStatePub[] = r.data ?? [];
        const maps = buildStateMaps(config.assignments, arr);
        setWaiting(maps.waiting);
        setIssuedCounts(maps.issuedCounts);
      } catch { /* ignore */ }
    })();
  }, [config, slug]);

  // Helper: fetch state from REST and update maps (shared by initial load + polling + reconnect)
  const syncStateFromRest = useCallback(async (cfg: KioskConfig) => {
    try {
      const r = await axios.get(`${API_BASE}/kiosk/${slug}/public-state`);
      const arr: LocationStatePub[] = r.data ?? [];
      const maps = buildStateMaps(cfg.assignments, arr);
      if (Object.keys(maps.waiting).length > 0) {
        setWaiting(maps.waiting);
        setIssuedCounts(maps.issuedCounts);
      }
    } catch { /* ignore */ }
  }, [slug]);

  // 5. WebSocket — real-time updates
  useEffect(() => {
    if (!config) return;

    const socket: Socket = io(`${WS_URL}/token`, {
      transports: ['websocket'],
      query: { branchId: config.branchId },
    });

    // Re-sync from REST on every (re)connect — catches any state missed while disconnected
    socket.on('connect', () => {
      syncStateFromRest(config);
    });

    // token:state is broadcast after EVERY counter action (call, reset, etc.)
    // Only update if we found matching assignments — prevents wiping state when
    // the broadcast comes from a different branch room with unrelated locations.
    socket.on('token:state', (stateArr: LocationStatePub[]) => {
      const maps = buildStateMaps(config.assignments, stateArr);
      if (Object.keys(maps.waiting).length > 0) {
        setWaiting(maps.waiting);
        setIssuedCounts(maps.issuedCounts);
      }
    });

    // token:issued fires when ANY kiosk issues for this location.
    // Use issuedCount from payload as authoritative for the issued number;
    // increment waiting by 1 (one more person in queue).
    socket.on('token:issued', (payload: { locationId: string; issuedCount: number }) => {
      const assignment = config.assignments.find(
        (a) => a.locationId === payload.locationId || a.serviceCenterId === payload.locationId,
      );
      if (assignment) {
        setIssuedCounts((prev) => ({
          ...prev,
          [assignment.id]: payload.issuedCount,
        }));
        setWaiting((prev) => ({
          ...prev,
          [assignment.id]: Math.max(0, (prev[assignment.id] ?? 0) + 1),
        }));
      }
    });

    // token:called — decrement waiting immediately when a counter calls a token.
    socket.on('token:called', (payload: { locationId: string; tokenNumber: number }) => {
      const assignment = config.assignments.find(
        (a) => a.locationId === payload.locationId || a.serviceCenterId === payload.locationId,
      );
      if (assignment) {
        setWaiting((prev) => ({
          ...prev,
          [assignment.id]: Math.max(0, (prev[assignment.id] ?? 0) - 1),
        }));
      }
    });

    // config:updated — hot-reload print config (buffer time, hospital name, etc.)
    socket.on('config:updated', (updated: PrintConfig) => {
      queryClient.setQueryData(['public-print-config'], updated);
    });

    return () => { socket.disconnect(); };
  }, [config, syncStateFromRest]);

  // Clean up countdown interval on unmount
  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  // 6a. Periodic polling — fallback for any missed WebSocket events.
  // Re-syncs authoritative state from REST every 5 s so stale counts
  // self-correct quickly even if a WS event was dropped.
  useEffect(() => {
    if (!config?.assignments?.length) return;
    const id = setInterval(() => syncStateFromRest(config), 5_000);
    return () => clearInterval(id);
  }, [config, syncStateFromRest]);

  // 6b. Kiosk drift guard (real incident, 2026-07-31): a physical kiosk tab
  // is meant to sit open unattended for days at a time. If the tab is ever
  // backgrounded/minimized (or the OS/browser throttles it), Chrome can
  // pause or slow `setInterval` timers and let the socket.io connection go
  // quietly stale without the page ever showing an error -- the 5s REST
  // poll above and the WS reconnect handler both stop firing, and the
  // kiosk is left frozen on whatever counts it last saw (confirmed: two
  // kiosks pointed at the exact same branch+location showed different
  // waiting counts -- one was simply a long-lived tab that had stopped
  // updating). `visibilitychange`/`online` fire reliably even on a
  // throttled tab the moment it's foregrounded or the network returns, so
  // use them to force an immediate resync as a second, independent safety
  // net on top of the 5s poll.
  useEffect(() => {
    if (!config) return;
    const resync = () => syncStateFromRest(config);
    const onVisibility = () => { if (document.visibilityState === 'visible') resync(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', resync);
    window.addEventListener('focus', resync);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', resync);
      window.removeEventListener('focus', resync);
    };
  }, [config, syncStateFromRest]);

  // 6c. Belt-and-suspenders: force a full page reload every 2 hours of
  // idle kiosk time (no receipt on screen, i.e. not mid-transaction). This
  // re-establishes a brand new socket connection and query cache from
  // scratch, so any drift the resync listeners above didn't catch
  // (stuck socket.io internal state, memory growth, etc.) can't
  // accumulate for more than one reload cycle on a kiosk left running for
  // days. Never fires while a receipt is being shown so it can't interrupt
  // someone mid-transaction.
  useEffect(() => {
    const id = setInterval(() => {
      if (!issuedToken) window.location.reload();
    }, 2 * 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [issuedToken]);

  // 6b. Issue mutation
  const issueMutation = useMutation<IssueResult>({
    mutationFn: () => {
      if (!config || !selected) throw new Error('No selection');
      const idx = config.assignments.findIndex((a) => a.id === selected.id);
      return axios.post(`${API_BASE}/token/queue/kiosk/${slug}/issue`, {
        assignmentIndex: Math.max(0, idx),
        tokenType: 'WALK_IN',
      }).then((r) => r.data);
    },
    onSuccess: (data) => {
      if (selected) {
        setIssuedCounts((prev) => ({ ...prev, [selected.id]: data.tokenNumber }));
      }

      const bufferSecs = printBufferRef.current;

      // Bug fix: PrintReceipt only renders (via @media print) when
      // issuedToken is set. This used to be skipped entirely whenever
      // printBufferTime was configured as 0 ("skip confirmation screen"),
      // so window.print() fired against a page where the receipt content
      // never mounted — producing a blank printout with nothing but
      // Chrome's own print header/footer. Always set it before printing;
      // the zero-buffer path below just clears it again shortly after.
      setIssuedToken(data);

      // Trigger print once the receipt has had a chance to mount/paint.
      setTimeout(() => window.print(), 150);

      if (bufferSecs === 0) {
        // No confirmation screen — clear the receipt shortly after the
        // print dialog has captured it, then reset for the next patient.
        setTimeout(() => {
          setIssuedToken(null);
          if (config?.kioskType === 'SINGLE') setSelected(null);
        }, 500);
        return;
      }

      // Show the confirmation screen with a live countdown
      setCountdown(bufferSecs);
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownRef.current!);
            countdownRef.current = null;
            setIssuedToken(null);
            if (config?.kioskType === 'SINGLE') setSelected(null);
            return bufferSecs; // reset for next use
          }
          return prev - 1;
        });
      }, 1000);
    },
  });

  // ── Theming ───────────────────────────────────────────────────────────────
  const hasBg = !!printCfg?.kioskBackgroundUrl;
  const textColor = hasBg ? 'white' : '#1e293b';
  const subtextColor = hasBg ? 'rgba(255,255,255,0.75)' : 'text.secondary';
  const cardBg = hasBg ? 'rgba(255,255,255,0.15)' : 'white';
  const cardBorder = hasBg ? 'rgba(255,255,255,0.2)' : 'divider';
  const headerBg = hasBg ? 'rgba(0,0,0,0.4)' : 'white';
  const hospitalName = printCfg?.hospitalName || 'Self-Service Token Kiosk';

  if (isLoading) return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress size={64} />
    </Box>
  );

  if (isError || !config) return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, p: 4, textAlign: 'center' }}>
      <ErrorOutlineIcon sx={{ fontSize: 72, color: 'error.main', opacity: 0.7 }} />
      <Typography variant="h5" fontWeight={700} color="error.main">Kiosk not available</Typography>
      <Typography color="text.secondary">Please contact staff for assistance.</Typography>
    </Box>
  );

  if (config.kioskType === 'DISPLAY_ONLY') return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Typography variant="h5" color="text.secondary">Display Only — no tokens issued here.</Typography>
    </Box>
  );

  // ── Shared shell ──────────────────────────────────────────────────────────
  const subtitle =
    config.kioskType === 'SINGLE' && !selected ? 'Select your service'
      : selected ? assignmentLabel(selected) : '';

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <>
      {issuedToken && selected && (
        <PrintReceipt result={issuedToken} label={assignmentLabel(selected)} config={printCfg} />
      )}
      <Box
        onDoubleClick={toggleFullScreen}
        sx={{
          minHeight: '100dvh', bgcolor: '#f8fafc',
          // Safe-area support (touch interaction audit, Phase 2): this Shell
          // renders edge-to-edge on physical kiosk tablets, which may have a
          // notch/rounded-corner/home-indicator; `env(safe-area-inset-*)`
          // resolves to 0 on hardware without one, so this is a no-op there.
          padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
          backgroundImage: hasBg ? `url(${printCfg!.kioskBackgroundUrl})` : 'none',
          // 'contain' (not 'cover') so the uploaded image always fits fully
          // inside the frame -- 'cover' was cropping/zooming into whatever
          // portion happened to match the container's aspect ratio, which is
          // why a background image could appear to run off-screen. 'contain'
          // may letterbox (visible bgcolor bars) when the image's aspect
          // ratio doesn't match the screen, but never crops or overflows.
          // 'no-repeat' is required alongside 'contain': without it the
          // browser tiles the image to fill the letterboxed space instead of
          // leaving it blank.
          backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
          display: 'flex', flexDirection: 'column',
          '@media print': { display: 'none' },
        }}>
        {hasBg && <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.5)', zIndex: 0 }} />}
        <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1 }}>
          {/* Header */}
          <Box sx={{
            p: { xs: 2, md: 3 }, bgcolor: headerBg, backdropFilter: 'blur(10px)',
            borderBottom: '1px solid', borderColor: hasBg ? 'rgba(255,255,255,0.1)' : 'divider',
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
                {hospitalName}
              </Typography>
              <Typography variant="caption" color={subtextColor}>{subtitle}</Typography>
            </Box>
          </Box>
          {children}

          {/* ── Powered by Camerin Innovate footer ─────────────────────────── */}
          <Box sx={{
            px: { xs: 2, md: 3 }, py: 1.75,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.25,
            borderTop: '1px solid',
            borderColor: hasBg ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            bgcolor: hasBg ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.70)',
            backdropFilter: 'blur(8px)',
          }}>
            <Image
              src="/camerin-logo-icon.png"
              alt="Camerin Innovate"
              width={22}
              height={22}
              style={{
                opacity: hasBg ? 0.65 : 0.7,
                filter: hasBg ? 'brightness(0) invert(1)' : 'none',
              }}
            />
            <Typography sx={{
              fontSize: '0.75rem',
              color: hasBg ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.38)',
              letterSpacing: '0.04em',
              fontWeight: 500,
            }}>
              Powered by Camerin Innovate
            </Typography>
          </Box>
        </Box>
      </Box>
    </>
  );

  // ── SINGLE: service selection grid ────────────────────────────────────────
  if (config.kioskType === 'SINGLE' && !selected) {
    return (
      <Shell>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: { xs: 3, md: 6 }, gap: 5 }}>
          <Typography variant="h3" fontWeight={900} color={textColor} textAlign="center"
            sx={{ fontSize: { xs: '1.8rem', md: '3rem' }, textShadow: hasBg ? '0 2px 10px rgba(0,0,0,0.5)' : 'none' }}>
            Where are you heading today?
          </Typography>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 900 }}>
            {config.assignments.map((a) => (
              <Box key={a.id} onClick={() => setSelected(a)} sx={{
                cursor: 'pointer', bgcolor: cardBg, backdropFilter: 'blur(10px)',
                border: '2px solid', borderColor: cardBorder, borderRadius: 4,
                p: 4, textAlign: 'center', width: { xs: '100%', sm: 220 },
                transition: 'all 0.2s',
                '&:hover': { borderColor: '#10B981', transform: 'translateY(-4px)', boxShadow: '0 16px 40px rgba(16,185,129,0.25)' },
              }}>
                <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
                  <MedicalServicesIcon sx={{ fontSize: 32, color: '#7c3aed' }} />
                </Box>
                <Typography fontWeight={700} fontSize="1.1rem" color={hasBg ? 'white' : '#1e293b'} mb={1}>
                  {assignmentLabel(a)}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'center' }}>
                  <GroupsIcon sx={{ fontSize: 16, color: subtextColor }} />
                  <Typography variant="caption" color={subtextColor} fontWeight={600}>
                    {waiting[a.id] ?? 0} waiting
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Shell>
    );
  }

  // ── MULTIPLE / SINGLE confirmed: issue screen ─────────────────────────────
  const label = selected ? assignmentLabel(selected) : '';
  const w = selected ? (waiting[selected.id] ?? 0) : 0;
  const issued = selected ? (issuedCounts[selected.id] ?? 0) : 0;
  const nextNum = issued + 1;

  return (
    <Shell>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: { xs: 3, md: 6 }, gap: 4 }}>
        {config.kioskType === 'SINGLE' && (
          <Box sx={{ alignSelf: 'flex-start' }}>
            <Button startIcon={<ArrowBackIcon />} onClick={() => { setSelected(null); setIssuedToken(null); }}
              sx={{ color: hasBg ? 'rgba(255,255,255,0.8)' : 'text.secondary', '&:hover': { bgcolor: hasBg ? 'rgba(255,255,255,0.1)' : undefined } }}>
              Back
            </Button>
          </Box>
        )}

        {issuedToken ? (
          <>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" fontWeight={800} color={textColor} mb={0.5}>Token Issued!</Typography>
              <Typography variant="h6" color={subtextColor}>{label}</Typography>
            </Box>
            <Box sx={{
              px: { xs: 6, md: 10 }, py: { xs: 5, md: 7 },
              bgcolor: cardBg, backdropFilter: 'blur(10px)',
              borderRadius: 4, border: '1px solid', borderColor: cardBorder, textAlign: 'center',
              boxShadow: hasBg ? '0 24px 64px rgba(0,0,0,0.3)' : '0 8px 40px rgba(0,0,0,0.08)',
            }}>
              <Typography variant="caption" display="block" fontWeight={700}
                sx={{ textTransform: 'uppercase', letterSpacing: 3, color: subtextColor, mb: 1 }}>
                Your Token Number
              </Typography>
              <Typography fontWeight={900} lineHeight={1} color={hasBg ? 'white' : '#0f172a'}
                sx={{ fontSize: { xs: '5rem', md: '8rem' } }}>
                {issuedToken.fullToken}
              </Typography>
              <Typography variant="body1" color={subtextColor} fontWeight={500} mt={2}>
                Please wait — your token has been issued.
              </Typography>
              {/* Countdown */}
              <Box sx={{ mt: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
                <Box sx={{
                  width: 42, height: 42, borderRadius: '50%',
                  border: '3px solid', borderColor: hasBg ? 'rgba(255,255,255,0.4)' : 'divider',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Typography fontWeight={900} fontSize="1.1rem" color={hasBg ? 'white' : '#0f172a'}>
                    {countdown}
                  </Typography>
                </Box>
                <Typography variant="body2" color={subtextColor}>
                  Screen resets in {countdown} second{countdown !== 1 ? 's' : ''}
                </Typography>
              </Box>
            </Box>
          </>
        ) : config.kioskType === 'MULTIPLE' ? (
          /* ── MULTIPLE: no selection step — center the card directly ── */
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h3" fontWeight={900} color={textColor}
                sx={{ fontSize: { xs: '2rem', md: '3rem' }, textShadow: hasBg ? '0 2px 10px rgba(0,0,0,0.5)' : 'none', mb: 1 }}>
                {label}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                <GroupsIcon sx={{ color: subtextColor, fontSize: 20 }} />
                <Typography color={subtextColor} fontWeight={500}>
                  {w} {w === 1 ? 'person is' : 'people are'} currently waiting.
                </Typography>
              </Box>
            </Box>

            <Box sx={{
              bgcolor: cardBg, backdropFilter: 'blur(10px)',
              border: '1px solid', borderColor: cardBorder, borderRadius: 4,
              px: { xs: 5, md: 10 }, py: { xs: 4, md: 6 },
              textAlign: 'center', minWidth: { xs: '100%', sm: 320 },
              boxShadow: hasBg ? '0 24px 64px rgba(0,0,0,0.3)' : '0 8px 40px rgba(0,0,0,0.08)',
            }}>
              <Typography variant="caption" display="block" fontWeight={700}
                sx={{ textTransform: 'uppercase', letterSpacing: 3, color: subtextColor, mb: 1 }}>
                Your Token Will Be
              </Typography>
              <Typography fontWeight={900} lineHeight={1} color={hasBg ? 'white' : '#0f172a'}
                sx={{ fontSize: { xs: '6rem', md: '9rem' }, mb: 4 }}>
                {nextNum}
              </Typography>
              <Button variant="contained" size="large" fullWidth
                onClick={() => issueMutation.mutate()} disabled={issueMutation.isPending}
                startIcon={issueMutation.isPending ? <CircularProgress size={20} color="inherit" /> : <PrintIcon />}
                sx={{
                  py: 2, fontSize: '1.15rem', fontWeight: 800, borderRadius: 4,
                  background: 'linear-gradient(135deg, #059669, #10B981)',
                  boxShadow: '0 8px 24px rgba(16,185,129,0.4)',
                  '&:hover': { background: 'linear-gradient(135deg, #047857, #059669)', boxShadow: '0 12px 32px rgba(16,185,129,0.5)', transform: 'translateY(-2px)' },
                  transition: 'all 0.2s',
                }}>
                {issueMutation.isPending ? 'Printing...' : 'PRINT TOKEN'}
              </Button>
              {issueMutation.isError && (
                <Typography color="error" variant="body2" fontWeight={600} mt={2}>
                  Failed to issue token. Please try again.
                </Typography>
              )}
            </Box>
          </Box>
        ) : (
          /* ── SINGLE: user picked a service — show context + card ── */
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'center', justifyContent: 'center', gap: { xs: 4, md: 8 }, width: '100%', maxWidth: 900 }}>
            {/* Left: selection context */}
            <Box sx={{ textAlign: { xs: 'center', md: 'left' } }}>
              <Typography variant="h5" fontWeight={700} color={subtextColor} mb={0.5}>You selected</Typography>
              <Typography variant="h3" fontWeight={900} color="#10B981"
                sx={{ fontSize: { xs: '2rem', md: '2.8rem' }, mb: 2, textShadow: hasBg ? '0 2px 8px rgba(0,0,0,0.4)' : 'none' }}>
                {label}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: { xs: 'center', md: 'flex-start' } }}>
                <GroupsIcon sx={{ color: subtextColor, fontSize: 20 }} />
                <Typography color={subtextColor} fontWeight={500}>
                  {w} {w === 1 ? 'person is' : 'people are'} currently waiting.
                </Typography>
              </Box>
            </Box>

            {/* Right: token card */}
            <Box sx={{
              bgcolor: cardBg, backdropFilter: 'blur(10px)',
              border: '1px solid', borderColor: cardBorder, borderRadius: 4,
              px: { xs: 5, md: 8 }, py: { xs: 4, md: 6 },
              textAlign: 'center', minWidth: { xs: '100%', sm: 300 },
              boxShadow: hasBg ? '0 24px 64px rgba(0,0,0,0.3)' : '0 8px 40px rgba(0,0,0,0.08)',
            }}>
              <Typography variant="caption" display="block" fontWeight={700}
                sx={{ textTransform: 'uppercase', letterSpacing: 3, color: subtextColor, mb: 1 }}>
                Your Token Will Be
              </Typography>
              <Typography fontWeight={900} lineHeight={1} color={hasBg ? 'white' : '#0f172a'}
                sx={{ fontSize: { xs: '6rem', md: '8rem' }, mb: 4 }}>
                {nextNum}
              </Typography>
              <Button variant="contained" size="large" fullWidth
                onClick={() => issueMutation.mutate()} disabled={issueMutation.isPending}
                startIcon={issueMutation.isPending ? <CircularProgress size={20} color="inherit" /> : <PrintIcon />}
                sx={{
                  py: 2, fontSize: '1.15rem', fontWeight: 800, borderRadius: 4,
                  background: 'linear-gradient(135deg, #059669, #10B981)',
                  boxShadow: '0 8px 24px rgba(16,185,129,0.4)',
                  '&:hover': { background: 'linear-gradient(135deg, #047857, #059669)', boxShadow: '0 12px 32px rgba(16,185,129,0.5)', transform: 'translateY(-2px)' },
                  transition: 'all 0.2s',
                }}>
                {issueMutation.isPending ? 'Printing...' : 'PRINT TOKEN'}
              </Button>
              {issueMutation.isError && (
                <Typography color="error" variant="body2" fontWeight={600} mt={2}>
                  Failed to issue token. Please try again..
                </Typography>
              )}
            </Box>
          </Box>
        )}

      </Box>
    </Shell>
  );
}
