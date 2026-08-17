'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import CircularProgress from '@mui/material/CircularProgress';
import TvIcon from '@mui/icons-material/Tv';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import BusinessIcon from '@mui/icons-material/Business';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { alpha } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

import LoyaltyIcon              from '@mui/icons-material/Loyalty';
import ChildCareIcon            from '@mui/icons-material/ChildCare';
import ConfirmationNumberIcon   from '@mui/icons-material/ConfirmationNumber';
import BarChartIcon             from '@mui/icons-material/BarChart';
import NotificationsIcon        from '@mui/icons-material/Notifications';
import PeopleIcon               from '@mui/icons-material/People';
import SecurityIcon             from '@mui/icons-material/Security';
import SettingsIcon             from '@mui/icons-material/Settings';
import ArrowForwardIcon         from '@mui/icons-material/ArrowForward';
import PermMediaIcon            from '@mui/icons-material/PermMedia';
import WbSunnyIcon              from '@mui/icons-material/WbSunny';
import NightsStayIcon           from '@mui/icons-material/NightsStay';
import LightModeIcon            from '@mui/icons-material/LightMode';
import RateReviewIcon           from '@mui/icons-material/RateReview';
import ExpandMoreIcon           from '@mui/icons-material/ExpandMore';
import ReportProblemIcon        from '@mui/icons-material/ReportProblem';
import ShowChartIcon            from '@mui/icons-material/ShowChart';
import LocalHospitalIcon        from '@mui/icons-material/LocalHospital';
import PsychologyIcon           from '@mui/icons-material/Psychology';
import MedicationIcon           from '@mui/icons-material/Medication';

import { useAuthStore } from '@/lib/store/auth.store';
import { licenseApi } from '@/lib/api/license.api';

// ── Design tokens ─────────────────────────────────────────────────────────────
const HC_BLUE   = '#1565C0';
const HC_GREEN  = '#16A34A';
const PAGE_BG   = '#F6F8FB';

// ── Greeting ──────────────────────────────────────────────────────────────────
function getGreeting(): { text: string; icon: React.ReactNode } {
  const h = new Date().getHours();
  if (h < 12) return { text: 'Good morning',   icon: <WbSunnyIcon sx={{ fontSize: 16, color: '#F59E0B' }} /> };
  if (h < 17) return { text: 'Good afternoon', icon: <LightModeIcon sx={{ fontSize: 16, color: '#F59E0B' }} /> };
  return        { text: 'Good evening',        icon: <NightsStayIcon sx={{ fontSize: 16, color: '#818CF8' }} /> };
}

// ── Module definition ─────────────────────────────────────────────────────────
interface ModuleConfig {
  key: string;
  label: string;
  description: string;
  href: string;
  permission?: string;
  gradient: string;
  iconBg: string;
  icon: React.ReactNode;
  tag?: string;
  /** If set, the whole card is hidden unless this module code is in the tenant's licensed modules -- see `licenseApi.getStatus()`. Platform-core sections (Reports, Notifications, Users, RBAC, Settings) intentionally leave this unset since they're always available under Platform Core, not separately licensed. */
  requiresModule?: string;
  /** Same meaning as `NavLeaf.external` in `app/(platform)/layout.tsx` -- this module is its own statically-served original zoe-platform build, not a Next.js page, so it needs a real browser navigation rather than `router.push()`. */
  external?: boolean;
  actions?: {
    label: string;
    href: string;
    permission?: string;
    needsLocationPicker?: boolean;
    superAdminOnly?: boolean;
    opensInNewTab?: boolean;
    /** If set, this action is hidden unless the given module code is licensed */
    requiresModule?: string;
  }[];
}

const MODULES: ModuleConfig[] = [
  {
    key: 'loyalty',
    label: 'Loyalty Programme',
    description: 'Manage patient loyalty accounts, tier progression, points transactions and promotional campaigns.',
    href: '/loyalty',
    permission: 'LOYALTY:ACCOUNTS:READ',
    requiresModule: 'LOYALTY',
    gradient: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
    iconBg: 'linear-gradient(135deg, #2563EB, #3B82F6)',
    icon: <LoyaltyIcon sx={{ fontSize: 24, color: 'white' }} />,
    tag: 'Loyalty',
    actions: [
      { label: 'Enroll Patient',   href: '/loyalty/enroll',    permission: 'LOYALTY:ACCOUNTS:CREATE' },
      { label: 'Post Points',      href: '/loyalty/earn',      permission: 'LOYALTY:TRANSACTIONS:CREATE' },
      { label: 'View Campaigns',   href: '/loyalty/campaigns', permission: 'LOYALTY:CAMPAIGNS:READ' },
    ],
  },
  {
    key: 'eic',
    label: 'Early Intervention',
    description: 'Comprehensive therapy management for children with developmental challenges — assessments, sessions and progress reports.',
    href: '/eic',
    permission: 'EIC:PATIENTS:READ',
    requiresModule: 'EIC',
    gradient: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
    iconBg: 'linear-gradient(135deg, #7C3AED, #8B5CF6)',
    icon: <ChildCareIcon sx={{ fontSize: 24, color: 'white' }} />,
    tag: 'EIC',
    actions: [
      { label: 'New Admission',     href: '/eic/patients/search',  permission: 'EIC:PATIENTS:CREATE' },
      { label: "Today's Sessions",  href: '/eic/sessions',         permission: 'EIC:SESSIONS:READ' },
      { label: 'Review Queue',      href: '/eic/assessments',      permission: 'EIC:ASSESSMENTS:READ' },
    ],
  },
  {
    key: 'token',
    label: 'Token Queue',
    description: 'Real-time counter management and token calling system with live display and audio announcements.',
    href: '/token',
    permission: 'TOKEN:COUNTER:READ',
    requiresModule: 'QUEUE',
    gradient: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
    iconBg: 'linear-gradient(135deg, #059669, #10B981)',
    icon: <ConfirmationNumberIcon sx={{ fontSize: 24, color: 'white' }} />,
    tag: 'Token',
    actions: [
      { label: 'Open Counter',   href: '/token',               permission: 'TOKEN:COUNTER:OPERATE' },
      { label: 'Live Display',   href: '/token/display',       permission: 'TOKEN:COUNTER:READ', needsLocationPicker: true },
      { label: 'Custom Display', href: '/token/display-config', permission: 'TOKEN:LOCATION:MANAGE', superAdminOnly: true, requiresModule: 'QUEUE' },
      { label: 'Print Config',   href: '/token/print-config',   permission: 'TOKEN:LOCATION:MANAGE', superAdminOnly: true },
      { label: 'Display Pages',  href: '/token/display-pages',  permission: 'TOKEN:LOCATION:MANAGE', superAdminOnly: true, requiresModule: 'QUEUE' },
    ],
  },
  {
    key: 'attendance',
    label: 'Attendance Monitoring',
    description: 'Monitor punch processing, Oracle polling, queue health, reconciliation, errors and audit trails.',
    href: '/attendance/monitoring',
    permission: 'ATTENDANCE:MONITORING:READ',
    gradient: 'linear-gradient(135deg, #0D9488 0%, #0369A1 100%)',
    iconBg: 'linear-gradient(135deg, #0D9488, #0284C7)',
    icon: <MonitorHeartIcon sx={{ fontSize: 24, color: 'white' }} />,
    tag: 'Attendance',
    actions: [
      { label: 'Open Monitoring', href: '/attendance/monitoring', permission: 'ATTENDANCE:MONITORING:READ' },
    ],
  },


  // ── zoe-platform modules ──────────────────────────────────────────────
  // Each card opens the module's own original, unmodified zoe-platform
  // build (own UI, own internal navigation) mounted statically under
  // `public/<module>/` -- `external: true`, no `actions` sub-menu (the
  // module provides its own once it loads), matching the sidebar entries
  // in `app/(platform)/layout.tsx`.
  {
    key: 'mortuary',
    label: 'Mortuary Management',
    description: 'Body registration, cabin allocation, billing, housekeeping, and release workflow.',
    href: '/mortuary/',
    permission: 'MORTUARY:BODIES:READ',
    requiresModule: 'MORTUARY',
    external: true,
    gradient: 'linear-gradient(135deg, #334155 0%, #1E293B 100%)',
    iconBg: 'linear-gradient(135deg, #334155, #475569)',
    icon: <LocalHospitalIcon sx={{ fontSize: 24, color: 'white' }} />,
    tag: 'Mortuary',
  },
  {
    key: 'lifegenx',
    label: 'LifeGenX',
    description: 'AI-assisted consultation recording, transcription, symptom extraction, and differential diagnosis support.',
    href: '/lifegenx/',
    permission: 'LIFEGENX:CONSULTATIONS:VIEW',
    requiresModule: 'LIFEGENX',
    external: true,
    gradient: 'linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)',
    iconBg: 'linear-gradient(135deg, #7C3AED, #8B5CF6)',
    icon: <PsychologyIcon sx={{ fontSize: 24, color: 'white' }} />,
    tag: 'LifeGenX',
  },
  {
    key: 'drug-indenting',
    label: 'Drug Indenting',
    description: 'Multi-stage drug request approval — Doctor to HOD, Pharmacist, Pharmacy Head, DTC, and CEO review, with emergency fast-track.',
    href: '/drug-indenting/',
    permission: 'DRUG_INDENTING:REQUESTS:VIEW',
    requiresModule: 'DRUG_INDENTING',
    external: true,
    gradient: 'linear-gradient(135deg, #B45309 0%, #78350F 100%)',
    iconBg: 'linear-gradient(135deg, #B45309, #D97706)',
    icon: <MedicationIcon sx={{ fontSize: 24, color: 'white' }} />,
    tag: 'Drug Indenting',
  },
  {
    key: 'clinigrowth',
    label: 'CliniGrowth',
    description: 'Pediatric growth-chart lookup — height, weight, and head circumference by MRN, sourced live from HIS.',
    href: '/clinigrowth/',
    permission: 'PLATFORM:HIS:READ',
    // Reuses the existing PLATFORM license (already active for every
    // tenant) rather than a CliniGrowth-specific module code — see
    // clinigrowth.controller.ts's own doc comment.
    requiresModule: 'PLATFORM',
    external: true,
    gradient: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
    iconBg: 'linear-gradient(135deg, #0D9488, #14B8A6)',
    icon: <ShowChartIcon sx={{ fontSize: 24, color: 'white' }} />,
    tag: 'CliniGrowth',
  },
  {
    key: 'cms',
    label: 'Content Management System',
    description: 'Build media playlists, schedule digital signage content, and assign playlists to displays.',
    href: '/cms/playlists',
    permission: 'CMS:PLAYLIST:MANAGE',
    requiresModule: 'CMS',
    gradient: 'linear-gradient(135deg, #4338CA 0%, #3730A3 100%)',
    iconBg: 'linear-gradient(135deg, #4338CA, #6366F1)',
    icon: <PermMediaIcon sx={{ fontSize: 24, color: 'white' }} />,
    tag: 'CMS',
    actions: [
      { label: 'Media Library',     href: '/cms/media',       permission: 'CMS:MEDIA:MANAGE' },
      { label: 'Playlists',         href: '/cms/playlists',   permission: 'CMS:PLAYLIST:MANAGE' },
      { label: 'Displays',          href: '/cms/displays',    permission: 'CMS:DISPLAY:MANAGE' },
      { label: 'Device Monitoring', href: '/cms/monitoring',  permission: 'CMS:DISPLAY:MANAGE' },
    ],
  },
  {
    key: 'incident',
    label: 'Incident Management',
    description: 'Report and track incidents, manage severity/risk classification, and configure notification routing.',
    href: '/incident/dashboard',
    permission: 'INCIDENT:INCIDENTS:READ',
    requiresModule: 'INCIDENT',
    gradient: 'linear-gradient(135deg, #EA580C 0%, #C2410C 100%)',
    iconBg: 'linear-gradient(135deg, #EA580C, #F97316)',
    icon: <ReportProblemIcon sx={{ fontSize: 24, color: 'white' }} />,
    tag: 'Incident',
    actions: [
      { label: 'Dashboard',  href: '/incident/dashboard', permission: 'INCIDENT:DASHBOARD:READ' },
      { label: 'Incidents',  href: '/incident',           permission: 'INCIDENT:INCIDENTS:READ' },
      { label: 'Analytics',  href: '/incident/analytics', permission: 'INCIDENT:DASHBOARD:READ' },
      { label: 'Settings',   href: '/incident/settings',  permission: 'INCIDENT:SETTINGS:MANAGE' },
    ],
  },
  {
    key: 'feedback',
    label: 'Patient Feedback',
    description: 'Collect patient feedback via QR-code campaigns, manage complaints, and track satisfaction analytics and Google reviews.',
    href: '/feedback/forms',
    permission: 'FEEDBACK:FORM:VIEW',
    requiresModule: 'FEEDBACK',
    gradient: 'linear-gradient(135deg, #DB2777 0%, #BE185D 100%)',
    iconBg: 'linear-gradient(135deg, #DB2777, #EC4899)',
    icon: <RateReviewIcon sx={{ fontSize: 24, color: 'white' }} />,
    tag: 'Feedback',
    actions: [
      { label: 'Forms',       href: '/feedback/forms',      permission: 'FEEDBACK:FORM:VIEW' },
      { label: 'Campaigns',   href: '/feedback/campaigns',  permission: 'FEEDBACK:CAMPAIGN:VIEW' },
      { label: 'Complaints',  href: '/feedback/complaints', permission: 'FEEDBACK:COMPLAINT:VIEW' },
      { label: 'Analytics',   href: '/feedback/analytics',  permission: 'FEEDBACK:ANALYTICS:VIEW' },
    ],
  },
  {
    key: 'users',
    label: 'User Management',
    description: 'Create and manage staff accounts, assign roles, reset passwords and control account access.',
    href: '/users',
    permission: 'PLATFORM:USERS:READ',
    gradient: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
    iconBg: 'linear-gradient(135deg, #DC2626, #EF4444)',
    icon: <PeopleIcon sx={{ fontSize: 24, color: 'white' }} />,
    tag: 'Platform',
    actions: [
      { label: 'Add User',     href: '/users',  permission: 'PLATFORM:USERS:CREATE' },
      { label: 'Manage Roles', href: '/rbac',   permission: 'PLATFORM:ROLES:READ' },
    ],
  },
  {
    key: 'rbac',
    label: 'Roles & Permissions',
    description: 'Define roles, assign granular permissions per module, and audit who can access what across the platform.',
    href: '/rbac',
    permission: 'PLATFORM:ROLES:READ',
    gradient: 'linear-gradient(135deg, #475569 0%, #334155 100%)',
    iconBg: 'linear-gradient(135deg, #475569, #64748B)',
    icon: <SecurityIcon sx={{ fontSize: 24, color: 'white' }} />,
    tag: 'Platform',
    actions: [
      { label: 'View RBAC', href: '/rbac', permission: 'PLATFORM:ROLES:READ' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings & License',
    description: 'Manage license registration, module activation, card tiers and platform-wide configuration.',
    href: '/settings/license',
    permission: 'PLATFORM:SETTINGS:READ',
    gradient: 'linear-gradient(135deg, #374151 0%, #1F2937 100%)',
    iconBg: 'linear-gradient(135deg, #374151, #6B7280)',
    icon: <SettingsIcon sx={{ fontSize: 24, color: 'white' }} />,
    tag: 'Platform',
    actions: [
      { label: 'License',     href: '/settings/license',     permission: 'PLATFORM:SETTINGS:READ' },
      { label: 'Card Config', href: '/settings/card-config', permission: 'LOYALTY:CARD_CONFIG:READ' },
    ],
  },
];

// ── Location picker dialog (for Live Display) ─────────────────────────────────
interface TokenLocation { id: string; code: string; label: string; displayToken?: string | null; }

function LocationPickerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);

  const { data: locations = [], isLoading } = useQuery<TokenLocation[]>({
    queryKey: ['token-locations-picker'],
    queryFn: () => apiClient.get<TokenLocation[]>('/token/locations').then(r => r.data),
    enabled: open,
    staleTime: 30_000,
  });

  const handleOpen = () => {
    if (!selected) return;
    // Cloud Token Queue Display fix (2026-07-31): the display board's own
    // globally-unique displayToken is what actually identifies the tenant
    // for a cloud deployment (location `code` is only unique per-tenant,
    // and the board has no reliable per-tenant hostname to fall back on).
    // Falls back to `location=` (the old code-based param) only if a
    // location somehow has no displayToken yet (shouldn't happen post
    // migration, but keeps this from silently opening a broken link).
    const loc = locations.find((l) => l.code === selected);
    const url = loc?.displayToken
      ? `/token/display?token=${loc.displayToken}`
      : `/token/display?location=${selected}`;
    window.open(url, '_blank', 'noopener');
    onClose();
    setSelected(null);
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <TvIcon color="primary" />
        <Box>
          <Typography fontWeight={700}>Open Live Display</Typography>
          <Typography variant="caption" color="text.secondary">
            Select which location to show on the TV
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : locations.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            No active locations found. Create a location first from the Token Queue module.
          </Typography>
        ) : (
          <List disablePadding>
            {locations.map((loc) => (
              <ListItemButton
                key={loc.id}
                selected={selected === loc.code}
                onClick={() => setSelected(loc.code)}
                sx={{ borderRadius: 1.5, mb: 0.5, border: '1px solid', borderColor: selected === loc.code ? 'primary.main' : 'divider' }}
              >
                <ListItemText
                  primary={<Typography fontWeight={600} fontSize="0.9rem">{loc.label}</Typography>}
                  secondary={<Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{loc.code}</Typography>}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button
          variant="contained"
          disabled={!selected}
          onClick={handleOpen}
          startIcon={<TvIcon />}
        >
          Open Display
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ── Module tile ───────────────────────────────────────────────────────────────
function ModuleTile({
  mod,
  hasPermission,
  isSuperAdmin,
  licensedModules,
}: {
  mod: ModuleConfig;
  hasPermission: (p?: string) => boolean;
  isSuperAdmin: boolean;
  licensedModules: string[];
}) {
  const router = useRouter();
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const visibleActions = (mod.actions ?? []).filter(
    (a) =>
      hasPermission(a.permission) &&
      (!a.superAdminOnly || isSuperAdmin) &&
      (!a.requiresModule || licensedModules.includes(a.requiresModule)),
  );

  return (
    <Box
      sx={{
        bgcolor: 'white',
        border: '1px solid',
        borderColor: '#E2E8F0',
        borderRadius: 2,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'box-shadow 0.2s, transform 0.15s',
        boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
        '&:hover': {
          boxShadow: '0 4px 16px rgba(15,23,42,0.10)',
          transform: 'translateY(-1px)',
        },
      }}
    >
      {/* Gradient header strip */}
      <Box sx={{ height: 3, background: mod.gradient }} />

      <Box sx={{ p: 1.25, display: 'flex', flexDirection: 'column' }}>
        {/* Icon + tag */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.75 }}>
          <Box sx={{
            width: 32, height: 32, borderRadius: 1.5, flexShrink: 0,
            background: mod.iconBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.16)',
            '& svg': { fontSize: '18px !important' },
          }}>
            {mod.icon}
          </Box>
          {mod.tag && (
            <Chip
              label={mod.tag}
              size="small"
              sx={{
                fontSize: '0.58rem', fontWeight: 700, height: 18, flexShrink: 0,
                bgcolor: alpha(HC_BLUE, 0.07),
                color: HC_BLUE,
                border: `1px solid ${alpha(HC_BLUE, 0.15)}`,
              }}
            />
          )}
        </Box>

        {/* Title, allowed to wrap to 2 lines */}
        <Typography fontWeight={700} sx={{ fontSize: '0.85rem', color: '#0F172A', lineHeight: 1.3, mb: 0.25 }}>
          {mod.label}
        </Typography>

        {/* Description, clamped to 2 lines so card height stays consistent */}
        <Typography
          variant="body2" color="text.secondary"
          sx={{
            fontSize: '0.75rem', lineHeight: 1.4, mb: visibleActions.length > 0 ? 0.5 : 0.75,
            ...(detailsOpen ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' })
          }}
        >
          {mod.description}
        </Typography>

        {/* "More details" toggle -- quick-action buttons are hidden until expanded, keeps the default grid from feeling crowded */}
        {visibleActions.length > 0 && (
          <>
            <Box
              onClick={() => setDetailsOpen(v => !v)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.4, cursor: 'pointer',
                color: '#64748B', fontSize: '0.7rem', fontWeight: 600, mb: detailsOpen ? 0.75 : 0,
                '&:hover': { color: HC_BLUE },
              }}
            >
              {detailsOpen ? 'Hide details' : 'More details'}
              <ExpandMoreIcon sx={{ fontSize: 15, transition: 'transform 0.15s', transform: detailsOpen ? 'rotate(180deg)' : 'none' }} />
            </Box>
            {detailsOpen && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6, mb: 0.5 }}>
                {visibleActions.map(a => (
                  <Button
                    key={a.href}
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      if (a.needsLocationPicker) {
                        setLocationPickerOpen(true);
                      } else if (a.opensInNewTab) {
                        window.open(a.href, '_blank');
                      } else {
                        router.push(a.href);
                      }
                    }}
                    sx={{
                      fontSize: '0.68rem', py: 0.3, px: 1, minWidth: 0, lineHeight: 1.6,
                      borderColor: '#E2E8F0',
                      color: '#475569',
                      '&:hover': {
                        borderColor: HC_BLUE,
                        color: HC_BLUE,
                        bgcolor: alpha(HC_BLUE, 0.05),
                      },
                    }}
                  >
                    {a.label}
                  </Button>
                ))}
              </Box>
            )}
          </>
        )}

        <LocationPickerDialog
          open={locationPickerOpen}
          onClose={() => setLocationPickerOpen(false)}
        />

        {/* Open module link */}
        <Box
          onClick={() => (mod.external ? window.location.assign(mod.href) : router.push(mod.href))}
          sx={{
            mt: 0.5, pt: 0.75,
            borderTop: '1px solid #F1F5F9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer',
            color: HC_BLUE,
            fontSize: '0.7rem',
            fontWeight: 600,
            '&:hover .arrow': { transform: 'translateX(3px)' },
          }}
        >
          Open module
          <ArrowForwardIcon className="arrow" sx={{ fontSize: 12, transition: 'transform 0.15s' }} />
        </Box>
      </Box>
    </Box>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  useEffect(() => { setMounted(true); }, []);

  // Live clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleString('en-GB', {
          weekday: 'short', day: '2-digit', month: 'short',
          year: 'numeric', hour: '2-digit', minute: '2-digit',
        }),
      );
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);

  const { user, hasPermission, activeBranchId, userBranches } = useAuthStore() as any;

  // Shares the same 'license-status' query key every other consumer uses
  // (LicenseBanner, ModuleGate, the platform layout, settings/license/page.tsx)
  // -- this used to be its own separate 'license-status-dashboard' key, which
  // meant it had its own independent react-query cache entry. Real symptom
  // (2026-07-30): after a license request (e.g. Queue Management) was
  // approved, settings/license/page.tsx's own
  // qc.invalidateQueries({ queryKey: ['license-status'] }) correctly
  // refreshed the banner/settings page immediately, but the dashboard's
  // differently-keyed cache entry was untouched by that invalidation and
  // kept serving its own stale 5-minute-old module list -- so a newly
  // licensed module's card silently stayed hidden until that cache entry
  // happened to go stale on its own. Sharing the same key means the
  // dashboard benefits from the exact same invalidation as everyone else.
  const { data: licenseStatus } = useQuery({
    queryKey: ['license-status'],
    queryFn:  licenseApi.getStatus,
    staleTime: 5 * 60 * 1000,
  });
  const licensedModules = licenseStatus?.licensedModules ?? [];

  const { data: attendanceEnabledData } = useQuery<{ enabled: boolean }>({
    queryKey: ['attendance-enabled'],
    queryFn:  () => apiClient.get<{ enabled: boolean }>('/attendance/enabled').then(r => r.data),
    staleTime: 60 * 1000,
  });
  const attendanceEnabled = attendanceEnabledData?.enabled ?? false;

  const { text: greeting, icon: greetingIcon } = useMemo(
    () => mounted ? getGreeting() : { text: '', icon: null },
    [mounted],
  );

  const accessibleModules = useMemo(
    () =>
      mounted
        ? MODULES.filter((m) => {
            if (m.key === 'attendance' && !attendanceEnabled) return false;
            // Hide the whole card if this module isn't in the tenant's active license --
            // otherwise an unlicensed module (e.g. CMS) still shows up whenever a role
            // happens to grant its permission, which is misleading on a licensed platform.
            if (m.requiresModule && !licensedModules.includes(m.requiresModule)) return false;
            return hasPermission(m.permission);
          })
        : [],
    [hasPermission, mounted, attendanceEnabled, licensedModules],
  );

  const isSuperAdmin  = mounted ? (user?.roles?.some((r: any) => r.name === 'SUPER_ADMIN') ?? false) : false;
  const displayName   = mounted ? (user?.fullName || user?.username || 'User') : '';
  const userRoles     = mounted ? (user?.roles?.map((r: any) => r.name) ?? []) : [];
  const branchName    = mounted
    ? ((userBranches as any[])?.find((b: any) => b.id === activeBranchId)?.name ?? activeBranchId ?? '')
    : '';

  return (
    <Box sx={{ p: 3, bgcolor: PAGE_BG, minHeight: '100%' }}>

      {/* ── Platform Information Header ──────────────────────────────────── */}
      <Box
        sx={{
          mb: 3,
          bgcolor: 'white',
          border: '1px solid #E2E8F0',
          borderTop: `3px solid ${HC_BLUE}`,
          borderRadius: 2,
          px: { xs: 2.5, md: 3 },
          py: { xs: 2.5, md: 2 },
          display: { xs: 'flex', md: 'grid' },
          flexDirection: { xs: 'column', md: 'row' },
          gridTemplateColumns: { xs: 'none', md: '1fr auto 1fr' },
          alignItems: { xs: 'flex-start', md: 'center' },
          gap: { xs: 3, md: 4 },
          boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
          minHeight: 88,
        }}
      >
        {/* Left: Avatar + greeting + name + roles */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, width: '100%' }}>
          <Avatar
            sx={{
              width: { xs: 46, md: 40 }, height: { xs: 46, md: 40 }, fontSize: { xs: '1.1rem', md: 15 }, fontWeight: 800,
              bgcolor: HC_BLUE,
              boxShadow: `0 2px 8px ${alpha(HC_BLUE, 0.3)}`,
              flexShrink: 0,
            }}
          >
            {(displayName[0] ?? '?').toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.6, mb: 0.35 }}>
              {greetingIcon}
              <Typography sx={{ fontSize: { xs: '0.875rem', md: '0.75rem' }, color: '#64748B' }}>
                {greeting},
              </Typography>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {displayName}
              </Typography>
            </Box>
            {/* Capped width so a user with many roles wraps onto extra
                lines instead of stretching this column wider and pushing
                the centered "ZoeConnect" heading off-center. */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: { xs: '100%', md: 260 } }}>
              {userRoles.map((role: string) => (
                <Chip
                  key={role}
                  label={role.replace(/_/g, ' ')}
                  size="small"
                  sx={{
                    height: { xs: 20, md: 17 }, fontSize: { xs: '0.65rem', md: '0.58rem' }, fontWeight: 700,
                    bgcolor: alpha(HC_BLUE, 0.07),
                    color: HC_BLUE,
                    border: `1px solid ${alpha(HC_BLUE, 0.15)}`,
                  }}
                />
              ))}
            </Box>
          </Box>
        </Box>

        {/* Center: Hospital name — sized to its own content; the 1fr/auto/1fr
            grid tracks keep it centered regardless of left/right width.
            Shows the tenant's own hospital name (from the same license-status
            query already fetched above) + "Digital Service Platform" instead
            of the "ZoeConnect" / "Powered by ..." branding this banner used
            to show, per request -- this banner is meant to identify WHICH
            hospital's ZoeConnect instance this is, not repeat the platform's
            own brand back at the person already using it. */}
        <Box sx={{ textAlign: { xs: 'left', md: 'center' }, minWidth: 0, width: '100%' }}>
          <Typography
            sx={{
              fontSize: { xs: '1.25rem', md: '1.1rem' }, fontWeight: 800, color: HC_BLUE,
              letterSpacing: '0.04em', lineHeight: { xs: 1.2, md: 1 },
              wordBreak: 'break-word',
            }}
          >
            {licenseStatus?.hospitalName || 'ZoeConnect'}
          </Typography>
          <Typography sx={{ fontSize: { xs: '0.875rem', md: '0.7rem' }, color: '#475569', fontWeight: 500, mt: { xs: 0.5, md: 0.25 }, letterSpacing: '0.01em' }}>
            Digital Service Platform
          </Typography>
        </Box>

        {/* Right: branch + modules count + datetime */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: { xs: 'flex-start', md: 'flex-end' }, gap: { xs: 1.25, md: 0.6 }, minWidth: 0, width: '100%' }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: { xs: 1, md: 0.75 } }}>
            {branchName && (
              <Chip
                icon={<BusinessIcon sx={{ fontSize: { xs: '0.9rem !important', md: '0.7rem !important' } }} />}
                label={branchName}
                size="small"
                sx={{
                  height: { xs: 24, md: 19 }, fontSize: { xs: '0.75rem', md: '0.6rem' }, fontWeight: 600,
                  bgcolor: alpha(HC_GREEN, 0.08),
                  color: HC_GREEN,
                  border: `1px solid ${alpha(HC_GREEN, 0.2)}`,
                  '& .MuiChip-icon': { color: HC_GREEN },
                }}
              />
            )}
            <Chip
              label={`${accessibleModules.length} module${accessibleModules.length !== 1 ? 's' : ''}`}
              size="small"
              sx={{
                height: { xs: 24, md: 19 }, fontSize: { xs: '0.75rem', md: '0.6rem' }, fontWeight: 700,
                bgcolor: alpha(HC_BLUE, 0.07),
                color: HC_BLUE,
                border: `1px solid ${alpha(HC_BLUE, 0.15)}`,
              }}
            />
          </Box>
          {currentTime && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AccessTimeIcon sx={{ fontSize: { xs: 14, md: 12 }, color: '#94A3B8' }} />
              <Typography sx={{ fontSize: { xs: '0.875rem', md: '0.7rem' }, color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>
                {currentTime}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* ── Module grid ───────────────────────────────────────────────────── */}
      {accessibleModules.length > 0 ? (
        <>
          <Typography
            variant="overline"
            sx={{ color: '#64748B', mb: 2, display: 'block', fontSize: '0.7rem', letterSpacing: '0.08em', fontWeight: 600 }}
          >
            Your modules
          </Typography>
          <Grid container spacing={2}>
            {accessibleModules.map(mod => (
              <Grid item xs={12} sm={6} lg={3} key={mod.key}>
                <ModuleTile mod={mod} hasPermission={hasPermission} isSuperAdmin={isSuperAdmin} licensedModules={licensedModules} />
              </Grid>
            ))}
          </Grid>
        </>
      ) : (
        <Box sx={{
          textAlign: 'center', py: 8,
          bgcolor: 'white', borderRadius: 2.5,
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
        }}>
          <Box sx={{
            width: 56, height: 56, borderRadius: 2, mx: 'auto', mb: 2,
            background: `linear-gradient(135deg, ${HC_BLUE}, #7C3AED)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <SecurityIcon sx={{ fontSize: 26, color: 'white' }} />
          </Box>
          <Typography fontWeight={700} sx={{ mb: 1, color: '#0F172A' }}>No modules assigned yet</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360, mx: 'auto', mb: 3, fontSize: '0.85rem' }}>
            Your account does not have access to any modules yet. Please contact your system administrator to have roles assigned to your account.
          </Typography>
          <Button variant="contained" href="mailto:admin" size="small" sx={{ bgcolor: HC_BLUE }}>Contact Admin</Button>
        </Box>
      )}
    </Box>
  );
}
