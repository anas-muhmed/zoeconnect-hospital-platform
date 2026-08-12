import React from 'react';
import { Chip, ChipProps } from '@mui/material';
import { IncidentStatus } from '../../types/incident.types';
import { getStatusColor, getStatusLabel } from '../../lib/utils/incident-formatters';

interface IncidentStatusChipProps extends Omit<ChipProps, 'color' | 'label'> {
  status: IncidentStatus;
}

export const IncidentStatusChip: React.FC<IncidentStatusChipProps> = ({ status, ...props }) => {
  return (
    <Chip
      label={getStatusLabel(status)}
      color={getStatusColor(status)}
      size="small"
      variant="filled"
      {...props}
    />
  );
};
