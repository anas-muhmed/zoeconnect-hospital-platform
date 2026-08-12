'use client';

import React, { Suspense, useEffect, useState } from 'react';
import {
  Box, Alert, Stepper, Step, StepLabel, Card, CardContent, Typography, RadioGroup,
  FormControlLabel, Radio, Checkbox, FormGroup, TextField, Button, LinearProgress,
  CircularProgress, List, ListItemButton, ListItemText,
} from '@mui/material';
import { useRouter, useSearchParams } from 'next/navigation';
import RestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PageHeader from '../../../../components/PageHeader';
import { useAuthStore } from '../../../../lib/store/auth.store';
import { BACKUP_PERMISSIONS } from '../../../../lib/constants/backup-permissions';
import { BACKUP_ROUTES } from '../../../../lib/constants/backup-routes';
import { useBackups, useVerifyBackup } from '../../../../hooks/backup/use-backup';
import { useCreateRestore, useRestoreJob } from '../../../../hooks/backup/use-restore';
import { RESTORE_MODES, RestoreMode, BackupModuleName, BACKUP_MODULES } from '../../../../types/backup.types';
import { BackupStatusChip } from '../../../../components/backup/BackupStatusChip';
import { RestoreStatusChip } from '../../../../components/backup/RestoreStatusChip';
import { formatBytes, getBackupTypeLabel, getModuleLabel, getRestoreModeLabel } from '../../../../lib/utils/backup-formatters';
import { format } from 'date-fns';

const STEPS = ['Choose Backup', 'Verify', 'Restore Mode', 'Confirmation', 'Restore', 'Summary'];
const CONFIRM_PHRASE = 'RESTORE';

export default function RestoreWizardPageWrapper() {
  return <Suspense fallback={null}><RestoreWizardPage /></Suspense>;
}

function RestoreWizardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canRestore = hasPermission(BACKUP_PERMISSIONS.RESTORE);

  const [activeStep, setActiveStep] = useState(0);
  const [backupId, setBackupId] = useState<string>(searchParams.get('backupId') || '');
  const [verifyState, setVerifyState] = useState<{ valid: boolean; reason?: string } | null>(null);
  const [mode, setMode] = useState<RestoreMode>('entire_application');
  const [selectedModules, setSelectedModules] = useState<BackupModuleName[]>([...BACKUP_MODULES]);
  const [confirmText, setConfirmText] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [restoreJobId, setRestoreJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: backupsResponse, isLoading: backupsLoading } = useBackups({ page: 1, limit: 50, status: 'completed' });
  const verifyMutation = useVerifyBackup();
  const createRestoreMutation = useCreateRestore();
  const { data: restoreJob } = useRestoreJob(restoreJobId || undefined);

  const backups = (backupsResponse?.data || []).filter((b) => b.status === 'completed');
  const selectedBackup = backups.find((b) => b.id === backupId);

  useEffect(() => {
    if (restoreJob && ['completed', 'failed', 'cancelled', 'rolled_back'].includes(restoreJob.status)) {
      setActiveStep(5);
    }
  }, [restoreJob]);

  if (!canRestore) {
    return <Alert severity="warning" sx={{ m: 3 }}>You don't have permission to restore backups.</Alert>;
  }

  const handleVerify = async () => {
    setError(null);
    try {
      const result = await verifyMutation.mutateAsync(backupId);
      setVerifyState({ valid: result.valid, reason: result.reason });
    } catch (err: any) {
      setVerifyState({ valid: false, reason: err?.response?.data?.message || 'Verification failed.' });
    }
  };

  const handleStartRestore = async () => {
    setError(null);
    try {
      const job = await createRestoreMutation.mutateAsync({
        backupId,
        mode,
        modules: mode === 'selected_modules' ? selectedModules : undefined,
        confirm: true,
        passphrase: selectedBackup?.encrypted ? passphrase : undefined,
      });
      setRestoreJobId(job.id);
      setActiveStep(4);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to start restore.');
    }
  };

  const canProceedFromStep = (step: number): boolean => {
    if (step === 0) return !!backupId;
    if (step === 1) return !!verifyState?.valid;
    if (step === 2) return mode !== 'selected_modules' || selectedModules.length > 0;
    if (step === 3) return confirmText === CONFIRM_PHRASE && confirmChecked && (!selectedBackup?.encrypted || passphrase.length > 0);
    return true;
  };

  const toggleModule = (mod: BackupModuleName) => {
    setSelectedModules((prev) => prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]);
  };

  return (
    <Box>
      <PageHeader title="Restore Wizard" subtitle="Restore data from an existing backup — this is a destructive action" icon={<RestoreIcon />} back={BACKUP_ROUTES.BACKUPS} />

      <Stepper activeStep={activeStep} sx={{ mb: 3 }} alternativeLabel>
        {STEPS.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 3 }}>

          {activeStep === 0 && (
            <Box>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>Choose a backup to restore from</Typography>
              {backupsLoading ? <CircularProgress size={24} /> : backups.length === 0 ? (
                <Alert severity="info">No completed backups available. Create a backup first.</Alert>
              ) : (
                <List sx={{ maxHeight: 400, overflowY: 'auto' }}>
                  {backups.map((b) => (
                    <ListItemButton
                      key={b.id}
                      selected={backupId === b.id}
                      onClick={() => { setBackupId(b.id); setVerifyState(null); }}
                      sx={{ borderRadius: 2, mb: 0.5, border: '1px solid', borderColor: backupId === b.id ? 'primary.main' : 'divider' }}
                    >
                      <ListItemText
                        primary={`${getBackupTypeLabel(b.type)} — ${b.id.slice(0, 8)}`}
                        secondary={`${format(new Date(b.createdAt), 'PPp')} · ${formatBytes(b.compressedSizeBytes || b.sizeBytes)}${b.encrypted ? ' · Encrypted' : ''}`}
                      />
                      <BackupStatusChip status={b.status} />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Box>
          )}

          {activeStep === 1 && (
            <Box>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>Verify backup integrity</Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Confirms the archive's SHA-256 checksum matches what was recorded at backup time.
              </Typography>
              <Button variant="outlined" onClick={handleVerify} disabled={verifyMutation.isPending} sx={{ mt: 1, mb: 2 }}>
                {verifyMutation.isPending ? 'Verifying…' : 'Run Verification'}
              </Button>
              {verifyState && (
                <Alert severity={verifyState.valid ? 'success' : 'error'}>
                  {verifyState.valid ? 'Checksum verified — archive is intact.' : `Verification failed: ${verifyState.reason}`}
                </Alert>
              )}
            </Box>
          )}

          {activeStep === 2 && (
            <Box>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>Select restore mode</Typography>
              <RadioGroup value={mode} onChange={(e) => setMode(e.target.value as RestoreMode)}>
                {RESTORE_MODES.map((m) => (
                  <FormControlLabel key={m} value={m} control={<Radio />} label={getRestoreModeLabel(m)} />
                ))}
              </RadioGroup>
              {mode === 'selected_modules' && (
                <Box sx={{ mt: 2, pl: 2 }}>
                  <Typography variant="body2" gutterBottom>Modules to restore</Typography>
                  <FormGroup>
                    {BACKUP_MODULES.map((mod) => (
                      <FormControlLabel
                        key={mod}
                        control={<Checkbox checked={selectedModules.includes(mod)} onChange={() => toggleModule(mod)} />}
                        label={getModuleLabel(mod)}
                      />
                    ))}
                  </FormGroup>
                </Box>
              )}
              {selectedBackup?.encrypted && (
                <TextField
                  fullWidth
                  sx={{ mt: 2 }}
                  type="password"
                  label="Backup Passphrase"
                  helperText="Required — this backup archive is encrypted."
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
              )}
            </Box>
          )}

          {activeStep === 3 && (
            <Box>
              {/*
                TODO(restore-readiness): call useRestoreReadiness(selectedBackup?.id)
                (frontend/src/hooks/backup/use-restore.ts) here and render its
                report (disk space / DB reachability / client tools / archive
                integrity / version compatibility) above this confirmation
                step, so an admin sees the pre-restore readiness check before
                confirming -- the backend endpoint
                (GET /backups/:id/restore-readiness, RestoreService.checkRestoreReadiness())
                is fully implemented; only this wizard step's wiring is
                pending, left out of this round to avoid scope creep on an
                already large change.
              */}
              <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
                This is a destructive action. A pre-restore safety snapshot will be taken automatically, but existing
                data covered by the selected restore mode ({getRestoreModeLabel(mode)}) will be overwritten.
              </Alert>
              <Typography variant="body2" gutterBottom>
                Type <strong>{CONFIRM_PHRASE}</strong> to confirm you understand this action is destructive.
              </Typography>
              <TextField
                fullWidth
                sx={{ mt: 1, mb: 2 }}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_PHRASE}
              />
              <FormControlLabel
                control={<Checkbox checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />}
                label="I understand this action cannot be undone and may require an application restart."
              />
            </Box>
          )}

          {activeStep === 4 && (
            <Box>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>Restore in progress</Typography>
              {restoreJob ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <RestoreStatusChip status={restoreJob.status} />
                  <LinearProgress variant="determinate" value={restoreJob.progress} sx={{ borderRadius: 1, height: 8 }} />
                  <Typography variant="caption" color="text.secondary">{restoreJob.progress}% complete</Typography>
                  {restoreJob.versionCompatibility && (
                    <Typography variant="body2">Version compatibility: <strong>{restoreJob.versionCompatibility}</strong></Typography>
                  )}
                </Box>
              ) : (
                <CircularProgress size={24} />
              )}
            </Box>
          )}

          {activeStep === 5 && (
            <Box>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {restoreJob?.status === 'completed' ? <CheckCircleIcon color="success" /> : <WarningAmberIcon color="error" />}
                Restore Summary
              </Typography>
              {restoreJob && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <RestoreStatusChip status={restoreJob.status} />
                  <Typography variant="body2">Mode: {getRestoreModeLabel(restoreJob.mode)}</Typography>
                  <Typography variant="body2">Restart required: {restoreJob.restartRequired ? 'Yes' : 'No'}</Typography>
                  <Typography variant="body2">Rolled back: {restoreJob.rolledBack ? 'Yes' : 'No'}</Typography>
                  {restoreJob.errorMessage && <Alert severity="error">{restoreJob.errorMessage}</Alert>}
                  {restoreJob.validationReport ? (
                    <Box component="pre" sx={{ fontSize: 12, bgcolor: 'action.hover', p: 2, borderRadius: 2, overflowX: 'auto' }}>
                      {JSON.stringify(restoreJob.validationReport, null, 2)}
                    </Box>
                  ) : null}
                </Box>
              )}
              <Button variant="contained" sx={{ mt: 2 }} onClick={() => router.push(BACKUP_ROUTES.BACKUPS)}>
                Back to Backups
              </Button>
            </Box>
          )}

        </CardContent>
      </Card>

      {activeStep < 4 && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
          <Button disabled={activeStep === 0} onClick={() => setActiveStep((s) => s - 1)}>Back</Button>
          {activeStep === 3 ? (
            <Button
              variant="contained"
              color="error"
              disabled={!canProceedFromStep(3) || createRestoreMutation.isPending}
              onClick={handleStartRestore}
              startIcon={createRestoreMutation.isPending ? <CircularProgress size={16} /> : <RestoreIcon />}
            >
              Start Restore
            </Button>
          ) : (
            <Button variant="contained" disabled={!canProceedFromStep(activeStep)} onClick={() => setActiveStep((s) => s + 1)}>
              Next
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}
