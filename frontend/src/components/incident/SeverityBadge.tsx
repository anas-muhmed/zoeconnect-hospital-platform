import React from 'react';
import { Chip, ChipProps } from '@mui/material';

interface SeverityBadgeProps extends Omit<ChipProps, 'color' | 'label'> {
  level: string; // e.g. 'Low', 'Medium', 'High', 'Sentinel'
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ level, ...props }) => {
  const getProps = (l?: string): { color: ChipProps['color']; sx?: any } => {
    switch (l?.toUpperCase()) {
      case 'MINOR':
      case 'LOW':
        return { color: 'success' };
      case 'MODERATE':
      case 'MEDIUM':
        return { color: 'warning' };
      case 'MAJOR':
      case 'HIGH':
        return { color: 'error' };
      case 'CRITICAL':
      case 'SENTINEL':
        // Standard error color, but dark red/black if we want it to stand out more.
        return { color: 'error', sx: { bgcolor: '#b71c1c', color: 'white' } };
      default:
        return { color: 'default' };
    }
  };

  const { color, sx } = getProps(level);

  return (
    <Chip
      label={level}
      color={color}
      size="small"
      sx={{ fontWeight: 'bold', ...sx }}
      {...props}
    />
  );
};
