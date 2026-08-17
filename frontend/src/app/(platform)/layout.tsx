'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Collapse from '@mui/material/Collapse';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import { useQuery } from '@tanstack/react-query';
import { licenseApi } from '@/lib/api/license.api';

import DashboardIcon           from '@mui/icons-material/Dashboard';
import PeopleIcon              from '@mui/icons-material/People';
import SecurityIcon            from '@mui/icons-material/Security';
import LoyaltyIcon             from '@mui/icons-material/Loyalty';
import CampaignIcon            from '@mui/icons-material/Campaign';
import NotificationsIcon       from '@mui/icons-material/Notifications';
import SettingsIcon            from '@mui/icons-material/Settings';
import BarChartIcon            from '@mui/icons-material/BarChart';
import TuneIcon                from '@mui/icons-material/Tune';
import LogoutIcon              from '@mui/icons-material/Logout';
import KeyIcon                 from '@mui/icons-material/Key';
import PeopleAltIcon           from '@mui/icons-material/PeopleAlt';
import ExpandLessIcon          from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon          from '@mui/icons-material/ExpandMore';
import ChildCareIcon           from '@mui/icons-material/ChildCare';
import AssignmentIcon          from '@mui/icons-material/Assignment';
import EventNoteIcon           from '@mui/icons-material/EventNote';
import SummarizeIcon           from '@mui/icons-material/Summarize';
import SchoolIcon              from '@mui/icons-material/School';
import ConfirmationNumberIcon  from '@mui/icons-material/ConfirmationNumber';
import ChevronLeftIcon         from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon        from '@mui/icons-material/ChevronRight';
import QrCode2Icon             from '@mui/icons-material/QrCode2';
import DevicesIcon             from '@mui/icons-material/Devices';
import MonitorHeartIcon        from '@mui/icons-material/MonitorHeart';
import AccountBalanceIcon      from '@mui/icons-material/AccountBalance';
import MenuOpenIcon            from '@mui/icons-material/MenuOpen';
import MenuIcon                from '@mui/icons-material/Menu';
import ArticleIcon             from '@mui/icons-material/Article';
import PsychologyIcon          from '@mui/icons-material/Psychology';
import ChatIcon                from '@mui/icons-material/Chat';
import MedicationIcon          from '@mui/icons-material/Medication';
import BlockIcon               from '@mui/icons-material/Block';
import PieChartIcon            from '@mui/icons-material/PieChart';
import UploadFileIcon          from '@mui/icons-material/UploadFile';
import CollectionsBookmarkIcon from '@mui/icons-material/CollectionsBookmark';
import PermMediaIcon           from '@mui/icons-material/PermMedia';
import PlaylistPlayIcon        from '@mui/icons-material/PlaylistPlay';
import TvIcon                  from '@mui/icons-material/Tv';
import GroupWorkIcon           from '@mui/icons-material/GroupWork';
import WarningAmberIcon        from '@mui/icons-material/WarningAmber';
import RateReviewIcon          from '@mui/icons-material/RateReview';
import FaceIcon                from '@mui/icons-material/Face';
import PersonAddAlt1Icon       from '@mui/icons-material/PersonAddAlt1';
import ReportProblemIcon       from '@mui/icons-material/ReportProblem';
import TranslateIcon           from '@mui/icons-material/Translate';
import BackupIcon              from '@mui/icons-material/Backup';
import RestoreIcon             from '@mui/icons-material/SettingsBackupRestore';
import ScheduleIcon            from '@mui/icons-material/Schedule';
import HealthAndSafetyIcon     from '@mui/icons-material/HealthAndSafety';
import WorkspacePremiumIcon    from '@mui/icons-material/WorkspacePremium';
import ShowChartIcon           from '@mui/icons-material/ShowChart';
import KingBedIcon             from '@mui/icons-material/KingBed';
import ReceiptLongIcon         from '@mui/icons-material/ReceiptLong';
import CleaningServicesIcon    from '@mui/icons-material/CleaningServices';
import LocalHospitalIcon       from '@mui/icons-material/LocalHospital';

import Image from 'next/image';
import { useAuthStore } from '@/lib/store/auth.store';
import { useAuth } from '@/providers/AuthProvider';
import LicenseBanner from '@/components/LicenseBanner';
import BranchSwitcher from '@/components/branch/BranchSwitcher';
import SessionTimeoutProvider from '@/providers/SessionTimeoutProvider';

const DRAWER_WIDTH     = 256;
const DRAWER_COLLAPSED = 68;

// ── Design tokens ──────────────────────────────────────────────────────────────
const SIDEBAR_ACTIVE_BG   = 'rgba(59,130,246,0.16)';
const SIDEBAR_ACTIVE_BORD = '#60A5FA';
const SIDEBAR_HOVER_BG    = 'rgba(255,255,255,0.07)';
const SIDEBAR_TEXT        = 'rgba(255,255,255,0.75)';
const SIDEBAR_TEXT_MUTED  = 'rgba(255,255,255,0.40)';
const SIDEBAR_ICON_ACTIVE = '#60A5FA';
const SIDEBAR_ICON_IDLE   = 'rgba(255,255,255,0.52)';

// ── Nav types ─────────────────────────────────────────────────────────────────
interface NavLeaf {
  kind?: 'leaf';
  label: string;
  icon: React.ReactNode;
  href: string;
  permission?: string;
  exact?: boolean;
  /** Bug fix (sidebar-license-gating, 2026-07-31): mirrors dashboard's `ModuleConfig.requiresModule` -- hides this item unless the module code is in the tenant's licensed modules. Unset for Platform-core items (Dashboard, Users, RBAC, Settings), exactly like the dashboard leaves those ungated. */
  requiresModule?: string;
  /**
   * These modules are mounted as their own independent, statically-served
   * apps (original zoe-platform SPA/Next.js builds copied verbatim into
   * `public/<module>/`, own React tree, own CSS) -- not Next.js App Router
   * pages. `router.push()`'s client-side soft navigation only knows about
   * the App Router's own route manifest, so it 404s on these paths; a real
   * browser navigation (`window.location.assign`) is required to actually
   * hit the static file server / SPA fallback rewrite for them.
   */
  external?: boolean;
}

interface NavGroup {
  kind: 'group';
  label: string;
  icon: React.ReactNode;
  basePath: string;
  permission?: string;
  /** Bug fix (sidebar-license-gating, 2026-07-31): see `NavLeaf.requiresModule`'s doc comment -- same meaning, applied to the whole group. */
  requiresModule?: string;
  children: NavLeaf[];
}

interface NavSection {
  kind: 'section';
  label: string;
}

type NavEntry = NavLeaf | NavGroup | NavSection;

// ── Nav definition ────────────────────────────────────────────────────────────
const NAV: NavEntry[] = [
  { kind: 'section', label: 'PLATFORM' },
  { label: 'Dashboard',           icon: <DashboardIcon />, href: '/dashboard' },
  { label: 'Users',               icon: <PeopleIcon />,    href: '/users',    permission: 'PLATFORM:USERS:READ' },
  { label: 'Roles & Permissions', icon: <SecurityIcon />,  href: '/rbac',     permission: 'PLATFORM:ROLES:READ' },

  { kind: 'section', label: 'MODULES' },
  // ── zoe-platform modules ──────────────────────────────────────────────
  // Each of these four is mounted as its own original, unmodified
  // zoe-platform build (Vite/CRA SPA or, for LifeGenX, its own Next.js
  // app) served statically under `public/<module>/` -- own React tree,
  // own CSS, own client-side routing (BrowserRouter/basePath already set
  // to that prefix in the original source). A single flat, `external`
  // sidebar leaf per module is all that's needed: the module's own UI
  // provides its own internal navigation once loaded, exactly as it did
  // standalone in zoe-platform. `exact: true` so the leaf only highlights
  // on the module's own root, not while the browser is mid-navigation
  // away from ZoeConnect.
  {
    label: 'CliniGrowth', icon: <ShowChartIcon />, href: '/clinigrowth/',
    permission: 'PLATFORM:HIS:READ', requiresModule: 'PLATFORM', exact: true, external: true,
  },
  {
    label: 'Mortuary', icon: <LocalHospitalIcon />, href: '/mortuary/',
    permission: 'MORTUARY:BODIES:READ', requiresModule: 'MORTUARY', exact: true, external: true,
  },
  {
    label: 'LifeGenX', icon: <PsychologyIcon />, href: '/lifegenx/',
    permission: 'LIFEGENX:CONSULTATIONS:VIEW', requiresModule: 'LIFEGENX', exact: true, external: true,
  },
  {
    label: 'Drug Indenting', icon: <MedicationIcon />, href: '/drug-indenting/',
    permission: 'DRUG_INDENTING:REQUESTS:VIEW', requiresModule: 'DRUG_INDENTING', exact: true, external: true,
  },
  {
    kind: 'group', label: 'Loyalty', icon: <LoyaltyIcon />,
    basePath: '/loyalty', permission: 'LOYALTY:ACCOUNTS:READ', requiresModule: 'LOYALTY',
    children: [
      { label: 'Accounts',      icon: <PeopleAltIcon />,     href: '/loyalty',              permission: 'LOYALTY:ACCOUNTS:READ',      exact: true },
      { label: 'Campaigns',     icon: <CampaignIcon />,      href: '/loyalty/campaigns',    permission: 'LOYALTY:CAMPAIGNS:READ' },
      { label: 'Card Config',   icon: <TuneIcon />,          href: '/settings/card-config', permission: 'LOYALTY:CARD_CONFIG:READ' },
      { label: 'Reports',       icon: <BarChartIcon />,      href: '/reports',              permission: 'PLATFORM:REPORTS:READ' },
      { label: 'Notifications', icon: <NotificationsIcon />, href: '/notifications',        permission: 'PLATFORM:NOTIFICATIONS:READ' },
    ],
  },
  {
    kind: 'group', label: 'Early Intervention', icon: <ChildCareIcon />,
    basePath: '/eic', permission: 'EIC:PATIENTS:READ', requiresModule: 'EIC',
    children: [
      { label: 'Dashboard',        icon: <DashboardIcon />,  href: '/eic',                  permission: 'EIC:PATIENTS:READ' },
      { label: 'Patients',         icon: <PeopleAltIcon />,  href: '/eic/patients',         permission: 'EIC:PATIENTS:READ' },
      { label: 'Assessments',      icon: <AssignmentIcon />, href: '/eic/assessments',      permission: 'EIC:ASSESSMENTS:READ' },
      { label: 'Sessions',         icon: <EventNoteIcon />,  href: '/eic/sessions',         permission: 'EIC:SESSIONS:READ' },
      { label: 'Progress Reports', icon: <SummarizeIcon />,  href: '/eic/progress-reports', permission: 'EIC:PROGRESS_REPORTS:READ' },
      { label: 'Preschool',        icon: <SchoolIcon />,     href: '/eic/preschool',        permission: 'EIC:PRESCHOOL:READ' },
    ],
  },
  {
    kind: 'group', label: "Children's Village", icon: <SchoolIcon />,
    basePath: '/childrens-village', permission: 'CV:ACADEMIC_YEAR:READ', requiresModule: 'CHILDRENS_VILLAGE',
    children: [
      { label: 'Dashboard',       icon: <DashboardIcon />,    href: '/childrens-village',               permission: 'CV:ACADEMIC_YEAR:READ', exact: true },
      { label: 'Teacher Workspace', icon: <AssignmentIcon />, href: '/childrens-village/teacher-workspace', permission: 'CV:DLR:WRITE' },
      { label: 'Students',        icon: <FaceIcon />,         href: '/childrens-village/students',      permission: 'CV:STUDENT:READ' },
      { label: 'Admissions',      icon: <PersonAddAlt1Icon /> , href: '/childrens-village/admissions',  permission: 'CV:ADMISSIONS:READ' },
      { label: 'Academic Years',  icon: <EventNoteIcon />,    href: '/childrens-village/academic-years',permission: 'CV:ACADEMIC_YEAR:READ' },
      { label: 'Classes',         icon: <PeopleAltIcon />,    href: '/childrens-village/classes',       permission: 'CV:CLASS:READ' },
      { label: 'Subjects',        icon: <ArticleIcon />,      href: '/childrens-village/subjects',      permission: 'CV:SUBJECT:READ' },
      { label: 'Settings',        icon: <SettingsIcon />,     href: '/childrens-village/settings',      permission: 'CV:SETTINGS:MANAGE' },
    ],
  },
  {
    kind: 'group', label: 'Token Queue', icon: <ConfirmationNumberIcon />,
    basePath: '/token', permission: 'TOKEN:COUNTER:READ', requiresModule: 'QUEUE',
    children: [
      { label: 'Counter',       icon: <ConfirmationNumberIcon />, href: '/token',               permission: 'TOKEN:COUNTER:READ', exact: true },
      { label: 'Configuration', icon: <TuneIcon />,               href: '/token/config',        permission: 'TOKEN:CONFIG:READ' },
      { label: 'Kiosks',        icon: <QrCode2Icon />,            href: '/token/config/kiosks', permission: 'TOKEN:KIOSK:MANAGE' },
      { label: 'Kiosk Devices', icon: <DevicesIcon />,            href: '/token/config/kiosk-devices', permission: 'TOKEN:KIOSK:MANAGE' },
    ],
  },
  {
    kind: 'group', label: 'Attendance', icon: <MonitorHeartIcon />,
    basePath: '/attendance', permission: 'ATTENDANCE:MONITORING:READ',
    children: [
      { label: 'Monitoring', icon: <MonitorHeartIcon />, href: '/attendance/monitoring', permission: 'ATTENDANCE:MONITORING:READ' },
    ],
  },
  {
    kind: 'group', label: 'Content Management', icon: <TvIcon />,
    basePath: '/cms', permission: 'CMS:PLAYLIST:MANAGE', requiresModule: 'CMS',
    children: [
      { label: 'Media Library',      icon: <PermMediaIcon />,     href: '/cms/media',       permission: 'CMS:MEDIA:MANAGE' },
      { label: 'Playlists',          icon: <PlaylistPlayIcon />,  href: '/cms/playlists',    permission: 'CMS:PLAYLIST:MANAGE' },
      { label: 'Displays',           icon: <TvIcon />,            href: '/cms/displays',     permission: 'CMS:DISPLAY:MANAGE' },
      { label: 'Screen Groups',      icon: <GroupWorkIcon />,     href: '/cms/groups',       permission: 'CMS:DISPLAY:MANAGE' },
      { label: 'Device Monitoring',  icon: <MonitorHeartIcon />,  href: '/cms/monitoring',   permission: 'CMS:DISPLAY:MANAGE' },
      { label: 'Emergency Broadcast',icon: <WarningAmberIcon />,  href: '/cms/emergency',    permission: 'CMS:DISPLAY:MANAGE' },
      { label: 'CMS Settings',       icon: <TuneIcon />,          href: '/cms/settings',     permission: 'CMS:DISPLAY:MANAGE' },
    ],
  },
  {
    // Patient Feedback & Experience Management -- v1.0. Phase 1 (Form Builder) +
    // Phase 2 (QR Codes, Campaigns, Public Portal) + Google Review flow +
    // Complaint Diversion & Management + Analytics + Reports + Multi-language +
    // Notification engine + Settings (module-wide config, capstone phase).
    kind: 'group', label: 'Patient Feedback', icon: <RateReviewIcon />,
    basePath: '/feedback', permission: 'FEEDBACK:FORM:VIEW', requiresModule: 'FEEDBACK',
    children: [
      { label: 'Forms',      icon: <RateReviewIcon />,    href: '/feedback/forms',      permission: 'FEEDBACK:FORM:VIEW' },
      { label: 'Campaigns',  icon: <CampaignIcon />,      href: '/feedback/campaigns',  permission: 'FEEDBACK:CAMPAIGN:VIEW' },
      { label: 'QR Codes',   icon: <QrCode2Icon />,       href: '/feedback/qr-codes',   permission: 'FEEDBACK:QR:VIEW' },
      { label: 'Responses',  icon: <AssignmentIcon />,    href: '/feedback/responses',  permission: 'FEEDBACK:RESPONSE:VIEW' },
      { label: 'Complaints', icon: <ReportProblemIcon />, href: '/feedback/complaints', permission: 'FEEDBACK:COMPLAINT:VIEW' },
      { label: 'Analytics',  icon: <BarChartIcon />,      href: '/feedback/analytics', permission: 'FEEDBACK:ANALYTICS:VIEW' },
      { label: 'Languages',  icon: <TranslateIcon />,     href: '/feedback/languages', permission: 'FEEDBACK:LANGUAGE:MANAGE' },
      { label: 'Settings',   icon: <TuneIcon />,          href: '/feedback/settings',   permission: 'FEEDBACK:SETTINGS:MANAGE' },
    ],
  },
  {
    kind: 'group', label: 'Incident Management', icon: <ReportProblemIcon />,
    basePath: '/incident', permission: 'INCIDENT:INCIDENTS:READ', requiresModule: 'INCIDENT',
    children: [
      { label: 'Dashboard',   icon: <DashboardIcon />,     href: '/incident/dashboard',  permission: 'INCIDENT:DASHBOARD:READ' },
      { label: 'Incidents',   icon: <ReportProblemIcon />, href: '/incident',            permission: 'INCIDENT:INCIDENTS:READ', exact: true },
      { label: 'Analytics',   icon: <BarChartIcon />,       href: '/incident/analytics',  permission: 'INCIDENT:DASHBOARD:READ' },
      { label: 'Settings',    icon: <TuneIcon />,           href: '/incident/settings',   permission: 'INCIDENT:SETTINGS:MANAGE' },
    ],
  },

  { kind: 'section', label: 'DOCUMENT STUDIO' },
  {
    kind: 'group', label: 'Document Studio', icon: <ArticleIcon />,
    basePath: '/forms', permission: 'FORMS:DESIGNER:READ',
    children: [
      { label: 'My Forms',       icon: <ArticleIcon />,             href: '/forms/designer',  permission: 'FORMS:DESIGNER:READ', exact: true },
      { label: 'AI Import',      icon: <UploadFileIcon />,          href: '/forms/import',    permission: 'FORMS:DESIGNER:CREATE' },
      { label: 'Template Gallery', icon: <CollectionsBookmarkIcon />, href: '/forms/gallery',   permission: 'FORMS:DESIGNER:READ' },
    ],
  },

  {
    kind: 'group', label: 'Backup & Restore', icon: <BackupIcon />,
    basePath: '/backup', permission: 'BACKUP:BACKUP:READ',
    children: [
      { label: 'Dashboard',  icon: <DashboardIcon />,       href: '/backup',           permission: 'BACKUP:BACKUP:READ', exact: true },
      { label: 'Backups',    icon: <BackupIcon />,           href: '/backup/backups',   permission: 'BACKUP:BACKUP:READ' },
      { label: 'Restore',    icon: <RestoreIcon />,          href: '/backup/restore',   permission: 'BACKUP:BACKUP:RESTORE' },
      { label: 'Schedules',  icon: <ScheduleIcon />,         href: '/backup/schedules', permission: 'BACKUP:BACKUP:SCHEDULE' },
      { label: 'Storage',    icon: <TuneIcon />,             href: '/backup/storage',   permission: 'BACKUP:BACKUP:READ' },
      { label: 'Health',     icon: <HealthAndSafetyIcon />,  href: '/backup/health',    permission: 'BACKUP:BACKUP:READ' },
      { label: 'Settings',   icon: <SettingsIcon />,         href: '/backup/settings',  permission: 'BACKUP:BACKUP:SETTINGS' },
    ],
  },

  { kind: 'section', label: 'SYSTEM' },
  { label: 'Settings', icon: <SettingsIcon />, href: '/settings/license', permission: 'PLATFORM:SETTINGS:READ' },
  { label: 'Billing', icon: <WorkspacePremiumIcon />, href: '/settings/billing', permission: 'PLATFORM:SETTINGS:READ' },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const [collapsed,      setCollapsed]      = useState(false);
  const [openGroups,    setOpenGroups]    = useState<Record<string, boolean>>({});
  const [anchorEl,      setAnchorEl]      = useState<null | HTMLElement>(null);
  const [mounted,       setMounted]       = useState(false);
  const [sidebarHover,  setSidebarHover]  = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onSidebarEnter = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setSidebarHover(true);
  };
  const onSidebarLeave = () => {
    leaveTimer.current = setTimeout(() => setSidebarHover(false), 160);
  };

  // Responsive AppShell (2026-08 fix): below `md`, the sidebar becomes a
  // `temporary` (overlay) drawer opened via a hamburger button, instead of
  // the permanent 256/68px sidebar. This also retires the hover-reveal
  // collapse toggle on touch -- that control was gated behind
  // `pointerEvents: sidebarHover ? 'auto' : 'none'` with `sidebarHover`
  // driven only by `onMouseEnter`, which never fires on touch, making the
  // collapse toggle structurally unreachable there (found in the touch
  // interaction audit). The overlay drawer always renders full-width and
  // uncollapsed instead, which sidesteps the need for that control on
  // mobile entirely rather than trying to make hover-only UI touch-safe.
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  const pathname = usePathname();
  const router   = useRouter();
  const { user, hasPermission, isLoading } = useAuthStore();
  const { logout } = useAuth();
  // Attendance — self-hosted only (decision, 2026-07-20). Backend already
  // excludes AttendanceModule from the DI graph entirely for cloud
  // deployments (app.module.ts), so /attendance/* 404s there regardless of
  // this check. This just keeps the nav item from appearing for a module
  // that's actually unreachable. Shares the 'license-status' react-query
  // cache key with LicenseBanner/dashboard so this costs no extra request.
  // NEXT_PUBLIC_ATTENDANCE_ENABLED remains a manual self-hosted kill-switch
  // (e.g. a hospital that hasn't licensed Attendance) -- both must be true.
  const attendanceEnvEnabled = process.env.NEXT_PUBLIC_ATTENDANCE_ENABLED === 'true';
  const { data: licenseStatus } = useQuery({
    queryKey: ['license-status'],
    queryFn: licenseApi.getStatus,
    staleTime: 60_000,
  });
  const isCloudDeployment = licenseStatus?.deploymentMode === 'cloud';
  const attendanceEnabled = attendanceEnvEnabled && !isCloudDeployment;
  // Bug fix (sidebar-license-gating, 2026-07-31): this query already ran
  // (see just above) and already carries `licensedModules` -- the dashboard
  // reads the exact same field off the exact same `['license-status']`
  // query to hide unlicensed module cards (`ModuleConfig.requiresModule`),
  // but this layout previously only ever read `deploymentMode` off it,
  // never `licensedModules`. That's the entire reason the sidebar showed
  // every module a role granted permission for regardless of what the
  // tenant is actually licensed for, while the dashboard correctly hid
  // them: `canSee()` below had no license check to apply in the first
  // place, not a broken one.
  const licensedModules = licenseStatus?.licensedModules ?? [];

  useEffect(() => setMounted(true), []);

  // Close the mobile overlay drawer on route change -- same reasoning as
  // every other mobile drawer already fixed in this codebase (zoeconnect's
  // navbar, the vendor portal AppShell): a stale open drawer left over from
  // the previous page would otherwise sit on top of the newly-navigated
  // content.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    NAV.forEach((entry) => {
      if (entry.kind === 'group') {
        if (pathname.startsWith(entry.basePath)) {
          setOpenGroups((prev) => ({ ...prev, [entry.basePath]: true }));
        }
        const anyChildActive = entry.children.some((c) => pathname.startsWith(c.href));
        if (anyChildActive) {
          setOpenGroups((prev) => ({ ...prev, [entry.basePath]: true }));
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Wait for AuthProvider's verifyAuth() to actually resolve before rendering
  // any permission-dependent content. Without this, this layout (and children
  // like TokenManagementPage's `canOperate` check) rendered immediately with
  // user=null on first paint -- for HIS auto-login sessions this showed as a
  // ~1s flash of "You don't have permission to access Token Management"
  // before the real profile loaded and permissions were actually known.
  if (!mounted || isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (user?.isHisIntegration) {
    return (
      <SessionTimeoutProvider mode="interactive">
        <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: 'background.default' }}>
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
            <LicenseBanner />
            <Box component="main" sx={{ flex: 1, overflow: 'auto' }}>
              {children}
            </Box>
          </Box>
        </Box>
      </SessionTimeoutProvider>
    );
  }

  // On mobile the drawer is an overlay, not a squeeze-the-content sidebar --
  // always render it full-width and uncollapsed there; `collapsed` only
  // applies to the permanent desktop sidebar.
  const drawerWidth = isMobile ? DRAWER_WIDTH : (collapsed ? DRAWER_COLLAPSED : DRAWER_WIDTH);
  // Everywhere below that decides "show icon-only vs full labels" should
  // treat the mobile overlay drawer as always-expanded, regardless of
  // whatever `collapsed` happened to be set to on the desktop sidebar.
  const effectiveCollapsed = collapsed && !isMobile;

  const handleLogout = async () => {
    setAnchorEl(null);
    await logout();
    router.replace('/login');
  };

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  // Wraps router.push so nav clicks also dismiss the mobile overlay drawer --
  // used by renderLeaf/renderGroup below instead of calling router.push directly.
  const navigate = (href: string, external?: boolean) => {
    if (external) {
      window.location.assign(href);
    } else {
      router.push(href);
    }
    if (isMobile) setMobileOpen(false);
  };

  const canSee = (permission?: string, requiresModule?: string) =>
    (!permission || (mounted && hasPermission(permission)))
    && (!requiresModule || licensedModules.includes(requiresModule));

  // "Settings" (/settings/license) is the license-request page -- only
  // relevant for self-hosted tenants, who request module licenses from
  // their vendor manually. Cloud tenants manage licensing entirely through
  // Billing, so hide the "Settings" item for them.
  const visibleNav = NAV.filter((entry) => {
    if (!attendanceEnabled && entry.kind === 'group' && entry.label === 'Attendance') {
      return false;
    }
    if (isCloudDeployment && entry.kind !== 'group' && entry.kind !== 'section' && entry.label === 'Settings') {
      return false;
    }
    return true;
  });

  const displayName = mounted ? (user?.fullName || user?.username || '') : '';
  const userRoles   = mounted ? (user?.roles?.map((r: any) => r.name) ?? []) : [];
  const initials    = (displayName[0] ?? '?').toUpperCase();

  // ── Shared button styles ────────────────────────────────────────────────────
  const btnSx = (active: boolean) => ({
    minHeight: 36,
    borderRadius: '0 10px 10px 0',
    pl: effectiveCollapsed ? '18px' : 1.75,
    pr: 1.5,
    mr: 1,
    mb: 0.3,
    justifyContent: effectiveCollapsed ? 'center' : 'initial',
    borderLeft: active ? `3px solid ${SIDEBAR_ACTIVE_BORD}` : '3px solid transparent',
    bgcolor: active ? SIDEBAR_ACTIVE_BG : 'transparent',
    transition: 'all 0.15s ease',
    '&:hover': {
      bgcolor: active ? SIDEBAR_ACTIVE_BG : SIDEBAR_HOVER_BG,
    },
    '&.Mui-selected': {
      bgcolor: SIDEBAR_ACTIVE_BG,
      '&:hover': { bgcolor: SIDEBAR_ACTIVE_BG },
    },
  });

  const iconSx = (active: boolean) => ({
    minWidth: 0,
    mr: effectiveCollapsed ? 0 : 2,
    justifyContent: 'center',
    color: active ? SIDEBAR_ICON_ACTIVE : SIDEBAR_ICON_IDLE,
    transition: 'color 0.15s ease',
    '& .MuiSvgIcon-root': { fontSize: 19 },
  });

  // ── Render helpers ──────────────────────────────────────────────────────────
  const renderSection = (label: string, idx: number) => {
    if (effectiveCollapsed) {
      return (
        <Box key={`section-${idx}`} sx={{ mx: 1.5, my: 1.25 }}>
          <Box sx={{ height: '1px', bgcolor: 'rgba(255,255,255,0.09)', borderRadius: 1 }} />
        </Box>
      );
    }
    return (
      <Typography
        key={`section-${idx}`}
        sx={{
          display: 'block',
          px: 2.5, pt: 2.25, pb: 0.6,
          color: SIDEBAR_TEXT_MUTED,
          fontSize: '0.6rem', fontWeight: 700,
          letterSpacing: '0.14em', textTransform: 'uppercase',
          userSelect: 'none',
        }}
      >
        {label}
      </Typography>
    );
  };

  const renderLeaf = (item: NavLeaf, indent = false) => {
    if (!canSee(item.permission, item.requiresModule)) return null;
    const active = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + '/');
    return (
      <ListItem key={item.href} disablePadding>
        <Tooltip title={effectiveCollapsed ? item.label : ''} placement="right" arrow>
          <ListItemButton
            selected={active}
            onClick={() => navigate(item.href, item.external)}
            sx={{
              ...btnSx(active),
              pl: !effectiveCollapsed && indent
                ? `${(1.75 + 2) * 8}px`
                : effectiveCollapsed ? '18px' : `${1.75 * 8}px`,
            }}
          >
            <ListItemIcon sx={iconSx(active)}>{item.icon}</ListItemIcon>
            {!effectiveCollapsed && (
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  fontSize:      indent ? 12.5 : 13,
                  fontWeight:    active ? 600 : 400,
                  color:         active ? '#fff' : SIDEBAR_TEXT,
                  letterSpacing: '0.01em',
                  lineHeight:    1.3,
                }}
              />
            )}
          </ListItemButton>
        </Tooltip>
      </ListItem>
    );
  };

  const renderGroup = (group: NavGroup) => {
    if (!canSee(group.permission, group.requiresModule)) return null;
    const groupOpen   = !!openGroups[group.basePath];
    const groupActive = pathname.startsWith(group.basePath) ||
      group.children.some((c) => pathname.startsWith(c.href));

    return (
      <Box key={group.basePath}>
        <ListItem disablePadding>
          <Tooltip title={effectiveCollapsed ? group.label : ''} placement="right" arrow>
            <ListItemButton
              onClick={() => effectiveCollapsed ? navigate(group.basePath) : toggleGroup(group.basePath)}
              sx={btnSx(groupActive && !groupOpen)}
            >
              <ListItemIcon sx={iconSx(groupActive)}>{group.icon}</ListItemIcon>
              {!effectiveCollapsed && (
                <>
                  <ListItemText
                    primary={group.label}
                    primaryTypographyProps={{
                      fontSize:      13,
                      fontWeight:    groupActive ? 600 : 400,
                      color:         groupActive ? '#fff' : SIDEBAR_TEXT,
                      letterSpacing: '0.01em',
                      lineHeight:    1.3,
                    }}
                  />
                  {groupOpen
                    ? <ExpandLessIcon sx={{ color: SIDEBAR_TEXT_MUTED, fontSize: 15 }} />
                    : <ExpandMoreIcon sx={{ color: SIDEBAR_TEXT_MUTED, fontSize: 15 }} />
                  }
                </>
              )}
            </ListItemButton>
          </Tooltip>
        </ListItem>

        {!effectiveCollapsed && (
          <Collapse in={groupOpen} timeout="auto" unmountOnExit>
            <List disablePadding>
              {group.children.map((child) => renderLeaf(child, true))}
            </List>
          </Collapse>
        )}
      </Box>
    );
  };

  return (
    <SessionTimeoutProvider mode="interactive">
      <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: 'background.default' }}>

        {/* ── Hover-reveal sidebar toggle tab ─────────────────────────────────
             Desktop only. Appears only when the user's mouse is over the
             sidebar. Sits flush with the sidebar's right edge — zero content
             overlap. Hidden entirely on mobile: it's gated behind
             `sidebarHover`, which `onMouseEnter` never sets on a touch
             device, so on mobile this control would be permanently
             unreachable (`pointerEvents: 'none'` forever) rather than just
             unstyled -- the overlay drawer below sidesteps the need for a
             collapse toggle on mobile entirely instead. */}
        {!isMobile && (
          <Box
            onMouseEnter={onSidebarEnter}
            onMouseLeave={onSidebarLeave}
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            sx={{
              position: 'fixed',
              top: '50%',
              zIndex: 1300,
              // slides in from the sidebar edge; 0px = flush with right edge
              opacity:    sidebarHover ? 1 : 0,
              transform:  sidebarHover
                ? 'translateY(-50%) translateX(0)'
                : 'translateY(-50%) translateX(-6px)',
              transition: `opacity 0.2s ease,
                           transform 0.2s ease,
                           left 0.22s cubic-bezier(0.4,0,0.2,1)`,
              pointerEvents: sidebarHover ? 'auto' : 'none',
              cursor: 'pointer',
            }}
            style={{ left: drawerWidth }}
          >
            {/* Pill-shaped tab that looks like a natural sidebar handle */}
            <Box
              sx={{
                width: 18,
                height: 52,
                borderRadius: '0 8px 8px 0',
                background: 'linear-gradient(180deg, #1E3A5F 0%, #1565C0 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '3px 0 12px rgba(21,101,192,0.28)',
                transition: 'background 0.15s, box-shadow 0.15s',
                '&:hover': {
                  background: 'linear-gradient(180deg, #1565C0 0%, #1976D2 100%)',
                  boxShadow: '3px 0 16px rgba(21,101,192,0.45)',
                },
              }}
            >
              {collapsed
                ? <ChevronRightIcon sx={{ fontSize: 13, color: 'rgba(255,255,255,0.9)' }} />
                : <ChevronLeftIcon  sx={{ fontSize: 13, color: 'rgba(255,255,255,0.9)' }} />
              }
            </Box>
          </Box>
        )}

        {/* ── Side Drawer ──────────────────────────────────────────────────── */}
        <Drawer
          variant={isMobile ? 'temporary' : 'permanent'}
          open={isMobile ? mobileOpen : true}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }} // better open perf on mobile, per MUI's own guidance
          onMouseEnter={onSidebarEnter}
          onMouseLeave={onSidebarLeave}
          sx={{
            width: isMobile ? 0 : drawerWidth,
            flexShrink: 0,
            transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
            '& .MuiDrawer-paper': {
              width:         drawerWidth,
              overflow:      'hidden',
              display:       'flex',
              flexDirection: 'column',
              transition:    'width 0.22s cubic-bezier(0.4,0,0.2,1)',
              boxSizing:     'border-box',
            },
          }}
        >
          {/* ── Brand block ──────────────────────────────────────────────── */}
          <Box
            sx={{
              height: effectiveCollapsed ? 64 : 80,
              display: 'flex',
              alignItems: 'center',
              px: effectiveCollapsed ? 1.25 : 2,
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              flexShrink: 0,
              overflow: 'hidden',
              gap: 1.5,
              transition: 'height 0.22s cubic-bezier(0.4,0,0.2,1)',
            }}
          >
            {effectiveCollapsed ? (
              <Box sx={{ mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Image src="/logo-icon.svg" alt="ZoeConnect" width={32} height={28} priority />
              </Box>
            ) : (
              <>
                <Box sx={{ flexShrink: 0 }}>
                  <Image src="/logo-icon.svg" alt="ZoeConnect" width={30} height={26} priority />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ color: 'white', fontSize: '1rem', fontWeight: 800, lineHeight: 1, letterSpacing: '0.04em' }}>
                    ZoeConnect
                  </Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.6rem', fontWeight: 500, lineHeight: 1.35, mt: 0.3, whiteSpace: 'nowrap' }}>
                    Digital Service Platform
                  </Typography>
                  <Typography sx={{ color: '#4ADE80', fontSize: '0.575rem', fontWeight: 600, lineHeight: 1, mt: 0.25, letterSpacing: '0.04em' }}>
                    Powered by Camerin Innovate
                  </Typography>
                </Box>
              </>
            )}
          </Box>

          {/* ── Branch Switcher ──────────────────────────────────────────── */}
          <Box sx={{ px: effectiveCollapsed ? 1 : 0, pt: 0.75, pb: 0.25, flexShrink: 0 }}>
            <BranchSwitcher collapsed={effectiveCollapsed} />
          </Box>

          {/* ── Navigation ───────────────────────────────────────────────── */}
          <List
            sx={{
              flex: 1, pt: 0.5, overflowY: 'auto', overflowX: 'hidden',
              '&::-webkit-scrollbar': { width: 3 },
              '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.12)', borderRadius: 2 },
              '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
            }}
          >
            {visibleNav.map((entry, idx) => {
              if (entry.kind === 'section') return renderSection(entry.label, idx);
              if (entry.kind === 'group')   return renderGroup(entry);
              return renderLeaf(entry as NavLeaf);
            })}
          </List>

          {/* ── Sidebar Footer ────────────────────────────────────────────── */}
          <Box
            sx={{
              borderTop: '1px solid rgba(255,255,255,0.07)',
              p: effectiveCollapsed ? 1 : 1.5,
              flexShrink: 0,
              bgcolor: 'rgba(0,0,0,0.12)',
            }}
          >
            {effectiveCollapsed ? (
              <Tooltip title={displayName || user?.username || ''} placement="right" arrow>
                <Avatar
                  onClick={(e) => setAnchorEl(e.currentTarget)}
                  sx={{
                    width: 34, height: 34,
                    background: 'linear-gradient(135deg, #1565C0, #0D9488)',
                    cursor: 'pointer', mx: 'auto', fontSize: 13, fontWeight: 700,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                    '&:hover': { transform: 'scale(1.06)' },
                    transition: 'transform 0.15s',
                  }}
                >
                  {initials}
                </Avatar>
              </Tooltip>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Avatar
                  onClick={(e) => setAnchorEl(e.currentTarget)}
                  sx={{
                    width: 34, height: 34,
                    background: 'linear-gradient(135deg, #1565C0, #0D9488)',
                    fontSize: 13, fontWeight: 700, flexShrink: 0, cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                    '&:hover': { transform: 'scale(1.04)' },
                    transition: 'transform 0.15s',
                  }}
                >
                  {initials}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'white', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName || user?.username}
                  </Typography>
                  <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.38)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {userRoles.join(' · ')}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.25, flexShrink: 0 }}>
                  <Tooltip title="Change Password" arrow>
                    <IconButton
                      size="small"
                      onClick={() => router.push('/change-password')}
                      aria-label="Change Password"
                      sx={{
                        color: 'rgba(255,255,255,0.38)',
                        '&:hover': { color: 'rgba(255,255,255,0.85)', bgcolor: 'rgba(255,255,255,0.08)' },
                      }}
                    >
                      <KeyIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Sign Out" arrow>
                    <IconButton
                      size="small"
                      onClick={handleLogout}
                      aria-label="Sign Out"
                      sx={{
                        color: 'rgba(255,255,255,0.38)',
                        '&:hover': { color: '#F87171', bgcolor: 'rgba(239,68,68,0.10)' },
                      }}
                    >
                      <LogoutIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            )}
          </Box>

          {/* User context menu — triggered by avatar in footer */}
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
            transformOrigin={{ horizontal: 'left', vertical: 'bottom' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            PaperProps={{ sx: { mt: -1, ml: 1, px: 0.75, py: 0.75, minWidth: 200 } }}
          >
            <Box sx={{ px: 1.5, py: 1, mb: 0.5 }}>
              <Typography variant="body2" fontWeight={700}>{displayName || user?.username}</Typography>
              <Typography variant="caption" color="text.secondary">{userRoles.join(' · ')}</Typography>
            </Box>
            <Divider sx={{ mb: 0.5 }} />
            <MenuItem
              onClick={() => { setAnchorEl(null); router.push('/change-password'); }}
              sx={{ borderRadius: 1.5, gap: 1.5, fontSize: '0.875rem' }}
            >
              <KeyIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              Change Password
            </MenuItem>
            <MenuItem
              onClick={handleLogout}
              sx={{ borderRadius: 1.5, gap: 1.5, fontSize: '0.875rem', color: 'error.main', mt: 0.25 }}
            >
              <LogoutIcon fontSize="small" />
              Sign Out
            </MenuItem>
          </Menu>
        </Drawer>

        {/* ── Main Content ─────────────────────────────────────────────────── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Mobile top bar — the only way to open the overlay drawer below
              `md`; the desktop hover-reveal toggle is hidden there (see the
              guarded Box above). Kept minimal: hamburger + brand mark only. */}
          {isMobile && (
            <Box
              sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                px: 1, py: 1,
                bgcolor: '#0F2942', // matches the sidebar's dark brand color
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                flexShrink: 0,
              }}
            >
              <IconButton
                aria-label="Open navigation menu"
                onClick={() => setMobileOpen(true)}
                sx={{ color: 'white' }}
              >
                <MenuIcon />
              </IconButton>
              <Image src="/logo-icon.svg" alt="ZoeConnect" width={24} height={21} priority />
              <Typography sx={{ color: 'white', fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.02em' }}>
                ZoeConnect
              </Typography>
            </Box>
          )}

          {/* License Banner — kept for functional license warnings */}
          <LicenseBanner />

          {/* Page Content */}
          <Box
            component="main"
            sx={{ flex: 1, overflow: 'auto' }}
          >
            {children}
          </Box>
        </Box>
      </Box>
    </SessionTimeoutProvider>
  );
}
