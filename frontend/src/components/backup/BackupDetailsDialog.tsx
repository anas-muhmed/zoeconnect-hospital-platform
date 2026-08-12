import React from 'react';
import { DialogTitle, DialogContent, DialogActions, Button, Box, Typography, Chip, Divider, LinearProgress } from '@mui/material';
import ResponsiveDialog from '../ResponsiveDialog';
import { format } from 'date-fns';
import { BackupJob } from '../../types/backup.types';
import { BackupStatusChip } from './BackupStatusChip';
import { formatBytes, formatDuration, getBackupTypeLabel, getModuleLabel } from '../../lib/utils/backup-formatters';
import { useBackup } from '../../hooks/backup/use-backup';

interface BackupDetailsDialogProps {
  jobId: string | null;
  onClose: () => void;
}

export const BackupDetailsDialog: React.FC<BackupDetailsDialogProps> = ({ jobId, onClose }) => {
  const { data: job } = useBackup(jobId || undefined);

  return (
    <ResponsiveDialog open={!!jobId} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Backup Details</DialogTitle>
      <DialogContent>
        {!job ? (
          <Typography color="text.secondary">Loading…</Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <Row label="ID" value={job.id} />
            <Row label="Type" value={getBackupTypeLabel(job.type)} />
            <Row label="Status" value={<BackupStatusChip status={job.status} />} />
            {(job.status === 'running' || job.status === 'pending' || job.status === 'verifying') && (
              <Box>
                <LinearProgress variant="determinate" value={job.progress} sx={{ borderRadius: 1, height: 8 }} />
                <Typography variant="caption" color="text.secondary">{job.progress}% complete</Typography>
              </Box>
            )}
            <Row label="Modules" value={
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {job.modules.map((m) => <Chip key={m} label={getModuleLabel(m)} size="small" />)}
              </Box>
            } />
            <Divider />
            <Row label="Created" value={format(new Date(job.createdAt), 'PPpp')} />
            <Row label="Started" value={job.startedAt ? format(new Date(job.startedAt), 'PPpp') : '—'} />
            <Row label="Completed" value={job.completedAt ? format(new Date(job.completedAt), 'PPpp') : '—'} />
            <Row label="Duration" value={formatDuration(job.durationMs)} />
            <Divider />
            <Row label="Size (raw)" value={formatBytes(job.sizeBytes)} />
            <Row label="Size (compressed)" value={formatBytes(job.compressedSizeBytes)} />
            <Row label="Compression Ratio" value={job.compressionRatio ? `${(Number(job.compressionRatio) * 100).toFixed(1)}%` : '—'} />
            <Row label="File Count" value={String(job.fileCount)} />
            <Row label="Database Size" value={formatBytes(job.databaseSizeBytes)} />
            <Row label="Encrypted" value={job.encrypted ? 'Yes (AES-256)' : 'No'} />
            <Row label="Checksum (SHA-256)" value={job.checksumSha256 ? <code style={{ fontSize: 11 }}>{job.checksumSha256}</code> : '—'} />
            <Row label="App Version" value={job.appVersion || '—'} />
            <Row label="DB Version" value={job.dbVersion || '—'} />
            {job.errorMessage && <Row label="Error" value={<Typography color="error.main" variant="body2">{job.errorMessage}</Typography>} />}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </ResponsiveDialog>
  );
};

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
    <Typography variant="body2" color="text.secondary" sx={{ width: 160, flexShrink: 0 }}>{label}</Typography>
    <Box sx={{ flex: 1, minWidth: 0, wordBreak: 'break-all' }}>
      {typeof value === 'string' ? <Typography variant="body2" fontWeight={600}>{value}</Typography> : value}
    </Box>
  </Box>
);
