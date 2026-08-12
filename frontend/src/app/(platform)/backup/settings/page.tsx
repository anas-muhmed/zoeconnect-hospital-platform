'use client';

import React from 'react';
import {
  Box, Alert, Card, CardContent, Typography, Grid, Chip, Button, List, ListItem, ListItemText,
  Tabs, Tab, TextField, Stack, Tooltip, CircularProgress, InputAdornment, IconButton, Divider,
  Accordion, AccordionSummary, AccordionDetails, Switch, FormControlLabel, FormControl,
} from '@mui/material';
import { useRouter, useSearchParams } from 'next/navigation';
import TuneIcon from '@mui/icons-material/Tune';
import StorageIcon from '@mui/icons-material/Storage';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import LockIcon from '@mui/icons-material/Lock';
import SettingsIcon from '@mui/icons-material/Settings';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DnsIcon from '@mui/icons-material/Dns';
import PageHeader from '../../../../components/PageHeader';
import { useAuthStore } from '../../../../lib/store/auth.store';
import { BACKUP_PERMISSIONS } from '../../../../lib/constants/backup-permissions';
import { BACKUP_ROUTES } from '../../../../lib/constants/backup-routes';
import { useBackupSchedules } from '../../../../hooks/backup/use-backup-schedules';
import { useBackupStorageDrivers } from '../../../../hooks/backup/use-backup-storage';
import {
  usePgToolsSettings, useSavePgToolsSettings, useDetectPgTools, useTestPgTools,
  useEngineStatus, useRunHealthCheck,
} from '../../../../hooks/backup/use-backup-pg-tools';
import {
  TestPgToolsResult, EngineStatus, PgExecutionMode, HealthCheckReport, HealthCheckItemStatus,
} from '../../../../types/backup.types';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import RadioGroup from '@mui/material/RadioGroup';
import Radio from '@mui/material/Radio';
import FactCheckIcon from '@mui/icons-material/FactCheck';

type SettingsTab = 'storage' | 'database-tools' | 'encryption' | 'general';

const TAB_LABELS: Record<SettingsTab, string> = {
  storage: 'Storage Providers',
  'database-tools': 'Database Tools',
  encryption: 'Encryption',
  general: 'General',
};

export default function BackupSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(BACKUP_PERMISSIONS.SETTINGS);

  const initialTab = (searchParams?.get('tab') as SettingsTab) || 'general';
  const [tab, setTab] = React.useState<SettingsTab>(
    (Object.keys(TAB_LABELS) as SettingsTab[]).includes(initialTab) ? initialTab : 'general',
  );

  const handleTabChange = (_: React.SyntheticEvent, value: SettingsTab) => {
    setTab(value);
    router.replace(`${BACKUP_ROUTES.SETTINGS}?tab=${value}`);
  };

  if (!hasPermission(BACKUP_PERMISSIONS.READ)) {
    return <Alert severity="warning" sx={{ m: 3 }}>You don't have permission to view backup settings.</Alert>;
  }

  return (
    <Box>
      <PageHeader title="Backup Settings" subtitle="Storage, database tools, encryption, and general defaults" icon={<TuneIcon />} />

      <Tabs value={tab} onChange={handleTabChange} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="storage" label={TAB_LABELS.storage} icon={<StorageIcon fontSize="small" />} iconPosition="start" />
        <Tab value="database-tools" label={TAB_LABELS['database-tools']} icon={<StorageRoundedIcon fontSize="small" />} iconPosition="start" />
        <Tab value="encryption" label={TAB_LABELS.encryption} icon={<LockIcon fontSize="small" />} iconPosition="start" />
        <Tab value="general" label={TAB_LABELS.general} icon={<SettingsIcon fontSize="small" />} iconPosition="start" />
      </Tabs>

      {tab === 'storage' && <StorageProvidersTab />}
      {tab === 'database-tools' && <DatabaseToolsTab canManage={canManage} />}
      {tab === 'encryption' && <EncryptionTab />}
      {tab === 'general' && <GeneralTab />}
    </Box>
  );
}

// ── Storage Providers tab ─────────────────────────────────────────────────
// Full CRUD for destinations already lives on its own dedicated page
// (/backup/storage) with a lot of surface area (drivers, credentials,
// default/priority/failover). Rather than duplicate that here, this tab is
// a landing card that links there -- the least disruptive way to make
// "Backup -> Settings -> Storage Providers" a reachable nav path per the
// spec without re-implementing the existing page's logic twice.
function StorageProvidersTab() {
  const router = useRouter();
  const { data: drivers } = useBackupStorageDrivers();
  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>Storage Providers</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Configure where backup archives are written (Local disk, Network Share, S3, Azure, GCS, SFTP), including
          credentials, priority/failover order, and per-environment destinations.
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
          {(drivers || []).map((d) => (
            <Chip key={d.driver} label={d.displayName} size="small" color={d.implemented ? 'success' : 'default'} variant={d.implemented ? 'filled' : 'outlined'} />
          ))}
        </Box>
        <Button variant="contained" onClick={() => router.push(BACKUP_ROUTES.STORAGE)}>Manage Storage Destinations</Button>
      </CardContent>
    </Card>
  );
}

// ── Database Tools tab: "Database Backup Service" health card + Advanced ──
//
// Administrators should never need to see/configure pg_dump/pg_restore
// paths in normal operation -- the engine is auto-detected (local install,
// Docker container, or a future bundled distribution). The raw-path
// editing UI that used to be this tab's entire contents now lives behind a
// collapsed "Advanced" section, for troubleshooting/unusual deployments
// only (see PgEngineService's resolution precedence on the backend).

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec} seconds ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString();
}

const ENGINE_STATUS_META: Record<EngineStatus['status'], { label: string; color: 'success' | 'warning' | 'error'; icon: React.ReactNode }> = {
  healthy: { label: 'Healthy', color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
  degraded: { label: 'Degraded', color: 'warning', icon: <WarningAmberIcon fontSize="small" /> },
  unavailable: { label: 'Not Available', color: 'error', icon: <ErrorOutlineIcon fontSize="small" /> },
};

const UNAVAILABLE_GUIDANCE = "Database backup tools are not installed on this server. Install PostgreSQL client tools that match your server's PostgreSQL version, or configure Docker container access under Backup \u2192 Settings \u2192 Database Tools \u2192 Advanced.";

const HEALTH_ITEM_META: Record<HealthCheckItemStatus, { color: 'success' | 'warning' | 'error'; icon: React.ReactNode }> = {
  pass: { color: 'success', icon: <CheckCircleIcon fontSize="small" color="success" /> },
  warn: { color: 'warning', icon: <WarningAmberIcon fontSize="small" color="warning" /> },
  fail: { color: 'error', icon: <ErrorOutlineIcon fontSize="small" color="error" /> },
};

function DatabaseToolsTab({ canManage }: { canManage: boolean }) {
  return (
    <Stack spacing={2}>
      <EngineHealthCard canManage={canManage} />
      <AdvancedOverrideSection canManage={canManage} />
    </Stack>
  );
}

// ── Health card (always visible) ──────────────────────────────────────────

function EngineHealthCard({ canManage }: { canManage: boolean }) {
  const { data: status, isLoading } = useEngineStatus();
  const healthCheckMutation = useRunHealthCheck();
  const [reportOpen, setReportOpen] = React.useState(false);

  const meta = status ? ENGINE_STATUS_META[status.status] : ENGINE_STATUS_META.unavailable;

  const handleRunHealthCheck = async () => {
    await healthCheckMutation.mutateAsync();
    setReportOpen(true);
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
          <DnsIcon color="action" />
          <Typography variant="subtitle1" fontWeight={700}>Database Backup Service</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The tools used to back up and restore your database, detected automatically. No configuration is needed
          for a normal installation.
        </Typography>

        {isLoading ? (
          <CircularProgress size={24} />
        ) : status ? (
          <>
            <Chip
              icon={meta.icon as React.ReactElement}
              label={`Status: ${meta.label}`}
              color={meta.color}
              variant="filled"
              sx={{ mb: 2, fontWeight: 600 }}
            />

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Provider</Typography>
                <Typography variant="body2" fontWeight={600}>PostgreSQL</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Strategy</Typography>
                <Typography variant="body2" fontWeight={600}>{status.strategyLabel}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Version</Typography>
                <Typography variant="body2" fontWeight={600}>{status.version ?? 'Unknown'}</Typography>
              </Grid>
              {status.mode === 'docker' && status.containerName && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">Container</Typography>
                  <Typography variant="body2" fontWeight={600}>{status.containerName}</Typography>
                </Grid>
              )}
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Location</Typography>
                <Typography variant="body2" fontWeight={600}>{status.location}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Last Validation</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {relativeTime(status.lastValidatedAt)}
                  {status.lastValidationOk === false && ' (failed)'}
                </Typography>
              </Grid>
            </Grid>

            {status.status === 'unavailable' && (
              <Alert severity="error" icon={<ErrorOutlineIcon />} sx={{ mt: 2 }}>
                <Typography variant="body2" fontWeight={600}>Database backup tools are not installed on this server</Typography>
                <Typography variant="body2">{status.lastValidationMessage || UNAVAILABLE_GUIDANCE}</Typography>
              </Alert>
            )}
            {status.status === 'degraded' && status.lastValidationMessage && (
              <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mt: 2 }}>
                {status.lastValidationMessage}
              </Alert>
            )}

            <Stack direction="row" spacing={1.5} sx={{ mt: 3, flexWrap: 'wrap', rowGap: 1 }}>
              <Tooltip title={!canManage ? 'Requires the BACKUP:BACKUP:SETTINGS permission' : ''} disableHoverListener={canManage}>
                <span>
                  <Button
                    variant="contained"
                    startIcon={healthCheckMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <FactCheckIcon />}
                    onClick={handleRunHealthCheck}
                    disabled={!canManage || healthCheckMutation.isPending}
                  >
                    Run Health Check
                  </Button>
                </span>
              </Tooltip>
            </Stack>
          </>
        ) : (
          <Alert severity="error">Could not load engine status.</Alert>
        )}
      </CardContent>

      <HealthCheckReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        report={healthCheckMutation.data}
      />
    </Card>
  );
}

// ── Health check report dialog (point 7) ──────────────────────────────────

function HealthCheckReportDialog({ open, onClose, report }: { open: boolean; onClose: () => void; report?: HealthCheckReport }) {
  const overallMeta = report ? ENGINE_STATUS_META[report.overallStatus === 'pass' ? 'healthy' : report.overallStatus === 'warn' ? 'degraded' : 'unavailable'] : undefined;

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <FactCheckIcon />
          <Typography variant="h6" component="span">Health Check Report</Typography>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {report ? (
          <Stack spacing={2}>
            {overallMeta && (
              <Chip
                icon={overallMeta.icon as React.ReactElement}
                label={`Overall: ${overallMeta.label}`}
                color={overallMeta.color}
                variant="filled"
                sx={{ fontWeight: 600, alignSelf: 'flex-start' }}
              />
            )}
            <List dense>
              {report.items.map((item) => {
                const itemMeta = HEALTH_ITEM_META[item.status];
                return (
                  <ListItem key={item.key} disableGutters>
                    <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ width: '100%' }}>
                      {itemMeta.icon}
                      <ListItemText primary={item.label} secondary={item.message} />
                    </Stack>
                  </ListItem>
                );
              })}
            </List>
            <Typography variant="caption" color="text.secondary">
              Checked {new Date(report.checkedAt).toLocaleString()}
            </Typography>
          </Stack>
        ) : (
          <CircularProgress size={24} />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ── Advanced (collapsed by default) — raw-path override, unchanged logic ──

function AdvancedOverrideSection({ canManage }: { canManage: boolean }) {
  const { data: settings, isLoading } = usePgToolsSettings();
  const saveMutation = useSavePgToolsSettings();
  const detectMutation = useDetectPgTools();
  const testMutation = useTestPgTools();

  const [overrideEnabled, setOverrideEnabled] = React.useState(false);
  const [mode, setMode] = React.useState<PgExecutionMode>('local');
  const [pgDumpPath, setPgDumpPath] = React.useState('');
  const [pgRestorePath, setPgRestorePath] = React.useState('');
  const [dockerContainerName, setDockerContainerName] = React.useState('');
  const [testResult, setTestResult] = React.useState<TestPgToolsResult | null>(null);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);

  // Seed fields from the saved config once loaded; fall back to the
  // resolved "effective" value so an admin sees what's actually in use
  // today even if nothing has been explicitly saved yet.
  React.useEffect(() => {
    if (!settings) return;
    setOverrideEnabled(settings.executionMode !== 'auto');
    setMode(settings.executionMode ?? 'local');
    setPgDumpPath(settings.pgDumpPath ?? settings.effective.pgDumpPath ?? '');
    setPgRestorePath(settings.pgRestorePath ?? settings.effective.pgRestorePath ?? '');
    setDockerContainerName(settings.dockerContainerName ?? settings.detectedDockerContainerName ?? '');
  }, [settings]);

  const dumpFieldRef = React.useRef<HTMLInputElement>(null);
  const restoreFieldRef = React.useRef<HTMLInputElement>(null);

  const handleBrowse = (which: 'dump' | 'restore') => {
    // No real OS file picker is meaningful here -- this is a SERVER-side
    // path (the app may be running on a different machine than the admin's
    // browser), not a path on the admin's own computer. Being honest about
    // that: "Browse" just focuses the field so the admin can type/paste the
    // path, with an explanatory tooltip on the button itself.
    (which === 'dump' ? dumpFieldRef : restoreFieldRef).current?.focus();
  };

  const handleTest = async () => {
    setTestResult(null);
    const result = await testMutation.mutateAsync({ pgDumpPath, pgRestorePath });
    setTestResult(result);
  };

  const handleDetect = async () => {
    setSaveMessage(null);
    const result = await detectMutation.mutateAsync();
    if (result.pgDumpPath && result.pgRestorePath) {
      setPgDumpPath(result.pgDumpPath);
      setPgRestorePath(result.pgRestorePath);
      setTestResult(null);
    }
  };

  const handleSave = async () => {
    setSaveMessage(null);
    const saved = await saveMutation.mutateAsync({
      pgDumpPath,
      pgRestorePath,
      executionMode: overrideEnabled ? mode : 'auto',
      dockerContainerName: overrideEnabled && mode === 'docker' ? dockerContainerName : undefined,
    });
    setSaveMessage(saved.lastTestStatus === 'success' ? 'Saved -- connection test passed.' : 'Saved, but the connection test failed. See the result below.');
    setTestResult({
      ok: saved.lastTestStatus === 'success',
      message: saved.lastTestMessage || '',
    });
  };

  const disabledReason = !canManage ? "You have view-only access to backup settings (missing the BACKUP:BACKUP:SETTINGS permission) — ask a backup administrator to change this." : undefined;
  const sectionDisabled = !canManage || isLoading;
  const localFieldsDisabled = sectionDisabled || !overrideEnabled || (mode !== 'local' && mode !== 'remote');
  const dockerFieldDisabled = sectionDisabled || !overrideEnabled || mode !== 'docker';

  return (
    <Accordion defaultExpanded={false} disabled={sectionDisabled} sx={{ borderRadius: 3, '&:before': { display: 'none' } }} variant="outlined">
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle1" fontWeight={700}>Advanced</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <Alert severity="info" icon={<InfoOutlinedIcon />}>
            Only needed for troubleshooting or unusual deployments (a non-standard install location, Postgres
            running in a Docker container this server can't auto-detect, or a remote database host). Most
            installations never need this section -- Auto Detect is selected by default and covers the common cases.
          </Alert>

          {!canManage && (
            <Alert severity="warning">You can view the current override but cannot edit or test it.</Alert>
          )}

          <FormControlLabel
            control={
              <Switch
                checked={overrideEnabled}
                onChange={(e) => setOverrideEnabled(e.target.checked)}
                disabled={sectionDisabled}
              />
            }
            label="Override Auto Detection"
          />

          <FormControl disabled={sectionDisabled || !overrideEnabled}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>Strategy</Typography>
            <RadioGroup
              value={mode}
              onChange={(e) => setMode(e.target.value as PgExecutionMode)}
            >
              <FormControlLabel value="auto" control={<Radio />} label="Auto Detect (default)" />
              <FormControlLabel value="local" control={<Radio />} label="Local PostgreSQL" />
              <FormControlLabel value="docker" control={<Radio />} label="Docker Container" />
              <FormControlLabel value="remote" control={<Radio />} label="Remote PostgreSQL" />
              <FormControlLabel value="bundled" control={<Radio />} label="Bundled PostgreSQL" />
            </RadioGroup>
          </FormControl>

          {mode === 'remote' && overrideEnabled && (
            <Alert severity="info">
              pg_dump/pg_restore run on THIS server and connect to a Postgres server running on a different host
              (whatever `database.host` is configured to). Enter the local path to the pg_dump/pg_restore
              executables below, exactly as with Local -- the difference is purely how this choice is labeled and
              displayed, not how it executes.
            </Alert>
          )}
          {mode === 'bundled' && overrideEnabled && (
            <Alert severity="info">
              Uses PostgreSQL binaries bundled with this ZoeConnect distribution (BACKUP_BUNDLED_PG_DIR). Not every
              distribution ships bundled binaries -- if none are present, this strategy will show as unavailable.
            </Alert>
          )}

          <Tooltip title={disabledReason || ''} disableHoverListener={canManage}>
            <TextField
              inputRef={dumpFieldRef}
              label="Custom pg_dump executable"
              placeholder="e.g. C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
              fullWidth
              value={pgDumpPath}
              onChange={(e) => setPgDumpPath(e.target.value)}
              disabled={localFieldsDisabled}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Enter the full path on the server — there is no local file picker in a web deployment.">
                      <span>
                        <IconButton size="small" onClick={() => handleBrowse('dump')} disabled={localFieldsDisabled} aria-label="Enter the full path on the server — there is no local file picker in a web deployment.">
                          <FolderOpenIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
            />
          </Tooltip>

          <Tooltip title={disabledReason || ''} disableHoverListener={canManage}>
            <TextField
              inputRef={restoreFieldRef}
              label="Custom pg_restore executable"
              placeholder="e.g. C:\Program Files\PostgreSQL\17\bin\pg_restore.exe"
              fullWidth
              value={pgRestorePath}
              onChange={(e) => setPgRestorePath(e.target.value)}
              disabled={localFieldsDisabled}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Enter the full path on the server — there is no local file picker in a web deployment.">
                      <span>
                        <IconButton size="small" onClick={() => handleBrowse('restore')} disabled={localFieldsDisabled} aria-label="Enter the full path on the server — there is no local file picker in a web deployment.">
                          <FolderOpenIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
            />
          </Tooltip>

          <TextField
            label="Docker container name"
            placeholder="e.g. hdsp-postgres"
            fullWidth
            value={dockerContainerName}
            onChange={(e) => setDockerContainerName(e.target.value)}
            disabled={dockerFieldDisabled}
            helperText="The name of the running Docker container to run pg_dump/pg_restore inside (via `docker exec`)."
          />

          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <Button
              variant="outlined"
              startIcon={detectMutation.isPending ? <CircularProgress size={16} /> : <TravelExploreIcon />}
              onClick={handleDetect}
              disabled={sectionDisabled || detectMutation.isPending}
            >
              Detect PostgreSQL Installation
            </Button>
            <Button
              variant="outlined"
              startIcon={testMutation.isPending ? <CircularProgress size={16} /> : <RestartAltIcon />}
              onClick={handleTest}
              disabled={sectionDisabled || testMutation.isPending || !pgDumpPath || !pgRestorePath}
            >
              Test Configuration
            </Button>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={sectionDisabled || saveMutation.isPending || !pgDumpPath || !pgRestorePath}
            >
              {saveMutation.isPending ? <CircularProgress size={20} /> : 'Save'}
            </Button>
          </Stack>

          {detectMutation.data && !detectMutation.data.pgDumpPath && (
            <Alert severity="warning">
              No PostgreSQL installation was found at common install locations. Enter the paths manually.
            </Alert>
          )}
          {detectMutation.data?.pgDumpPath && (
            <Alert severity="success">
              Found PostgreSQL {detectMutation.data.version ?? ''} — fields populated below. Review and Save to apply.
            </Alert>
          )}

          {testResult && (
            <Alert severity={testResult.ok ? 'success' : 'error'} icon={testResult.ok ? <CheckCircleIcon /> : <CancelIcon />}>
              <Typography variant="body2" fontWeight={600}>
                {testResult.ok ? '\u2713 Configuration valid' : '\u2717 Configuration invalid'}
              </Typography>
              <Typography variant="body2">{testResult.message}</Typography>
              {testResult.ok && (testResult.pgDumpVersion || testResult.pgRestoreVersion) && (
                <Typography variant="body2" color="text.secondary">
                  pg_dump {testResult.pgDumpVersion ?? 'unknown'} / pg_restore {testResult.pgRestoreVersion ?? 'unknown'}
                  {' '}— {testResult.compatible ? 'versions compatible' : 'version mismatch, may cause restore failures'}
                </Typography>
              )}
            </Alert>
          )}

          {saveMessage && <Alert severity="info">{saveMessage}</Alert>}

          <Divider />

          <Typography variant="subtitle2" fontWeight={700}>Currently in effect</Typography>
          {isLoading ? (
            <CircularProgress size={20} />
          ) : settings ? (
            <List dense>
              <ListItem disableGutters>
                <ListItemText
                  primary={`pg_dump: ${settings.effective.pgDumpPath}`}
                  secondary={`Source: ${sourceLabel(settings.effective.pgDumpSource)}`}
                />
              </ListItem>
              <ListItem disableGutters>
                <ListItemText
                  primary={`pg_restore: ${settings.effective.pgRestorePath}`}
                  secondary={`Source: ${sourceLabel(settings.effective.pgRestoreSource)}`}
                />
              </ListItem>
              {settings.lastTestedAt && (
                <ListItem disableGutters>
                  <ListItemText
                    primary={`Last test: ${settings.lastTestStatus === 'success' ? 'Passed' : 'Failed'}`}
                    secondary={`${new Date(settings.lastTestedAt).toLocaleString()} — ${settings.lastTestMessage ?? ''}`}
                  />
                </ListItem>
              )}
            </List>
          ) : null}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

function sourceLabel(source: 'configured' | 'detected' | 'env' | 'default'): string {
  switch (source) {
    case 'configured': return 'Saved in Settings (highest priority)';
    case 'detected': return 'Cached auto-detected installation';
    case 'env': return 'Legacy PG_DUMP_PATH/PG_RESTORE_PATH environment variable';
    case 'default': return 'System PATH (bare "pg_dump"/"pg_restore" command)';
    default: return source;
  }
}

// ── Encryption tab ────────────────────────────────────────────────────────

function EncryptionTab() {
  const { data: schedules } = useBackupSchedules();
  const activeSchedules = (schedules || []).filter((s) => s.isActive);
  const encryptByDefaultSchedules = activeSchedules.filter((s) => s.encrypt).length;

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>Encryption & Compression Defaults</Typography>
        <Typography variant="body2">
          {encryptByDefaultSchedules} of {activeSchedules.length} active schedule(s) encrypt by default.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Compression (gzip) is applied to every backup archive automatically. Encryption uses AES-256 with a
          caller-supplied passphrase, set per backup/schedule in the Backup Wizard or Schedules page.
        </Typography>
      </CardContent>
    </Card>
  );
}

// ── General tab (retention, storage driver catalogue, notifications) ─────

function GeneralTab() {
  const router = useRouter();
  const { data: schedules } = useBackupSchedules();
  const { data: drivers } = useBackupStorageDrivers();
  const activeSchedules = (schedules || []).filter((s) => s.isActive);

  return (
    <>
      <Alert severity="info" sx={{ mb: 3 }}>
        Global retention/compression defaults are configured on the server (environment variables) and are not
        editable from this UI yet. Per-schedule retention is managed below and on the Schedules page. `pg_dump`/
        `pg_restore` binary paths have moved to the Database Tools tab.
      </Alert>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>Retention Policy (per schedule)</Typography>
              {activeSchedules.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No active schedules yet.</Typography>
              ) : (
                <List dense>
                  {activeSchedules.map((s) => (
                    <ListItem key={s.id} disableGutters>
                      <ListItemText
                        primary={s.name}
                        secondary={`Retention: ${s.retentionCount ? `${s.retentionCount} backups` : 'unset'}${s.retentionDays ? ` / ${s.retentionDays} days` : ''}`}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
              <Button size="small" sx={{ mt: 1 }} onClick={() => router.push(BACKUP_ROUTES.SCHEDULES)}>Manage Schedules</Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>Storage Drivers</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {(drivers || []).map((d) => (
                  <Chip key={d.driver} label={d.displayName} size="small" color={d.implemented ? 'success' : 'default'} variant={d.implemented ? 'filled' : 'outlined'} />
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>Notification Preferences</Typography>
              <Typography variant="body2" color="text.secondary">
                Backup lifecycle events (completed/failed, retention cleanup) are currently recorded via the audit
                log and server logs only. The backend's NotificationService is a patient-facing WhatsApp/SMS/Email
                channel and is not yet wired to admin alerts for backup events — this is a documented backend
                limitation, not a UI gap.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  );
}
