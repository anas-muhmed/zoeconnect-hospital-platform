'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import Chip from '@mui/material/Chip';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import LinearProgress from '@mui/material/LinearProgress';
import Divider from '@mui/material/Divider';

import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import FormHelperText from '@mui/material/FormHelperText';

import SearchIcon from '@mui/icons-material/Search';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import StarIcon from '@mui/icons-material/Star';
import SyncIcon from '@mui/icons-material/Sync';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import RefreshIcon from '@mui/icons-material/Refresh';
import FilterListIcon from '@mui/icons-material/FilterList';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';

import { loyaltyApi } from '@/lib/api/loyalty.api';
import { hisApi } from '@/lib/api/his.api';
import { useDebounce } from '@/lib/hooks/useDebounce';
import PageHeader from '@/components/PageHeader';

const TIER_STYLE: Record<string, { bg: string; color: string }> = {
  SILVER:   { bg: '#78909C', color: '#fff' },
  GOLD:     { bg: '#F9A825', color: '#fff' },
  PLATINUM: { bg: '#7B1FA2', color: '#fff' },
};

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'default'> = {
  ACTIVE:    'success',
  SUSPENDED: 'warning',
  CLOSED:    'default',
};

type StatusFilter = '' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
type TierFilter   = '' | 'SILVER' | 'GOLD' | 'PLATINUM';
type SyncState    = 'idle' | 'triggering' | 'polling' | 'done' | 'error';

export default function LoyaltyIndexPage() {
  const router       = useRouter();
  const queryClient  = useQueryClient();

  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState<StatusFilter>('');
  const [tier,   setTier]       = useState<TierFilter>('');
  const [page, setPage]         = useState(0);
  const [rowsPerPage, setRows]  = useState(20);
  const [isRefreshing, setRefreshing] = useState(false);

  // ── Sync state ─────────────────────────────────────────────────────────────
  const [syncState, setSyncState]       = useState<SyncState>('idle');
  const [syncCount, setSyncCount]       = useState(0);
  const [syncError, setSyncError]       = useState('');
  const [syncHint, setSyncHint]         = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Sync date-picker dialog ─────────────────────────────────────────────────
  // Default: Jan 1 of the current year — a sensible "start loyalty this year" default
  const currentYearStart = `${new Date().getFullYear()}-01-01`;
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncFromDate, setSyncFromDate]     = useState(currentYearStart);
  const [syncDateError, setSyncDateError]   = useState('');

  const debouncedSearch = useDebounce(search, 400);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['loyalty-accounts', debouncedSearch, status, tier, page, rowsPerPage],
    queryFn: () =>
      loyaltyApi.listAccounts({
        page:   page + 1,
        limit:  rowsPerPage,
        search: debouncedSearch || undefined,
        status: status || undefined,
        tier:   tier   || undefined,
      }),
    placeholderData: (prev) => prev,
    refetchInterval: syncState === 'polling' ? 8000 : false,
  });

  // ── isSyncing must be declared before the syncStatus query references it ────
  const isSyncing = syncState === 'triggering' || syncState === 'polling';

  // ── Sync cursor status (shows how far the backfill has progressed) ──────────
  const { data: syncStatus } = useQuery({
    queryKey: ['his-sync-status'],
    queryFn: () => hisApi.getSyncStatus(),
    refetchInterval: isSyncing ? 10_000 : 60_000,
    retry: false,
  });

  const cursorDate   = syncStatus ? new Date(syncStatus.cursor) : null;
  const today        = new Date();
  const daysBehind   = cursorDate ? Math.floor((today.getTime() - cursorDate.getTime()) / 86_400_000) : null;
  const backfillDone = daysBehind !== null && daysBehind <= 1;

  // ── Manual refresh ──────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['loyalty-accounts'] });
    await refetch();
    setRefreshing(false);
  };

  // ── Poll for account count changes during sync ──────────────────────────────
  useEffect(() => {
    if (syncState === 'polling') {
      let lastCount = syncCount;
      let staleRounds = 0;

      pollRef.current = setInterval(async () => {
        try {
          const fresh = await loyaltyApi.listAccounts({ page: 1, limit: 1 });
          setSyncCount(fresh.total);
          await queryClient.invalidateQueries({ queryKey: ['loyalty-accounts'] });

          if (fresh.total !== lastCount) {
            lastCount = fresh.total;
            staleRounds = 0;
          } else {
            staleRounds++;
            if (staleRounds >= 5) {
              clearInterval(pollRef.current!);
              setSyncState('done');
            }
          }
        } catch {
          // keep polling
        }
      }, 8000);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncState]);

  // ── Open date-picker dialog before sync ────────────────────────────────────
  const handleSyncFromHis = () => {
    setSyncDateError('');
    setSyncDialogOpen(true);
  };

  // ── Confirm sync with chosen date ───────────────────────────────────────────
  const handleSyncConfirm = async () => {
    // Validate
    if (!syncFromDate) {
      setSyncDateError('Please select a start date.');
      return;
    }
    const chosen = new Date(syncFromDate);
    if (isNaN(chosen.getTime())) {
      setSyncDateError('Invalid date. Use YYYY-MM-DD format.');
      return;
    }
    if (chosen > new Date()) {
      setSyncDateError('Start date cannot be in the future.');
      return;
    }

    setSyncDialogOpen(false);
    setSyncState('triggering');
    setSyncError('');
    setSyncHint(null);
    try {
      const result = await hisApi.triggerBackfill(syncFromDate);
      if (result.diagnostics?.hint) setSyncHint(result.diagnostics.hint);
      if (!result.diagnostics?.oracleConnected) {
        setSyncError('Oracle HIS is not connected. Sync cannot run.');
        setSyncState('error');
      } else {
        setSyncState('polling');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message ?? 'Failed to start sync. Please try again.';
      setSyncError(msg);
      setSyncState('error');
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(0);
  };

  const handleStatusChange = (_: React.MouseEvent, val: StatusFilter | null) => {
    setStatus(val ?? '');
    setPage(0);
  };

  const handleTierChange = (_: React.MouseEvent, val: TierFilter | null) => {
    setTier(val ?? '');
    setPage(0);
  };

  const isEmpty   = !isLoading && data?.total === 0 && !search && !status && !tier;

  // Active filter count (for badge)
  const activeFilters = [search, status, tier].filter(Boolean).length;

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Loyalty Accounts"
        subtitle={data
          ? (isSyncing
              ? `Syncing… ${syncCount.toLocaleString()} patient${syncCount !== 1 ? 's' : ''} enrolled so far`
              : `${data.total.toLocaleString()} account${data.total !== 1 ? 's' : ''}${activeFilters > 0 ? ' (filtered)' : ' total'}`)
          : undefined}
        icon={<StarIcon />}
        actions={
          <>
            <Tooltip title="Refresh table" arrow>
              <IconButton
                onClick={handleRefresh}
                disabled={isRefreshing || isSyncing}
                size="small"
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}
               aria-label="Refresh table">
                {isRefreshing ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Button variant="outlined" startIcon={<PersonAddIcon />} onClick={() => router.push('/loyalty/enroll')}>
              Enroll Patient
            </Button>
            <Button variant="contained" startIcon={<StarIcon />} onClick={() => router.push('/loyalty/earn')}>
              Post Points
            </Button>
          </>
        }
      />

      {/* ── Backfill progress indicator ────────────────────────────────── */}
      {isSyncing && <LinearProgress sx={{ mb: 1, borderRadius: 1 }} />}
      {syncStatus && !isSyncing && (
        <Box
          sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            px: 2, py: 0.75, mb: 2, borderRadius: 1,
            bgcolor: backfillDone ? 'success.50' : 'warning.50',
            border: 1, borderColor: backfillDone ? 'success.200' : 'warning.200',
          }}
        >
          <Typography variant="caption" color={backfillDone ? 'success.dark' : 'warning.dark'} fontWeight={600}>
            {backfillDone
              ? '✓ HIS sync up to date'
              : `⟳ Backfill in progress — reading bills up to ${cursorDate?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
          </Typography>
          {!backfillDone && daysBehind !== null && (
            <Typography variant="caption" color="warning.dark">
              ({daysBehind.toLocaleString()} days behind)
            </Typography>
          )}
        </Box>
      )}

      {/* ── Sync done banner ───────────────────────────────────────────── */}
      {syncState === 'done' && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSyncState('idle')}>
          Sync complete — {syncCount.toLocaleString()} patients enrolled from HIS.
        </Alert>
      )}

      {/* ── Sync error + diagnostic hint ───────────────────────────────── */}
      {syncState === 'error' && (
        <Alert severity="error" sx={{ mb: syncHint ? 1 : 2 }} onClose={() => { setSyncState('idle'); setSyncHint(null); }}>
          {syncError}
        </Alert>
      )}
      {syncHint && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setSyncHint(null)}>
          <b>Why no data?</b> {syncHint}
        </Alert>
      )}

      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2, mb: 3 }}
      >
        {/* Row 1: Search + Sync button */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Search by MRN or patient name…"
            value={search}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  {isLoading && search
                    ? <CircularProgress size={16} />
                    : <SearchIcon fontSize="small" color="action" />}
                </InputAdornment>
              ),
              endAdornment: search
                ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => { setSearch(''); setPage(0); }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 16, lineHeight: 1 }}>×</Typography>
                      </IconButton>
                    </InputAdornment>
                  )
                : null,
            }}
            sx={{ flex: 1, maxWidth: 400 }}
          />

          <Box sx={{ flex: 1 }} />

          {!isEmpty && (
            <Button
              size="small"
              variant="outlined"
              startIcon={isSyncing ? <CircularProgress size={14} /> : <SyncIcon />}
              onClick={handleSyncFromHis}
              disabled={isSyncing}
            >
              {isSyncing ? 'Syncing…' : 'Sync from HIS'}
            </Button>
          )}
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Row 2: Tier + Status filters */}
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FilterListIcon fontSize="small" color="action" />
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ minWidth: 28 }}>
              Tier
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={tier}
              onChange={handleTierChange}
            >
              <ToggleButton value="">All</ToggleButton>
              <ToggleButton
                value="SILVER"
                sx={{
                  '&.Mui-selected': { bgcolor: '#78909C', color: '#fff', '&:hover': { bgcolor: '#607d8b' } },
                }}
              >
                Silver
              </ToggleButton>
              <ToggleButton
                value="GOLD"
                sx={{
                  '&.Mui-selected': { bgcolor: '#F9A825', color: '#fff', '&:hover': { bgcolor: '#f57f17' } },
                }}
              >
                Gold
              </ToggleButton>
              <ToggleButton
                value="PLATINUM"
                sx={{
                  '&.Mui-selected': { bgcolor: '#7B1FA2', color: '#fff', '&:hover': { bgcolor: '#6a1b9a' } },
                }}
              >
                Platinum
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ minWidth: 42 }}>
              Status
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={status}
              onChange={handleStatusChange}
            >
              <ToggleButton value="">All</ToggleButton>
              <ToggleButton value="ACTIVE">Active</ToggleButton>
              <ToggleButton value="SUSPENDED">Suspended</ToggleButton>
              <ToggleButton value="CLOSED">Closed</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Clear all filters */}
          {activeFilters > 0 && (
            <Button
              size="small"
              variant="text"
              color="inherit"
              sx={{ color: 'text.secondary', ml: 'auto' }}
              onClick={() => { setSearch(''); setStatus(''); setTier(''); setPage(0); }}
            >
              Clear filters ({activeFilters})
            </Button>
          )}
        </Box>
      </Paper>

      {/* ── API error ──────────────────────────────────────────────────── */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load accounts. Check your connection and try again.
        </Alert>
      )}

      {/* ── Empty state — first-run HIS import prompt ──────────────────── */}
      {isEmpty && syncState === 'idle' && (
        <Paper
          elevation={0}
          sx={{
            border: 1,
            borderColor: 'primary.light',
            bgcolor: 'primary.50',
            borderRadius: 2,
            p: 5,
            textAlign: 'center',
            mb: 3,
          }}
        >
          <CloudDownloadIcon sx={{ fontSize: 56, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6" fontWeight={600} gutterBottom>
            No loyalty accounts yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 480, mx: 'auto' }}>
            Import all existing patients from the HIS. ZoeConnect will auto-enroll every patient
            with a finalised bill on record and start awarding points.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<SyncIcon />}
              onClick={handleSyncFromHis}
            >
              Import from HIS
            </Button>
            <Button
              variant="outlined"
              size="large"
              startIcon={<PersonAddIcon />}
              onClick={() => router.push('/loyalty/enroll')}
            >
              Enroll manually
            </Button>
          </Box>
        </Paper>
      )}

      {/* ── Empty state while sync is running ─────────────────────────── */}
      {isEmpty && isSyncing && (
        <Paper
          elevation={0}
          sx={{
            border: 1,
            borderColor: 'info.light',
            bgcolor: 'info.50',
            borderRadius: 2,
            p: 5,
            textAlign: 'center',
            mb: 3,
          }}
        >
          <CircularProgress size={48} sx={{ mb: 2 }} />
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Importing patients from HIS…
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {syncCount > 0
              ? `${syncCount.toLocaleString()} patients enrolled so far. The table will update automatically.`
              : 'Fetching finalized bills from Oracle HIS. This may take a moment.'}
          </Typography>
        </Paper>
      )}

      {/* ── Sync start-date dialog ─────────────────────────────────────── */}
      <ResponsiveDialog
        open={syncDialogOpen}
        onClose={() => setSyncDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CalendarTodayIcon fontSize="small" color="primary" />
          Choose Loyalty Start Date
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2, fontSize: 14 }}>
            Only bills from this date onwards will be counted for loyalty points.
            Bills before this date will be ignored.
          </DialogContentText>

          <TextField
            label="Start date"
            type="date"
            fullWidth
            size="small"
            value={syncFromDate}
            onChange={(e) => {
              setSyncFromDate(e.target.value);
              setSyncDateError('');
            }}
            InputLabelProps={{ shrink: true }}
            inputProps={{ max: new Date().toISOString().split('T')[0] }}
            error={!!syncDateError}
          />
          {syncDateError && (
            <FormHelperText error>{syncDateError}</FormHelperText>
          )}

          {/* Quick preset buttons */}
          <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
            {[
              { label: 'This year',  date: `${new Date().getFullYear()}-01-01` },
              { label: 'This month', date: new Date().toISOString().slice(0, 7) + '-01' },
              { label: 'All history', date: '2000-01-01' },
            ].map(({ label, date }) => (
              <Button
                key={label}
                size="small"
                variant={syncFromDate === date ? 'contained' : 'outlined'}
                onClick={() => { setSyncFromDate(date); setSyncDateError(''); }}
                sx={{ textTransform: 'none', fontSize: 12 }}
              >
                {label}
              </Button>
            ))}
          </Box>

          <Alert severity="info" sx={{ mt: 2, fontSize: 13 }}>
            <b>Selected:</b>{' '}
            {syncFromDate
              ? new Date(syncFromDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
              : '—'}{' '}
            onwards
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSyncDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={<SyncIcon />}
            onClick={handleSyncConfirm}
          >
            Start Sync
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      {(!isEmpty || isSyncing) && (
        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell><b>Card Number</b></TableCell>
                  <TableCell><b>MRN</b></TableCell>
                  <TableCell><b>Patient Name</b></TableCell>
                  <TableCell><b>Tier</b></TableCell>
                  <TableCell align="right"><b>Available Pts</b></TableCell>
                  <TableCell align="right"><b>Card Value (₹)</b></TableCell>
                  <TableCell align="right"><b>Lifetime Spend</b></TableCell>
                  <TableCell><b>Status</b></TableCell>
                  <TableCell><b>Enrolled</b></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading && !data
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 8 }).map((__, j) => (
<TableCell key={j}><Skeleton variant="text" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  : data?.items.length === 0
                  ? (
                      <TableRow>
                        <TableCell colSpan={9} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                          {isSyncing
                            ? 'Waiting for first patients to arrive…'
                            : 'No accounts match your filters.'}
                        </TableCell>
                      </TableRow>
                    )
                  : data?.items.map((acc) => {
                      const tierStyle = TIER_STYLE[acc.category?.name] ?? { bg: '#9e9e9e', color: '#fff' };
                      return (
                        <TableRow
                          key={acc.id}
                          hover
                          sx={{ cursor: 'pointer' }}
                          onClick={() => router.push(`/loyalty/accounts/${acc.id}`)}
                        >
                          <TableCell>
                            <Typography variant="body2" fontWeight={600} fontFamily="monospace">
                              {acc.cardNumber}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {acc.patientMrn}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {acc.patientName ?? <Typography variant="body2" color="text.disabled">—</Typography>}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={acc.category?.name ?? '—'}
                              size="small"
                              sx={{ bgcolor: tierStyle.bg, color: tierStyle.color, fontWeight: 700, fontSize: 11 }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight={600}>
                              {Number(acc.availablePoints).toLocaleString()}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight={600} color="success.main">
                              ₹{((Number(acc.availablePoints) / 100) * Number(acc.category?.pointValuePer100 ?? 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" color="text.secondary">
                              ₹{Number(acc.totalLifetimeSpend).toLocaleString()}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={acc.status}
                              size="small"
                              color={STATUS_COLOR[acc.status] ?? 'default'}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(acc.enrolledAt).toLocaleDateString('en-IN', {
                                day: '2-digit', month: 'short', year: 'numeric',
                              })}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={data?.total ?? 0}
            page={page}
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={[10, 20, 50]}
            onPageChange={(_, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => { setRows(parseInt(e.target.value, 10)); setPage(0); }}
          />
        </Paper>
      )}
    </Box>
  );
}
