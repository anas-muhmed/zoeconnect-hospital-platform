import React from 'react';
import { Chip, ChipProps } from '@mui/material';
import { BackupStatus } from '../../types/backup.types';
import { getBackupStatusColor, getBackupStatusLabel } from '../../lib/utils/backup-formatters';

interface BackupStatusChipProps extends Omit<ChipProps, 'color' | 'label'> {
  status: BackupStatus;
}

export const BackupStatusChip: React.FC<BackupStatusChipProps> = ({ status, ...props }) => (
  <Chip label={getBackupStatusLabel(status)} color={getBackupStatusColor(status)} size="small" variant="filled" {...props} />
);
