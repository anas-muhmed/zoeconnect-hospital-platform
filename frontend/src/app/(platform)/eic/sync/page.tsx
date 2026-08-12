'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';

import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import RefreshIcon from '@mui/icons-material/Refresh';
import PersonIcon from '@mui/icons-material/Person';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import { eicApi } from '@/lib/api/eic.api';
import { apiClient } from '@/lib/api/client';
import PageHeader from '@/components/PageHeader';

// ─── Types ────────────────────────────────────────────────────────────────────

type HisDiagnostics = {
  oracleConnected: boolean;
  configKeysLoaded: number;
  syncSqlConfigured: boolean;
  hint: string | null;
  oracle?: {
    invoiceTableRowCount: number | null;
    sampleStatuses: string[] | null;
    testQueryError: string | null;
  };
};

type SyncStatusRow = {
  id: string;
  mrn: string;
  fullName: string;
  isActive: boolean;
  hisSyncedAt: string | null;
};

type SyncSummary = {
  total: number;
  synced: number;
  neverSynced: number;
  lastSyncAt: string | null;
};

// ─── HIS Connection Card ──────────────────────────────────────────────────────
function HisConnectionCard({ diag, loading }: { diag: HisDiagnostics | null; loading: boolean }) {
  if (loading) {
    return (
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">Checking HIS connection…</Typography>
        </CardContent>
      </Card>
    );
  }

  if (!diag) return null;

  const connected = diag.oracleConnected;
  const colour    = connected ? 'success' : 'error';

  return (
    <Card variant="outlined" sx={{ mb: 3, borderColor: connected ? 'success.main' : 'error.main' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          {connected
            ? <CheckCircleIcon color="success" />
            : <ErrorOutlineIcon color="error" />}
          <Typography variant="subtitle1" fontWeight={700}>
            Oracle HIS — {connected ? 'Connected' : 'Not Connected'}
          </Typography>
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">Oracle Connection</Typography>
            <Box sx={{ mt: 0.5 }}>
              <Chip
                label={diag.oracleConnected ? 'Online' : 'Offline'}
                size="small"
                color={diag.oracleConnected ? 'success' : 'error'}
              />
            </Box>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">Config Keys Loaded</Typography>
            <Typography variant="body2" fontWeight={500}>{diag.configKeysLoaded}</Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">Sync SQL Configured</Typography>
            <Box sx={{ mt: 0.5 }}>
              <Chip
                label={diag.syncSqlConfigured ? 'Yes' : 'No'}
                size="small"
                color={diag.syncSqlConfigured ? 'success' : 'warning'}
              />
            </Box>
          </Grid>
          {diag.oracle && (
            <>
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary">Invoice Table Rows</Typography>
                <Typography variant="body2" fontWeight={500}>
                  {diag.oracle.invoiceTableRowCount?.toLocaleString() ?? '—'}
                </Typography>
              </Grid>
              {diag.oracle.sampleStatuses && diag.oracle.sampleStatuses.length > 0 && (
                <Grid item xs={12} sm={8}>
                  <Typography variant="caption" color="text.secondary">Invoice Status Values</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                    {diag.oracle.sampleStatuses.map((s) => (
                      <Chip key={s} label={s} size="small" variant="outlined" />
                    ))}
                  </Box>
                </Grid>
              )}
            </>
          )}
        </Grid>

        {diag.hint && (
          <Alert
            severity={connected ? 'info' : 'warning'}
            icon={<WarningAmberIcon />}
            sx={{ mt: 2 }}
          >
            {diag.hint}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Summary Cards ────────────────────────────────────────────────────────────
function SummaryCards({ summary }: { summary: SyncSummary }) {
  const syncPct = summary.total > 0 ? Math.round((summary.synced / summary.total) * 100) : 0;

  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {[
        { label: 'Total Patients',  value: summary.total,       colour: 'primary'  },
        { label: 'HIS Synced',      value: summary.synced,      colour: 'success'  },
        { label: 'Never Synced',    value: summary.neverSynced, colour: summary.neverSynced > 0 ? 'warning' : 'success' },
      ].map(({ label, value, colour }) => (
        <Grid item xs={12} sm={4} key={label}>
          <Card variant="outlined">
            <CardContent sx={{ py: '12px !important' }}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="h4" fontWeight={700} color={`${colour}.main`}>{value}</Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
      <Grid item xs={12}>
        <Card variant="outlined">
          <CardContent sx={{ py: '12px !important' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="caption" color="text.secondary">Sync Coverage</Typography>
              <Typography variant="caption" fontWeight={700}>{syncPct}%</Typography>
            </Box>
            <LinearProgress variant="determinate" value={syncPct} color={syncPct === 100 ? 'success' : 'primary'} />
            {summary.lastSyncAt && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Last sync: {new Date(summary.lastSyncAt).toLocaleString()}
              </Typography>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function EicSyncPage() {
  const router = useRouter();

  const [diag,        setDiag]        = useState<HisDiagnostics | null>(null);
  const [diagLoading, setDiagLoading] = useState(true);
  const [summary,     setSummary]     = useState<SyncSummary | null>(null);
  const [patients,    setPatients]    = useState<SyncStatusRow[]>([]);
  const [statusLoading, setStatusLoading] = useState(true);
  const [search,      setSearch]      = useState('');

  const [batchRunning, setBatchRunning] = useState(false);
  const [batchMsg,     setBatchMsg]     = useState<string | null>(null);
  const [syncingId,    setSyncingId]    = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  const loadDiag = useCallback(async () => {
    setDiagLoading(true);
    try {
      const d = await eicApi.diagnoseHis();
      setDiag(d);
    } catch {
      setDiag(null);
    } finally {
      setDiagLoading(false);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const data = await eicApi.getSyncStatus();
      setSummary(data.summary);
      setPatients(data.patients);
    } catch {
      setError('Failed to load sync status');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDiag();
    loadStatus();
  }, [loadDiag, loadStatus]);

  const handleBatchSync = async () => {
    setBatchRunning(true);
    setBatchMsg(null);
    setError(null);
    try {
      const result = await eicApi.batchSyncAllPatients();
      setBatchMsg(result.message);
      // Refresh status after a short delay to show progress
      setTimeout(() => loadStatus(), 3000);
      setTimeout(() => loadStatus(), 8000);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Batch sync failed');
    } finally {
      setBatchRunning(false);
    }
  };

  const handleSyncOne = async (patientId: string) => {
    setSyncingId(patientId);
    try {
      const updated = await eicApi.syncFromHis(patientId);
      setPatients((prev) =>
        prev.map((p) =>
          p.id === patientId
            ? { ...p, hisSyncedAt: updated.hisSyncedAt ?? new Date().toISOString() }
            : p
        )
      );
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Sync failed');
    } finally {
      setSyncingId(null);
    }
  };

  const filtered = patients.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.fullName.toLowerCase().includes(q) || p.mrn.toLowerCase().includes(q);
  });

  const syncAge = (syncedAt: string | null): { label: string; colour: 'success' | 'warning' | 'error' | 'default' } => {
    if (!syncedAt) return { label: 'Never', colour: 'error' };
    const hours = (Date.now() - new Date(syncedAt).getTime()) / 3_600_000;
    if (hours < 24)  return { label: `${Math.round(hours)}h ago`,    colour: 'success' };
    if (hours < 168) return { label: `${Math.round(hours / 24)}d ago`, colour: 'warning' };
    return { label: new Date(syncedAt).toLocaleDateString(), colour: 'error' };
  };

  return (
    <Box>
      <PageHeader
        title="HIS Sync — Patient Demographics"
        subtitle="Sync EIC patient records with live Oracle HIS data"
        icon={<SyncIcon />}
        back="/eic"
        breadcrumbs={[
          { label: 'Early Intervention', href: '/eic' },
          { label: 'HIS Sync' },
        ]}
        actions={
          <>
            <Tooltip title="Re-check HIS connection" arrow>
              <IconButton onClick={loadDiag} disabled={diagLoading}
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }} size="small" aria-label="Re-check HIS connection">
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Button
              variant="contained"
              startIcon={batchRunning ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
              onClick={handleBatchSync}
              disabled={batchRunning || !diag?.oracleConnected}
            >
              Sync All Patients
            </Button>
          </>
        }
      />

      {/* HIS connection status */}
      <HisConnectionCard diag={diag} loading={diagLoading} />

      {batchMsg && (
        <Alert severity="info" sx={{ mb: 3 }} onClose={() => setBatchMsg(null)}>
          {batchMsg}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Summary cards */}
      {summary && <SummaryCards summary={summary} />}

      {/* Patient table */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
          Patient Sync Status
        </Typography>
        <TextField
          size="small"
          placeholder="Filter by name or MRN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: 260 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <Tooltip title="Refresh status">
          <IconButton size="small" onClick={loadStatus} disabled={statusLoading} aria-label="Refresh status">
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {statusLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                <TableCell>Patient</TableCell>
                <TableCell>MRN</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last HIS Sync</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                    No patients found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => {
                  const age = syncAge(p.hisSyncedAt);
                  const isSyncing = syncingId === p.id;
                  return (
                    <TableRow key={p.id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <PersonIcon fontSize="small" color="action" />
                          <Typography variant="body2">{p.fullName}</Typography>
                          {!p.isActive && (
                            <Chip label="Inactive" size="small" variant="outlined" />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" fontFamily="monospace">{p.mrn}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={age.label} size="small" color={age.colour} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {p.hisSyncedAt
                            ? new Date(p.hisSyncedAt).toLocaleString()
                            : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                          <Tooltip title="Open patient profile">
                            <IconButton
                              size="small"
                              onClick={() => router.push(`/eic/patients/${p.id}`)}
                             aria-label="Open patient profile">
                              <OpenInNewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Sync from HIS now">
                            <span>
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => handleSyncOne(p.id)}
                                disabled={isSyncing || !diag?.oracleConnected}
                               aria-label="Sync from HIS now">
                                {isSyncing
                                  ? <CircularProgress size={14} />
                                  : <SyncIcon fontSize="small" />}
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Legend */}
      <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {[
          { colour: 'success' as const, label: 'Synced < 24 h ago' },
          { colour: 'warning' as const, label: 'Synced 1–7 days ago' },
          { colour: 'error'   as const, label: 'Stale (> 7 days) or never synced' },
        ].map(({ colour, label }) => (
          <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip label="●" size="small" color={colour} sx={{ width: 24, minWidth: 24, height: 20, fontSize: 10 }} />
            <Typography variant="caption" color="text.secondary">{label}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
