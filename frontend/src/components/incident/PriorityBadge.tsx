import React from 'react';
import { Chip, ChipProps } from '@mui/material';

interface PriorityBadgeProps extends Omit<ChipProps, 'color' | 'label'> {
  level: string; // 'Low', 'Medium', 'High', 'Critical'
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ level, ...props }) => {
  const getProps = (l: string): { color: ChipProps['color']; variant: ChipProps['variant'] } => {
    switch (l.toUpperCase()) {
      case 'CRITICAL': return { color: 'error', variant: 'filled' };
      case 'HIGH': return { color: 'warning', variant: 'filled' };
      case 'MEDIUM': return { color: 'primary', variant: 'outlined' };
      case 'LOW': return { color: 'default', variant: 'outlined' };
      default: return { color: 'default', variant: 'outlined' };
    }
  };

  const { color, variant } = getProps(level);

  return (
    <Chip
      label={level}
      color={color}
      variant={variant}
      size="small"
      {...props}
    />
  );
};
