'use client';

import React from 'react';
import { Box, Grid, Alert, Chip, Button, LinearProgress, Typography } from '@mui/material';
import { useRouter } from 'next/navigation';
import BackupIcon from '@mui/icons-material/Backup';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import StorageIcon from '@mui/icons-material/Storage';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import HistoryIcon from '@mui/icons-material/History';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import AddIcon from '@mui/icons-material/Add';
import PageHeader from '../../../components/PageHeader';
import { StatCard } from '../../../components/incident/StatCard';
import { DashboardPanel } from '../../../components/incident/DashboardPanel';
import { BackupStatusChip } from '../../../components/backup/BackupStatusChip';
import { RestoreStatusChip } from '../../../components/backup/RestoreStatusChip';
import { useBackupHealth, useBackups } from '../../../hooks/backup/use-backup';
import { useRestores } from '../../../hooks/backup/use-restore';
import { useBackupSchedules } from '../../../hooks/backup/use-backup-schedules';
import { formatBytes, getBackupTypeLabel } from '../../../lib/utils/backup-formatters';
import { format, formatDistanceToNow } from 'date-fns';
import { useAuthStore } from '../../../lib/store/auth.store';
import { BACKUP_PERMISSIONS } from '../../../lib/constants/backup-permissions';
import { BACKUP_ROUTES } from '../../../lib/constants/backup-routes';

export default function BackupDashboardPage() {
  const router = useRouter();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission(BACKUP_PERMISSIONS.CREATE);

  const { data: health, isLoading: healthLoading } = useBackupHealth();
  const { data: backups, isLoading: backupsLoading } = useBackups({ page: 1, limit: 50 });
  const { data: restores, isLoading: restoresLoading } = useRestores({ page: 1, limit: 10 });
  const { data: schedules, isLoading: schedulesLoading } = useBackupSchedules();

  if (!hasPermission(BACKUP_PERMISSIONS.READ)) {
    return <Alert severity="warning" sx={{ m: 3 }}>You don't have permission to view Backup &amp; Restore.</Alert>;
  }

  const jobs = backups?.data || [];
  const lastCompleted = jobs.find((j) => j.status === 'completed');
  const runningJobs = jobs.filter((j) => j.status === 'running' || j.status === 'pending');
  const failedJobs = jobs.filter((j) => j.status === 'failed');
  const completedCount = jobs.filter((j) => j.status === 'completed').length;
  const successRate = jobs.length > 0 ? Math.round((completedCount / jobs.length) * 100) : 100;
  const totalStorageUsed = jobs.reduce((sum, j) => sum + Number(j.compressedSizeBytes || j.sizeBytes || 0), 0);

  const activeSchedules = (schedules || []).filter((s) => s.isActive);
  const nextScheduled = activeSchedules
    .filter((s) => s.nextRunAt)
    .sort((a, b) => new Date(a.nextRunAt as string).getTime() - new Date(b.nextRunAt as string).getTime())[0];

  const retentionAtRisk = jobs.filter((j) => j.expiresAt && new Date(j.expiresAt).getTime() < Date.now() + 3 * 24 * 60 * 60 * 1000 && j.status === 'completed').length;

  const restoreList = restores?.data || [];

  return (
    <Box>
      <PageHeader
        title="Backup & Restore"
        subtitle="Backup health, storage, and restore history"
        icon={<BackupIcon />}
        actions={canCreate && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => router.push(BACKUP_ROUTES.WIZARD)}>
            Create Backup
          </Button>
        )}
      />

      <Grid container spacing={2.5}>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <StatCard
            label="Last Backup"
            value={lastCompleted ? formatDistanceToNow(new Date(lastCompleted.createdAt), { addSuffix: true }) : 'None yet'}
            icon={<HistoryIcon fontSize="small" />}
            color="primary"
            helperText={lastCompleted ? getBackupTypeLabel(lastCompleted.type) : undefined}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <StatCard
            label="Next Scheduled"
            value={nextScheduled?.nextRunAt ? formatDistanceToNow(new Date(nextScheduled.nextRunAt), { addSuffix: true }) : 'None scheduled'}
            icon={<EventAvailableIcon fontSize="small" />}
            color="info"
            helperText={nextScheduled?.name}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <StatCard
            label="Storage Used"
            value={formatBytes(totalStorageUsed)}
            icon={<StorageIcon fontSize="small" />}
            color="secondary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <StatCard
            label="Running Jobs"
            value={runningJobs.length}
            icon={<PlayCircleOutlineIcon fontSize="small" />}
            color={runningJobs.length > 0 ? 'info' : 'success'}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <StatCard
            label="Failed Jobs"
            value={failedJobs.length}
            icon={<ErrorOutlineIcon fontSize="small" />}
            color={failedJobs.length > 0 ? 'error' : 'success'}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          <StatCard
            label="Success Rate"
            value={`${successRate}%`}
            icon={<DoneAllIcon fontSize="small" />}
            color={successRate >= 90 ? 'success' : successRate >= 70 ? 'warning' : 'error'}
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <DashboardPanel
            title="Backup Subsystem Health"
            subtitle="Storage providers & recent failures"
            isLoading={healthLoading}
          >
            {health && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {health.storageProviders.map((p) => (
                    <Chip
                      key={p.driver}
                      label={`${p.displayName}${p.implemented ? '' : ' (coming soon)'}`}
                      color={p.implemented ? 'success' : 'default'}
                      size="small"
                      variant={p.implemented ? 'filled' : 'outlined'}
                    />
                  ))}
                </Box>
                <Typography variant="body2">
                  Recent failed jobs: <strong>{health.recentFailures}</strong>
                </Typography>
                <Typography variant="body2">
                  Oldest unexpired backup: <strong>{health.oldestUnexpiredBackup ? format(new Date(health.oldestUnexpiredBackup), 'PP') : '—'}</strong>
                </Typography>
                <Typography variant="body2">
                  Retention: <strong>{retentionAtRisk}</strong> backup(s) expiring within 3 days
                </Typography>
              </Box>
            )}
          </DashboardPanel>
        </Grid>

        <Grid item xs={12} md={6}>
          <DashboardPanel
            title="Restore History"
            subtitle="Most recent restore jobs"
            isLoading={restoresLoading}
            isEmpty={restoreList.length === 0}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {restoreList.slice(0, 5).map((r) => (
                <Box key={r.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                  <Typography variant="body2">
                    {r.mode.replace(/_/g, ' ')} — {format(new Date(r.createdAt), 'PP p')}
                  </Typography>
                  <RestoreStatusChip status={r.status} />
                </Box>
              ))}
            </Box>
          </DashboardPanel>
        </Grid>

        {runningJobs.length > 0 && (
          <Grid item xs={12}>
            <DashboardPanel title="Running Jobs" subtitle="Live progress">
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {runningJobs.map((j) => (
                  <Box key={j.id}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">{getBackupTypeLabel(j.type)} — {j.id.slice(0, 8)}</Typography>
                      <Typography variant="caption" color="text.secondary">{j.progress}%</Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={j.progress} sx={{ borderRadius: 1, height: 6 }} />
                  </Box>
                ))}
              </Box>
            </DashboardPanel>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
