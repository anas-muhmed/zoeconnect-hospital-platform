import React from 'react';
import { Chip, ChipProps } from '@mui/material';
import { RestoreStatus } from '../../types/backup.types';
import { getRestoreStatusColor, getRestoreStatusLabel } from '../../lib/utils/backup-formatters';

interface RestoreStatusChipProps extends Omit<ChipProps, 'color' | 'label'> {
  status: RestoreStatus;
}

export const RestoreStatusChip: React.FC<RestoreStatusChipProps> = ({ status, ...props }) => (
  <Chip label={getRestoreStatusLabel(status)} color={getRestoreStatusColor(status)} size="small" variant="filled" {...props} />
);
