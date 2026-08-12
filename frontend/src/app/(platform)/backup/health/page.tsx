'use client';

import React from 'react';
import { Box, Alert, Grid, Card, CardContent, Typography, Chip, LinearProgress, CircularProgress, Divider } from '@mui/material';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import { format } from 'date-fns';
import PageHeader from '../../../../components/PageHeader';
import { StatCard } from '../../../../components/incident/StatCard';
import { useAuthStore } from '../../../../lib/store/auth.store';
import { BACKUP_PERMISSIONS } from '../../../../lib/constants/backup-permissions';
import { useBackupHealth, useBackups } from '../../../../hooks/backup/use-backup';
import { useRestores } from '../../../../hooks/backup/use-restore';
import { BackupStatusChip } from '../../../../components/backup/BackupStatusChip';
import { RestoreStatusChip } from '../../../../components/backup/RestoreStatusChip';
import { formatBytes, getBackupTypeLabel } from '../../../../lib/utils/backup-formatters';

export default function BackupHealthPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const { data: health, isLoading: healthLoading } = useBackupHealth();
  const { data: backups, isLoading: backupsLoading } = useBackups({ page: 1, limit: 100 });
  const { data: restores, isLoading: restoresLoading } = useRestores({ page: 1, limit: 20 });

  if (!hasPermission(BACKUP_PERMISSIONS.READ)) {
    return <Alert severity="warning" sx={{ m: 3 }}>You don't have permission to view backup health.</Alert>;
  }

  const jobs = backups?.data || [];
  const running = jobs.filter((j) => j.status === 'running' || j.status === 'pending' || j.status === 'verifying');
  const failed = jobs.filter((j) => j.status === 'failed');
  const restoreJobs = restores?.data || [];
  const activeRestores = restoreJobs.filter((r) => ['pending', 'validating', 'running'].includes(r.status));

  return (
    <Box>
      <PageHeader title="Backup Health" subtitle="Job queue, failures, and storage capacity" icon={<HealthAndSafetyIcon />} />

      <Grid container spacing={2.5} sx={{ mb: 1 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Jobs Running" value={running.length} color={running.length > 0 ? 'info' : 'success'} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Jobs Failed" value={failed.length} color={failed.length > 0 ? 'error' : 'success'} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Active Restores" value={activeRestores.length} color={activeRestores.length > 0 ? 'warning' : 'success'} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Recent Failures (health)" value={health?.recentFailures ?? 0} color="error" />
        </Grid>
      </Grid>

      <Grid container spacing={2.5} sx={{ mt: 1 }}>
        <Grid item xs={12} md={6}>
          <Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>Job Queue — Running / Pending</Typography>
              {backupsLoading ? <CircularProgress size={20} /> : running.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No active jobs.</Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {running.map((j) => (
                    <Box key={j.id}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2">{getBackupTypeLabel(j.type)} — {j.id.slice(0, 8)}</Typography>
                        <BackupStatusChip status={j.status} />
                      </Box>
                      <LinearProgress variant="determinate" value={j.progress} sx={{ borderRadius: 1, height: 6, mt: 0.5 }} />
                    </Box>
                  ))}
                </Box>
              )}
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>Failed Jobs</Typography>
              {failed.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No failed jobs.</Typography>
              ) : (
                failed.slice(0, 10).map((j) => (
                  <Box key={j.id} sx={{ mb: 1 }}>
                    <Typography variant="body2">{getBackupTypeLabel(j.type)} — {j.id.slice(0, 8)} ({format(new Date(j.createdAt), 'PPp')})</Typography>
                    {j.errorMessage && <Typography variant="caption" color="error.main">{j.errorMessage}</Typography>}
                  </Box>
                ))
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>Storage Providers</Typography>
              {healthLoading ? <CircularProgress size={20} /> : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {(health?.storageProviders || []).map((p) => (
                    <Box key={p.driver} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2">{p.displayName}</Typography>
                      <Chip label={p.implemented ? 'Operational' : 'Not implemented'} color={p.implemented ? 'success' : 'default'} size="small" />
                    </Box>
                  ))}
                </Box>
              )}
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2">
                Oldest unexpired backup: <strong>{health?.oldestUnexpiredBackup ? format(new Date(health.oldestUnexpiredBackup), 'PPp') : '—'}</strong>
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                Total tracked backups: <strong>{jobs.length}</strong>, total size: <strong>{formatBytes(jobs.reduce((s, j) => s + Number(j.compressedSizeBytes || j.sizeBytes || 0), 0))}</strong>
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>Restore Jobs</Typography>
              {restoresLoading ? <CircularProgress size={20} /> : restoreJobs.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No restore jobs yet.</Typography>
              ) : (
                restoreJobs.slice(0, 10).map((r) => (
                  <Box key={r.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                    <Typography variant="body2">{r.mode.replace(/_/g, ' ')} — {format(new Date(r.createdAt), 'PPp')}</Typography>
                    <RestoreStatusChip status={r.status} />
                  </Box>
                ))
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
