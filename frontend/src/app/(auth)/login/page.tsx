'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import {
  Box, TextField, Button, Typography, Alert,
  CircularProgress, InputAdornment, IconButton,
  DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import {
  Visibility, VisibilityOff, LockOutlined, PersonOutline, CheckCircleOutline,
} from '@mui/icons-material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/providers/AuthProvider';
import { authApi } from '@/lib/api/auth.api';
import { licenseApi } from '@/lib/api/license.api';
import Link from 'next/link';
import VendorRegisterDialog from '@/components/vendor/VendorRegisterDialog';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0';

/**
 * Backend error messages (e.g. AuthService's "Account locked until
 * <ISO>Z. Too many failed attempts.") embed a raw UTC ISO timestamp via
 * toISOString(), since the backend has no notion of the browser's
 * timezone. Displayed verbatim, that reads as if the lock time were in
 * whatever timezone the viewer assumes -- e.g. "09:00" looking like 9 AM
 * to someone at 14:16 local time, when it's actually 14:30 in IST
 * (UTC+5:30). Reformat any embedded ISO timestamp to the browser's local
 * time before showing it, without needing the backend to know the
 * caller's timezone at all.
 */
function localizeIsoTimestamps(message: string): string {
  return message.replace(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g,
    (iso) => {
      const d = new Date(iso);
      return isNaN(d.getTime())
        ? iso
        : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    },
  );
}

// ZoeConnect Identity Architecture Migration, Phase 7 (final frontend
// authentication phase): login now accepts either a username or an email
// address in a single field, internally named `identifier` to match the
// backend's `LoginDto.identifier` (Phase 3) / global case-insensitive
// lookup (Phase 4). The field is still labeled for humans as "Username or
// Email" -- see the TextField below.
const loginSchema = z.object({
  identifier: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});
type LoginForm = z.infer<typeof loginSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// ZoeConnect Hero — a layered kinetic-art sculpture, not a diagram.
// Every layer is CSS transform/opacity/filter only (no Canvas, no per-frame
// JS) so it stays GPU-accelerated and holds 60fps. Six layers, back to front:
//   1. GradientAurora  — slow-drifting mesh-gradient glow
//   2. WaveField        — almost-invisible drifting mesh lines
//   3. Ribbons          — soft blurred streams of "digital energy"
//   4. GlassShapes      — glassmorphic floating forms (the centerpiece)
//   5. LightStreaks     — occasional diagonal light sweeps
//   6. Particles        — sparse drifting light motes for depth
// ═══════════════════════════════════════════════════════════════════════════

function GradientAurora() {
  // Farthest-back layer: parallax depth is small (it's "furthest away").
  const blobs = [
    { color: '#1C6CFF', top: '8%',  left: '55%', size: 460, dur: 22, delay: 0,   op: 0.55, depth: 6  },
    { color: '#18D4C5', top: '48%', left: '78%', size: 380, dur: 26, delay: 3,   op: 0.4,  depth: 8  },
    { color: '#4A2F8F', top: '68%', left: '30%', size: 420, dur: 30, delay: 1.5, op: 0.4,  depth: 7  },
    { color: '#18D4C5', top: '18%', left: '18%', size: 300, dur: 24, delay: 4.5, op: 0.28, depth: 5  },
  ];
  return (
    <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {blobs.map((b, i) => (
        <Box
          key={i}
          sx={{
            position: 'absolute',
            top: b.top, left: b.left,
            width: b.size, height: b.size,
            marginLeft: `-${b.size / 2}px`, marginTop: `-${b.size / 2}px`,
          }}
          style={{ transform: `translate3d(calc(var(--mx, 0) * ${b.depth}px), calc(var(--my, 0) * ${b.depth}px), 0)` }}
        >
          <Box
            className="zc-anim"
            sx={{
              position: 'absolute', inset: 0,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${b.color} 0%, transparent 70%)`,
              opacity: b.op,
              filter: 'blur(50px)',
              mixBlendMode: 'screen',
              animation: `zcMeshDrift ${b.dur}s ease-in-out ${b.delay}s infinite`,
            }}
          />
        </Box>
      ))}
      {/* central breathing bloom — the sculpture's "heartlight", tracks the cursor a little more than the blobs */}
      <Box
        sx={{ position: 'absolute', top: '38%', left: '62%', width: 260, height: 260, ml: '-130px', mt: '-130px' }}
        style={{ transform: 'translate3d(calc(var(--mx, 0) * 14px), calc(var(--my, 0) * 14px), 0)' }}
      >
        <Box
          className="zc-anim"
          sx={{
            position: 'absolute', inset: 0,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, rgba(28,108,255,0.25) 45%, transparent 75%)',
            filter: 'blur(18px)',
            animation: 'zcBreathe 6s ease-in-out infinite',
          }}
        />
      </Box>
    </Box>
  );
}

function WaveField() {
  // Two staggered sine-wave strips, tiled and scrolled via transform only
  // (duplicate-and-translate-50% trick = perfectly seamless loop).
  const strip = (yOffset: number, amp: number) =>
    `M0 ${40 + yOffset} C 100 ${40 + yOffset - amp}, 200 ${40 + yOffset + amp}, 300 ${40 + yOffset} ` +
    `S 500 ${40 + yOffset - amp}, 600 ${40 + yOffset} S 800 ${40 + yOffset + amp}, 900 ${40 + yOffset} ` +
    `S 1100 ${40 + yOffset - amp}, 1200 ${40 + yOffset}`;
  return (
    <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: 0.05 }}>
      {[0, 1].map((row) => (
        <Box
          key={row}
          className="zc-anim"
          sx={{
            position: 'absolute',
            top: `${28 + row * 22}%`,
            left: 0,
            width: 2400,
            height: 80,
            animation: `zcWaveScroll ${row === 0 ? 46 : 60}s linear infinite ${row === 0 ? '' : 'reverse'}`,
          }}
        >
          <svg width="2400" height="80" viewBox="0 0 2400 80">
            {[0, 1200].map((xOffset) => (
              <path key={xOffset} d={strip(row * 6, 10)} transform={`translate(${xOffset},0)`} fill="none" stroke="white" strokeWidth="1" />
            ))}
          </svg>
        </Box>
      ))}
    </Box>
  );
}

function Ribbons() {
  // Outer wrapper holds the *static* base rotation; the inner layer carries
  // the animation (drift only) so the two transforms never fight for the
  // same CSS property on the same element.
  const ribbons = [
    { top: '6%',  left: '30%', w: 720, h: 150, rotate: -18, from: '#18D4C5', to: '#1C6CFF', dur: 20, delay: 0,   op: 0.16, depth: 16 },
    { top: '40%', left: '46%', w: 640, h: 170, rotate: 12,  from: '#1C6CFF', to: '#4A2F8F', dur: 24, delay: 2,   op: 0.14, depth: 20 },
    { top: '70%', left: '20%', w: 560, h: 130, rotate: -8,  from: '#4A2F8F', to: '#18D4C5', dur: 27, delay: 4,   op: 0.12, depth: 13 },
  ];
  return (
    <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {ribbons.map((r, i) => (
        <Box
          key={i}
          sx={{
            position: 'absolute',
            top: r.top, left: r.left,
            width: r.w, height: r.h,
            ml: `-${r.w / 2}px`, mt: `-${r.h / 2}px`,
          }}
          style={{ transform: `rotate(${r.rotate}deg) translate3d(calc(var(--mx, 0) * ${r.depth}px), calc(var(--my, 0) * ${r.depth}px), 0)` }}
        >
          <Box
            className="zc-anim"
            sx={{
              position: 'absolute', inset: 0,
              borderRadius: '50%',
              background: `linear-gradient(120deg, ${r.from} 0%, transparent 55%, ${r.to} 100%)`,
              opacity: r.op,
              filter: 'blur(38px)',
              animation: `zcRibbonDrift ${r.dur}s ease-in-out ${r.delay}s infinite`,
            }}
          />
        </Box>
      ))}
    </Box>
  );
}

function GlassShapes() {
  // The centerpiece: glassmorphic forms drifting independently at different
  // depths (parallax via duration/delay), each with its own soft highlight.
  // Outer wrapper is a plain positioner; inner layer carries the glass look
  // + the float/rotate/scale animation together, so they never conflict.
  const glass = {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.02))',
    border: '1px solid rgba(255,255,255,0.20)',
    boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.25), 0 20px 40px rgba(3,10,30,0.35)',
    backdropFilter: 'blur(3px)',
  };
  const shapes: { top: string; left: string; size: number; radius: string; dur: number; delay: number; depth: number }[] = [
    { top: '20%', left: '68%', size: 120, radius: '50%',  dur: 16, delay: 0,   depth: 34 },
    { top: '54%', left: '84%', size: 74,  radius: '38%',  dur: 13, delay: 1.2, depth: 24 },
    { top: '66%', left: '58%', size: 96,  radius: '48px', dur: 18, delay: 0.6, depth: 30 },
    { top: '36%', left: '46%', size: 54,  radius: '27px', dur: 11, delay: 2.4, depth: 20 },
    { top: '78%', left: '76%', size: 40,  radius: '50%',  dur: 9,  delay: 1.8, depth: 16 },
    { top: '12%', left: '48%', size: 34,  radius: '10px', dur: 14, delay: 3.1, depth: 14 },
  ];
  return (
    <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {shapes.map((s, i) => (
        <Box
          key={i}
          sx={{
            position: 'absolute',
            top: s.top, left: s.left,
            width: s.size, height: s.size,
            ml: `-${s.size / 2}px`, mt: `-${s.size / 2}px`,
          }}
          style={{
            transform: `translate3d(calc(var(--mx, 0) * ${s.depth}px), calc(var(--my, 0) * ${s.depth}px), 0) scale(calc(1 + var(--hover, 0) * 0.05))`,
            transition: 'transform 0.4s ease-out',
          }}
        >
          <Box
            className="zc-anim"
            sx={{
              position: 'absolute', inset: 0,
              borderRadius: s.radius,
              ...glass,
              animation: `zcGlassFloat ${s.dur}s ease-in-out ${s.delay}s infinite`,
              transformOrigin: 'center',
              overflow: 'hidden',
            }}
          >
            {/* soft moving highlight — a slice of light sweeping the glass */}
            <Box
              className="zc-anim"
              sx={{
                position: 'absolute', top: '-40%', left: '-140%', width: '90%', height: '220%',
                background: 'linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.35) 48%, transparent 100%)',
                animation: `zcGlassSheen ${s.dur * 1.4}s ease-in-out ${s.delay}s infinite`,
              }}
            />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function LightStreaks() {
  const streaks = [
    { top: '18%', dur: 11, delay: 1.5 },
    { top: '58%', dur: 13, delay: 6.5 },
  ];
  return (
    <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {streaks.map((s, i) => (
        <Box
          key={i}
          className="zc-motion-only"
          sx={{
            position: 'absolute',
            top: s.top, left: 0,
            width: 180, height: 2,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), rgba(24,212,197,0.6), transparent)',
            borderRadius: 2,
            transform: 'rotate(18deg)',
            animation: `zcStreakSweep ${s.dur}s ease-in-out ${s.delay}s infinite`,
            filter: 'blur(0.5px)',
          }}
        />
      ))}
    </Box>
  );
}

function Particles() {
  const dots = Array.from({ length: 9 }, (_, i) => ({
    left: 6 + ((i * 11) % 92),
    size: 2 + (i % 3),
    dur: 8 + (i % 5) * 1.6,
    delay: i * 0.7,
    op: 0.18 + (i % 3) * 0.08,
  }));
  return (
    <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {dots.map((d, i) => (
        <Box
          key={i}
          className="zc-motion-only"
          sx={{
            position: 'absolute',
            left: `${d.left}%`, bottom: '-5%',
            width: d.size, height: d.size,
            borderRadius: '50%',
            bgcolor: '#ffffff',
            opacity: d.op,
            animation: `zcParticleDrift ${d.dur}s ease-in ${d.delay}s infinite`,
          }}
        />
      ))}
    </Box>
  );
}

// A soft light that follows the cursor — reads --mx/--my set by the
// mousemove listener in LoginPage. Pure CSS; no work happens here per frame.
function CursorSpotlight() {
  return (
    <Box
      aria-hidden="true"
      className="zc-cursor-only"
      sx={{ position: 'absolute', inset: 0, mixBlendMode: 'soft-light' }}
      style={{
        background: 'radial-gradient(480px circle at calc(50% + var(--mx, 0) * 22%) calc(50% + var(--my, 0) * 22%), rgba(255,255,255,0.35), transparent 60%)',
      }}
    />
  );
}

// Composes all seven layers into one signature hero visual.
function ZoeHero() {
  return (
    <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <GradientAurora />
      <WaveField />
      <Ribbons />
      <GlassShapes />
      <LightStreaks />
      <Particles />
      <CursorSpotlight />
    </Box>
  );
}

// ── Forgot Password Dialog ────────────────────────────────────────────────────
// ZoeConnect Identity Architecture Migration, Phase 7 follow-up: accepts the
// same "username or email" identifier the login form does, for a
// consistent experience across Login and Forgot Password.
function ForgotPasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [identifier, setIdentifier] = useState('');
  const [reason, setReason]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [needsVendorRegistration, setNeedsVendorRegistration] = useState(false);

  const handleClose = () => {
    onClose();
    // Reset state slightly after close animation
    setTimeout(() => { setIdentifier(''); setReason(''); setSubmitted(false); setNeedsVendorRegistration(false); }, 300);
  };

  const handleSubmit = async () => {
    if (!identifier.trim()) return;
    setLoading(true);
    let isVendorRegNeeded = false;
    try {
      const res = await authApi.forgotPassword({ identifier: identifier.trim(), reason: reason.trim() || undefined });
      if (res && res.code === 'INSTANCE_NOT_REGISTERED') {
        setNeedsVendorRegistration(true);
        isVendorRegNeeded = true;
      }
    } catch {
      // Always show success — prevents username enumeration
    } finally {
      setLoading(false);
      if (!isVendorRegNeeded) {
        setSubmitted(true);
      }
    }
  };

  const handleVendorRegistrationSubmit = async (dto: any) => {
    await authApi.emergencyVendorRegister(dto);
    setNeedsVendorRegistration(false);
    await handleSubmit(); // Auto-retry forgot password
  };

  if (needsVendorRegistration) {
    return (
      <VendorRegisterDialog
        open={open}
        onClose={handleClose}
        onSubmit={handleVendorRegistrationSubmit}
      />
    );
  }

  return (
    <ResponsiveDialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 2.5, p: 0.5 } }}
    >
      <DialogTitle sx={{ fontWeight: 700, fontSize: '1.1rem', color: '#0D2744', pt: 2.5 }}>
        Forgot Password
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {submitted ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 2, gap: 1.5, textAlign: 'center' }}>
            <CheckCircleOutline sx={{ fontSize: 48, color: '#22C55E' }} />
            <Typography variant="body1" sx={{ fontWeight: 600, color: '#0D2744' }}>
              Request submitted
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748B', maxWidth: 280 }}>
              If the account exists, a password reset request has been submitted for administrator review.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>
            <Typography variant="body2" sx={{ color: '#64748B' }}>
              Enter your username or email. A password reset request will be sent to your administrator for review.
            </Typography>
            <TextField
              label="Username or Email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              fullWidth
              autoFocus
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <PersonOutline sx={{ fontSize: 17, color: '#94A3B8' }} />
                  </InputAdornment>
                ),
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 1.5,
                  '& fieldset': { borderColor: '#CBD5E1' },
                  '&:hover fieldset': { borderColor: '#18D4C5' },
                  '&.Mui-focused fieldset': { borderColor: '#1C6CFF', borderWidth: 1.5 },
                },
                '& .MuiInputLabel-root.Mui-focused': { color: '#1C6CFF' },
              }}
            />
            <TextField
              label="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              fullWidth
              size="small"
              multiline
              rows={2}
              placeholder="e.g. Forgot password, need access to submit reports"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 1.5,
                  '& fieldset': { borderColor: '#CBD5E1' },
                  '&:hover fieldset': { borderColor: '#18D4C5' },
                  '&.Mui-focused fieldset': { borderColor: '#1C6CFF', borderWidth: 1.5 },
                },
                '& .MuiInputLabel-root.Mui-focused': { color: '#1C6CFF' },
              }}
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2.5, pb: 2.5, gap: 1 }}>
        <Button
          onClick={handleClose}
          sx={{ color: '#64748B', borderRadius: 1.5, textTransform: 'none' }}
        >
          {submitted ? 'Close' : 'Cancel'}
        </Button>
        {!submitted && (
          <Button
            onClick={handleSubmit}
            disabled={loading || !identifier.trim()}
            variant="contained"
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : undefined}
            sx={{
              bgcolor: '#1C6CFF', borderRadius: 1.5, textTransform: 'none',
              fontWeight: 600, px: 3,
              '&:hover': { bgcolor: '#1450C4' },
              '&.Mui-disabled': { bgcolor: '#94A3B8' },
            }}
          >
            {loading ? 'Submitting…' : 'Submit Request'}
          </Button>
        )}
      </DialogActions>
    </ResponsiveDialog>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const [showPassword, setShowPassword]     = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [setupRequired, setSetupRequired]   = useState(false);
  const [vendorStatus, setVendorStatus]     = useState<{ registered: boolean; hospitalName?: string; vendorName?: string } | null>(null);
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [vendorRegSuccess, setVendorRegSuccess] = useState(false);
  const [ready, setReady] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const heroPanelRef = useRef<HTMLDivElement | null>(null);

  // Cursor-reactive hero: sets --mx/--my (-1..1, eased toward the pointer)
  // and --hover (0/1) as plain CSS custom properties on the panel node via
  // direct DOM mutation — never through React state — so the parallax/
  // spotlight/glow the hero layers read via var(--mx)/var(--my) costs zero
  // re-renders. The rAF loop only runs while it's still easing toward the
  // target and stops itself the moment it settles, so there's no
  // always-on animation loop competing for the main thread at rest.
  // Skips entirely under prefers-reduced-motion, per the hero's own layers.
  useEffect(() => {
    const el = heroPanelRef.current;
    if (!el) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let targetX = 0, targetY = 0, curX = 0, curY = 0;
    let rafId: number | null = null;
    const EASE = 0.09;
    const EPSILON = 0.001;

    const tick = () => {
      curX += (targetX - curX) * EASE;
      curY += (targetY - curY) * EASE;
      el.style.setProperty('--mx', curX.toFixed(4));
      el.style.setProperty('--my', curY.toFixed(4));
      if (Math.abs(targetX - curX) > EPSILON || Math.abs(targetY - curY) > EPSILON) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
      }
    };
    const ensureLoop = () => { if (rafId === null) rafId = requestAnimationFrame(tick); };

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      targetX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      targetY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      el.style.setProperty('--hover', '1');
      ensureLoop();
    };
    const onLeave = () => {
      targetX = 0; targetY = 0;
      el.style.setProperty('--hover', '0');
      ensureLoop();
    };

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  // Cloud Tenant Onboarding (see CLOUD_TENANT_ONBOARDING_DESIGN.md,
  // Section 5): in cloud mode, a tenant only exists because Vendor Portal
  // already provisioned it (CLOUD_TENANT_ONBOARDING_DESIGN.md's whole
  // premise) -- there is no "unregistered instance" state to show or
  // register from, unlike self-hosted where a freshly-installed ZoeConnect
  // instance is genuinely unpaired until an admin clicks "Register to
  // Vendor".
  //
  // Single-source-of-truth fix: this used to read
  // process.env.NEXT_PUBLIC_DEPLOYMENT_MODE, a value next.config.mjs bakes
  // in once from DEPLOYMENT_MODE at Next.js process start -- a second,
  // separately-maintained copy of the backend's DEPLOYMENT_MODE env var
  // that silently goes stale unless the frontend process is restarted
  // every time DEPLOYMENT_MODE changes (this caused a real cross-tenant
  // leak: a cloud tenant's login page kept showing the self-hosted-only
  // Vendor Connection card because the running frontend process still had
  // the old value baked in). Now derived at runtime from GET
  // /license/status ('deploymentMode' field, already computed server-side
  // by LicenseService.getDeploymentMode() from the one real env var) --
  // there is now exactly one place ops sets deployment mode (the
  // backend's DEPLOYMENT_MODE), and every consumer, backend or frontend,
  // reads it from there, live, with no restart required.
  const [deploymentMode, setDeploymentMode] = useState<'cloud' | 'self_hosted' | null>(null);
  const isCloudMode = deploymentMode === 'cloud';

  useEffect(() => {
    setReady(true);
    authApi.setupRequired().then(({ required }) => setSetupRequired(required)).catch(() => {});
    licenseApi.getStatus()
      .then((status) => {
        const mode = status.deploymentMode === 'cloud' ? 'cloud' : 'self_hosted';
        setDeploymentMode(mode);
        if (mode !== 'cloud') {
          authApi.getVendorRegistrationStatus().then(setVendorStatus).catch(() => {});
        }
      })
      .catch(() => {
        // Defensive: if the (public) license/status endpoint is ever
        // unreachable, fall back to self-hosted's original behavior
        // (fetch vendor status) rather than silently hiding the card for
        // every deployment mode.
        setDeploymentMode('self_hosted');
        authApi.getVendorRegistrationStatus().then(setVendorStatus).catch(() => {});
      });
  }, []);

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    try {
      await login(data.identifier, data.password);
    } catch (err: any) {
      const message = err?.response?.data?.message ?? 'Incorrect username or password.';
      setError(localizeIsoTimestamps(message));
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        width: '100%',
        display: 'flex',
        bgcolor: '#F0F4F9',
        overflow: 'hidden',
        // Entrance animation
        opacity: ready ? 1 : 0,
        transition: 'opacity 0.35s ease',
      }}
    >
      <style>{`
        @keyframes fadeSlideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes cardIn { from{opacity:0;transform:translateX(24px)} to{opacity:1;transform:translateX(0)} }

        /* ── ZoeConnect hero sculpture keyframes — transform/opacity only ── */
        @keyframes zcMeshDrift {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(4%, -5%) scale(1.1); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes zcBreathe {
          0%, 100% { opacity: .5; transform: scale(1); }
          50%      { opacity: .85; transform: scale(1.15); }
        }
        @keyframes zcWaveScroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-1200px); }
        }
        @keyframes zcRibbonDrift {
          0%   { transform: translate(0, 0); }
          50%  { transform: translate(2.5%, 3.5%); }
          100% { transform: translate(0, 0); }
        }
        @keyframes zcGlassFloat {
          0%   { transform: translate(0, 0) rotate(0deg) scale(1); }
          33%  { transform: translate(-4%, 5%) rotate(5deg) scale(1.04); }
          66%  { transform: translate(3%, -4%) rotate(-4deg) scale(0.97); }
          100% { transform: translate(0, 0) rotate(0deg) scale(1); }
        }
        @keyframes zcGlassSheen {
          0%, 40%   { transform: translateX(0) rotate(0deg); opacity: 0; }
          50%       { opacity: .8; }
          60%, 100% { transform: translateX(260%) rotate(0deg); opacity: 0; }
        }
        @keyframes zcStreakSweep {
          0%             { transform: translate(-30%, 0) rotate(18deg); opacity: 0; }
          6%             { opacity: .8; }
          14%, 100%      { transform: translate(160%, 0) rotate(18deg); opacity: 0; }
        }
        @keyframes zcParticleDrift {
          0%   { transform: translateY(0); opacity: 0; }
          12%  { opacity: 1; }
          85%  { opacity: .4; }
          100% { transform: translateY(-140px); opacity: 0; }
        }
        .zc-anim, .zc-motion-only { will-change: transform, opacity; }
        @media (prefers-reduced-motion: reduce) {
          .zc-anim { animation: none !important; }
          .zc-motion-only, .zc-cursor-only { display: none !important; }
        }
      `}</style>

      {/* ════════════════════════════════════════════════════════════════
          LEFT — Brand panel
      ════════════════════════════════════════════════════════════════ */}
      <Box
        ref={heroPanelRef}
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          width: '42%',
          minWidth: 380,
          position: 'relative',
          overflow: 'hidden',
          // ZoeConnect brand gradient — deep enterprise navy, teal/blue glows
          background: 'linear-gradient(170deg, #071A3D 0%, #0B1F5C 50%, #0B2A66 100%)',
        }}
      >
        {/* Signature hero visual — layered glass sculpture, see components above */}
        <ZoeHero />

        {/* ── Panel content ─────────────────────────────────────────── */}
        <Box
          sx={{
            position: 'relative', zIndex: 1,
            flex: 1, display: 'flex', flexDirection: 'column',
            justifyContent: 'center', alignItems: 'flex-start',
            px: 6, py: 8,
          }}
        >
          {/* ZoeConnect badge — top */}
          <Box
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: 1,
              px: 1.75, py: 0.6,
              mb: 6,
              borderRadius: 1,
              border: '1px solid rgba(255,255,255,0.16)',
              bgcolor: 'rgba(255,255,255,0.06)',
              backdropFilter: 'blur(4px)',
              animation: ready ? 'fadeSlideUp 0.6s ease both 0.1s' : 'none',
              opacity: ready ? undefined : 0,
            }}
          >
            <Image src="/logo-icon.svg" alt="" width={18} height={18} />
            <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.72)', fontWeight: 600, letterSpacing: '0.04em' }}>
              ZoeConnect · Digital Service Platform
            </Typography>
          </Box>

          {/* ZoeConnect logo icon — large */}
          <Box
            sx={{
              mb: 3.5,
              animation: ready ? 'fadeSlideUp 0.65s ease both 0.2s' : 'none',
              opacity: ready ? undefined : 0,
            }}
          >
            <Image
              src="/logo-icon.svg"
              alt="ZoeConnect"
              width={88}
              height={76}
              style={{ opacity: 0.96 }}
            />
          </Box>

          {/* App name */}
          <Box
            sx={{
              animation: ready ? 'fadeSlideUp 0.65s ease both 0.3s' : 'none',
              opacity: ready ? undefined : 0,
              mb: 1.5,
            }}
          >
            <Typography
              component="h1"
              sx={{
                fontSize: '2.1rem',
                fontWeight: 800,
                color: '#FFFFFF',
                lineHeight: 1.15,
                letterSpacing: '-0.025em',
              }}
            >
              ZoeConnect
            </Typography>
            <Typography
              sx={{
                fontSize: '0.95rem',
                color: 'rgba(255,255,255,0.55)',
                fontWeight: 400,
                letterSpacing: '0.01em',
                lineHeight: 1.4,
                mt: 0.5,
              }}
            >
              Digital Service Platform
            </Typography>
          </Box>

          {/* Horizontal rule */}
          <Box
            sx={{
              width: 48, height: 3, borderRadius: 2,
              background: 'linear-gradient(90deg, #18D4C5, #1C6CFF)',
              mt: 1.5, mb: 4,
              animation: ready ? 'fadeSlideUp 0.6s ease both 0.4s' : 'none',
              opacity: ready ? undefined : 0,
            }}
          />

          {/* Tagline */}
          <Typography
            sx={{
              fontSize: '0.85rem',
              color: 'rgba(255,255,255,0.42)',
              lineHeight: 1.75,
              maxWidth: 320,
              animation: ready ? 'fadeSlideUp 0.65s ease both 0.5s' : 'none',
              opacity: ready ? undefined : 0,
            }}
          >
            A modern digital platform built to simplify operations,
            connect systems, automate workflows, and enable
            scalable digital solutions.
          </Typography>
        </Box>

        {/* Panel footer */}
        <Box
          sx={{
            position: 'relative', zIndex: 1,
            px: 6, pb: 4,
            animation: ready ? 'fadeSlideUp 0.6s ease both 0.6s' : 'none',
            opacity: ready ? undefined : 0,
          }}
        >
          <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.03em' }}>
            Secure enterprise access. All sessions are encrypted and audited.
          </Typography>
        </Box>
      </Box>

      {/* ════════════════════════════════════════════════════════════════
          RIGHT — Login form panel
      ════════════════════════════════════════════════════════════════ */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: '#FFFFFF',
          position: 'relative',
        }}
      >
        {/* Subtle top border stripe */}
        <Box sx={{ height: 4, background: 'linear-gradient(90deg, #1C6CFF 0%, #18D4C5 50%, #1C6CFF 100%)' }} />

        {/* Form area — centered */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            px: { xs: 3, sm: 5, lg: 8 },
            py: 6,
          }}
        >
          <Box
            sx={{
              width: '100%',
              maxWidth: 400,
              animation: ready ? 'cardIn 0.55s ease both 0.2s' : 'none',
              opacity: ready ? undefined : 0,
            }}
          >
            {/* Mobile logo */}
            <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 2, mb: 5 }}>
              <Image src="/logo-icon.svg" alt="ZoeConnect" width={40} height={35} />
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: '1.125rem', color: '#0D2744', lineHeight: 1.15 }}>ZoeConnect</Typography>
                <Typography sx={{ fontSize: '0.7rem', color: '#64748B', letterSpacing: '0.01em' }}>Digital Service Platform</Typography>
              </Box>
            </Box>

            {/* Form heading */}
            <Box sx={{ mb: 4 }}>
              <Typography
                component="h2"
                sx={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: '#0D2744',
                  letterSpacing: '-0.02em',
                  mb: 0.5,
                }}
              >
                Sign In
              </Typography>
              <Typography sx={{ fontSize: '0.875rem', color: '#64748B' }}>
                Enter your credentials to access the platform
              </Typography>
            </Box>

            {/* Alerts */}
            {setupRequired && (
              <Alert
                severity="info"
                sx={{ mb: 3, borderRadius: 1.5, fontSize: '0.8125rem' }}
              >
                First-time setup required.{' '}
                <Link href="/setup" style={{ fontWeight: 600 }}>
                  Create super admin account →
                </Link>
              </Alert>
            )}

            {error && (
              <Alert
                severity="error"
                sx={{ mb: 3, borderRadius: 1.5, fontSize: '0.8125rem' }}
                onClose={() => setError(null)}
              >
                {error}
              </Alert>
            )}

            {/* Form */}
            <Box
              component="form"
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}
            >
              <TextField
                {...register('identifier')}
                label="Username or Email"
                fullWidth
                autoFocus
                autoComplete="username"
                error={!!errors.identifier}
                helperText={errors.identifier?.message}
                size="medium"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonOutline sx={{ fontSize: 19, color: '#94A3B8' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 1.5,
                    '& fieldset': { borderColor: '#CBD5E1' },
                    '&:hover fieldset': { borderColor: '#18D4C5' },
                    '&.Mui-focused fieldset': {
                      borderColor: '#1C6CFF',
                      borderWidth: 1.5,
                    },
                  },
                  '& .MuiInputLabel-root.Mui-focused': { color: '#1C6CFF' },
                }}
              />

              <TextField
                {...register('password')}
                label="Password"
                type={showPassword ? 'text' : 'password'}
                fullWidth
                autoComplete="current-password"
                error={!!errors.password}
                helperText={errors.password?.message}
                size="medium"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockOutlined sx={{ fontSize: 19, color: '#94A3B8' }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(s => !s)}
                        edge="end"
                        size="small"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        sx={{ color: '#94A3B8', '&:hover': { color: '#1C6CFF' } }}
                      >
                        {showPassword
                          ? <VisibilityOff fontSize="small" />
                          : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 1.5,
                    '& fieldset': { borderColor: '#CBD5E1' },
                    '&:hover fieldset': { borderColor: '#18D4C5' },
                    '&.Mui-focused fieldset': {
                      borderColor: '#1C6CFF',
                      borderWidth: 1.5,
                    },
                  },
                  '& .MuiInputLabel-root.Mui-focused': { color: '#1C6CFF' },
                }}
              />

              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                disabled={isSubmitting}
                startIcon={
                  isSubmitting
                    ? <CircularProgress size={17} color="inherit" />
                    : undefined
                }
                sx={{
                  mt: 0.5,
                  py: 1.45,
                  borderRadius: 1.5,
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  bgcolor: '#1C6CFF',
                  boxShadow: '0 2px 12px rgba(28,108,255,0.30)',
                  transition: 'background-color 0.18s ease, box-shadow 0.18s ease, transform 0.14s ease',
                  '&:hover:not(:disabled)': {
                    bgcolor: '#1450C4',
                    boxShadow: '0 4px 18px rgba(28,108,255,0.40)',
                    transform: 'translateY(-1px)',
                  },
                  '&:active:not(:disabled)': {
                    transform: 'translateY(0)',
                    boxShadow: '0 1px 6px rgba(28,108,255,0.25)',
                  },
                  '&.Mui-disabled': { bgcolor: '#94A3B8' },
                }}
              >
                {isSubmitting ? 'Signing in…' : 'Sign In'}
              </Button>

              {/* Forgot Password link */}
              <Box sx={{ textAlign: 'center', mt: 0.5 }}>
                <Button
                  id="forgot-password-link"
                  onClick={() => setForgotOpen(true)}
                  sx={{
                    fontSize: '0.8125rem',
                    color: '#18D4C5',
                    textTransform: 'none',
                    fontWeight: 500,
                    p: 0,
                    minWidth: 0,
                    '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
                  }}
                >
                  Forgot password?
                </Button>
              </Box>
            </Box>

            {/* Vendor Connection Card -- self-hosted only, see isCloudMode above */}
            {!isCloudMode && vendorStatus && (
              <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid #F1F5F9' }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Vendor Connection
                </Typography>
                
                {vendorRegSuccess ? (
                  <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <CheckCircleOutline sx={{ fontSize: 18, color: '#16A34A' }} />
                      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, color: '#166534' }}>
                        Registration successful
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: '0.75rem', color: '#15803D', mb: 1.5 }}>
                      You can now use:<br/>
                      • Forgot Password<br/>
                      • Remote Recovery<br/>
                      • Vendor Support
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => setVendorRegSuccess(false)}
                      sx={{ textTransform: 'none', fontWeight: 600, color: '#166534', bgcolor: '#BBF7D0', '&:hover': { bgcolor: '#86EFAC' } }}
                    >
                      Continue
                    </Button>
                  </Box>
                ) : vendorStatus.registered ? (
                  <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <CheckCircleOutline sx={{ fontSize: 16, color: '#10B981' }} />
                      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155' }}>
                        Registered
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                      <Typography sx={{ fontSize: '0.7rem', color: '#64748B' }}>Hospital:</Typography>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 500, color: '#334155' }}>{vendorStatus.hospitalName}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ fontSize: '0.7rem', color: '#64748B' }}>Vendor:</Typography>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 500, color: '#334155' }}>{vendorStatus.vendorName}</Typography>
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#92400E', mb: 0.5 }}>
                      ⚠ Not Registered
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#B45309', mb: 1.5, lineHeight: 1.4 }}>
                      Password recovery requires vendor registration.
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => setVendorDialogOpen(true)}
                      sx={{ textTransform: 'none', fontWeight: 600, color: '#92400E', bgcolor: '#FDE68A', '&:hover': { bgcolor: '#FCD34D' } }}
                    >
                      Register to Vendor
                    </Button>
                  </Box>
                )}
              </Box>
            )}

            {/* Powered by */}
            <Box
              sx={{
                mt: 5,
                pt: 3,
                borderTop: '1px solid #F1F5F9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.25,
              }}
            >
              <Image src="/camerin-logo-icon.png" alt="Camerin Innovate" width={28} height={28} style={{ opacity: 1 }} />
              <Typography sx={{ fontSize: '0.75rem', color: '#94A3B8', letterSpacing: '0.01em' }}>
                Powered by Camerin Innovate
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Footer */}
        <Box
          component="footer"
          sx={{
            px: { xs: 3, sm: 5 },
            py: 2.5,
            borderTop: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
            bgcolor: '#FAFBFC',
          }}
        >
          <Typography sx={{ fontSize: '0.72rem', color: '#94A3B8' }}>
            © {new Date().getFullYear()} ZoeConnect. All rights reserved.
          </Typography>
          <Typography sx={{ fontSize: '0.72rem', color: '#CBD5E1' }}>
            ZoeConnect v{APP_VERSION} · Authorised personnel only
          </Typography>
        </Box>

        {/* Forgot Password Dialog */}
        <ForgotPasswordDialog open={forgotOpen} onClose={() => setForgotOpen(false)} />
        
        {/* Vendor Registration Dialog (from health card) */}
        {vendorDialogOpen && (
          <VendorRegisterDialog
            open={vendorDialogOpen}
            onClose={() => setVendorDialogOpen(false)}
            onSubmit={async (dto) => {
              await authApi.emergencyVendorRegister(dto);
              setVendorDialogOpen(false);
              setVendorRegSuccess(true);
              const status = await authApi.getVendorRegistrationStatus();
              setVendorStatus(status);
            }}
          />
        )}
      </Box>
    </Box>
  );
}
