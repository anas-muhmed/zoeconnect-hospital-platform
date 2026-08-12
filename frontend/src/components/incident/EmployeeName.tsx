import React from 'react';
import { Typography, Skeleton, Tooltip, TypographyProps } from '@mui/material';
import { useEmployeeName } from '../../hooks/incident/use-employee';

interface EmployeeNameProps extends Omit<TypographyProps, 'children' | 'id'> {
  id?: string | null;
  /** Shown when id is empty/nil (e.g. optional assignee never set) */
  emptyLabel?: string;
}

export const EmployeeName: React.FC<EmployeeNameProps> = ({ id, emptyLabel = 'Unassigned', ...typographyProps }) => {
  const { name, isLoading, notFound } = useEmployeeName(id);

  if (!id) {
    return <Typography color="text.secondary" {...typographyProps}>{emptyLabel}</Typography>;
  }

  if (isLoading) {
    return <Skeleton width={120} height={20} />;
  }

  if (name) {
    return <Typography {...typographyProps}>{name}</Typography>;
  }

  // Not found (deleted user, unconfigured HIS, seed/placeholder data, etc.)
  // — fall back to a truncated id rather than hiding the field entirely.
  return (
    <Tooltip title={notFound ? `User ${id} could not be resolved` : id}>
      <Typography color="text.secondary" fontFamily="monospace" fontSize="0.85em" {...typographyProps}>
        {id.slice(0, 8)}…
      </Typography>
    </Tooltip>
  );
};
