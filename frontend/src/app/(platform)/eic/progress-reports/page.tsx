'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Skeleton from '@mui/material/Skeleton';

import AssignmentIcon from '@mui/icons-material/Assignment';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import PersonIcon from '@mui/icons-material/Person';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';

import { eicApi, type EicWorkQueueItem, DISCIPLINE_LABELS } from '@/lib/api/eic.api';
import { useAuthStore } from '@/lib/store/auth.store';
import PageHeader from '@/components/PageHeader';

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, 'warning' | 'info' | 'success' | 'default'> = {
  IN_PROGRESS:       'warning',
  PENDING_SIGNATURE: 'info',
  SIGNED:            'success',
  PUBLISHED:         'success',
};

const STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS:       'In Progress',
  PENDING_SIGNATURE: 'Pending Signature',
  SIGNED:            'Signed',
  PUBLISHED:         'Published',
};

const SECTION_STATUS_COLOR: Record<string, string> = {
  PENDING:   '#F59E0B',
  SUBMITTED: '#10B981',
  AMENDMENT_REQUESTED: '#EF4444',
};

type ViewKey = 'MY_SECTIONS' | 'PENDING_SIGNATURE' | 'ALL';

interface ViewTab {
  key:         ViewKey;
  label:       string;
  icon:        React.ReactElement;
  permission:  string;
  emptyText:   string;
}

const VIEWS: ViewTab[] = [
  {
    key:        'MY_SECTIONS',
    label:      'My Sections',
    icon:       <PersonIcon fontSize="small" />,
    permission: 'EIC:PROGRESS_REPORTS:CREATE',
    emptyText:  'No active reports assigned to you.',
  },
  {
    key:        'PENDING_SIGNATURE',
    label:      'Pending Signature',
    icon:       <PendingActionsIcon fontSize="small" />,
    permission: 'EIC:PROGRESS_REPORTS:SIGN',
    emptyText:  'No reports awaiting signature.',
  },
  {
    key:        'ALL',
    label:      'All Reports',
    icon:       <AdminPanelSettingsIcon fontSize="small" />,
    permission: 'EIC:PROGRESS_REPORTS:READ',
    emptyText:  'No progress reports found.',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPeriod(from: string, to: string) {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  return `${fmt(from)} – ${fmt(to)}`;
}

function isOverdue(date: string | null) {
  if (!date) return false;
  return new Date(date) < new Date();
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function EicProgressReportsPage() {
  const router = useRouter();
  const { user, hasPermission } = useAuthStore();

  // Determine which tabs this user can see
  const availableTabs = VIEWS.filter((v) => hasPermission(v.permission));

  // Default to first available tab
  const [activeView, setActiveView] = useState<ViewKey>(availableTabs[0]?.key ?? 'ALL');
  const [items,      setItems]      = useState<EicWorkQueueItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState('');

  const load = useCallback(async (view: ViewKey) => {
    setLoading(true);
    setError(null);
    try {
      const data = await eicApi.getProgressReportWorkQueue(view);
      setItems(data);
    } catch {
      setError('Failed to load progress reports. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(activeView); }, [activeView, load]);

  const handleTabChange = (_: React.SyntheticEvent, val: ViewKey) => {
    setActiveView(val);
    setSearch('');
  };

  // Client-side search filter
  const filtered = items.filter((item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      item.patientName.toLowerCase().includes(q) ||
      item.patientMrn.toLowerCase().includes(q)  ||
      item.enrollmentNumber.toLowerCase().includes(q)
    );
  });

  const currentTabDef = VIEWS.find((v) => v.key === activeView);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Box>
      <PageHeader
        title="Progress Reports"
        subtitle="Quarterly developmental progress reports for EIC patients"
        icon={<AssignmentIcon />}
        back="/eic"
        breadcrumbs={[
          { label: 'Early Intervention', href: '/eic' },
          { label: 'Progress Reports' },
        ]}
      />

      {/* View Tabs */}
      {availableTabs.length > 1 && (
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs value={activeView} onChange={handleTabChange}>
            {availableTabs.map((tab) => (
              <Tab
                key={tab.key}
                value={tab.key}
                label={tab.label}
                icon={tab.icon}
                iconPosition="start"
              />
            ))}
          </Tabs>
        </Box>
      )}

      {/* Toolbar */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5, alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Search by patient name, MRN or enrollment number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, maxWidth: 420 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
        />
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={() => load(activeView)} disabled={loading} aria-label="Refresh">
            {loading ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        {!loading && (
          <Typography variant="caption" color="text.secondary">
            {filtered.length} report{filtered.length !== 1 ? 's' : ''}
          </Typography>
        )}
      </Box>

      {/* Error */}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Table */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Patient</TableCell>
              <TableCell>Enrollment</TableCell>
              <TableCell>Report</TableCell>
              <TableCell>Period</TableCell>
              <TableCell>Disciplines</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Due</TableCell>
              <TableCell align="center">Open</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              // Skeleton rows
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j}><Skeleton /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, color: 'text.disabled' }}>
                    <AssignmentTurnedInIcon sx={{ fontSize: 40 }} />
                    <Typography variant="body2">
                      {search ? 'No results match your search.' : currentTabDef?.emptyText}
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            ) : filtered.map((item) => (
              <TableRow
                key={item.id}
                hover
                sx={{ cursor: 'pointer' }}
                onClick={() => router.push(`/eic/progress-reports/${item.id}`)}
              >
                {/* Patient */}
                <TableCell>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {item.patientName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    MRN: {item.patientMrn}
                  </Typography>
                </TableCell>

                {/* Enrollment */}
                <TableCell>
                  <Typography variant="body2" noWrap sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                    {item.enrollmentNumber}
                  </Typography>
                </TableCell>

                {/* Report # */}
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>
                    #{item.reportNumber}
                  </Typography>
                </TableCell>

                {/* Period */}
                <TableCell>
                  <Typography variant="caption" noWrap>
                    {formatPeriod(item.periodFrom, item.periodTo)}
                  </Typography>
                </TableCell>

                {/* Disciplines / section statuses */}
                <TableCell>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {item.sections.map((s) => (
                      <Tooltip
                        key={s.discipline}
                        title={`${DISCIPLINE_LABELS[s.discipline as keyof typeof DISCIPLINE_LABELS] ?? s.discipline}: ${s.status}`}
                      >
                        <Box
                          sx={{
                            width: 8, height: 8, borderRadius: '50%',
                            bgcolor: SECTION_STATUS_COLOR[s.status] ?? '#94A3B8',
                            flexShrink: 0,
                          }}
                        />
                      </Tooltip>
                    ))}
                    <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', ml: 0.5 }}>
                      {item.sections.filter((s) => s.status === 'SUBMITTED').length}/{item.sections.length}
                    </Typography>
                  </Box>
                </TableCell>

                {/* Report Status */}
                <TableCell>
                  <Chip
                    size="small"
                    label={STATUS_LABEL[item.status] ?? item.status}
                    color={STATUS_COLOR[item.status] ?? 'default'}
                  />
                </TableCell>

                {/* Due date */}
                <TableCell>
                  {item.status === 'IN_PROGRESS' && item.sectionsDueDate ? (
                    <Typography
                      variant="caption"
                      color={isOverdue(item.sectionsDueDate) ? 'error' : 'text.secondary'}
                      fontWeight={isOverdue(item.sectionsDueDate) ? 700 : 400}
                    >
                      Sec: {new Date(item.sectionsDueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </Typography>
                  ) : item.status === 'PENDING_SIGNATURE' && item.reportDueDate ? (
                    <Typography
                      variant="caption"
                      color={isOverdue(item.reportDueDate) ? 'error' : 'text.secondary'}
                      fontWeight={isOverdue(item.reportDueDate) ? 700 : 400}
                    >
                      Sign: {new Date(item.reportDueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </Typography>
                  ) : (
                    <Typography variant="caption" color="text.disabled">—</Typography>
                  )}
                </TableCell>

                {/* Open */}
                <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                  <Tooltip title="Open report">
                    <IconButton
                      size="small"
                      onClick={() => router.push(`/eic/progress-reports/${item.id}`)}
                     aria-label="Open report">
                      <OpenInNewIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
