import React from 'react';
import { Box, Card, Typography, CircularProgress } from '@mui/material';

interface DashboardPanelProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  height?: number | string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyText?: string;
  children: React.ReactNode;
}

export const DashboardPanel: React.FC<DashboardPanelProps> = ({
  title, subtitle, action, height = 'auto', isLoading, isEmpty, emptyText = 'No data available.', children,
}) => {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 2.5, pt: 2.5, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
          {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
        </Box>
        {action}
      </Box>
      <Box sx={{ px: 2.5, pb: 2.5, flexGrow: 1, minHeight: 0, height: typeof height === 'number' ? height : undefined }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 120 }}>
            <CircularProgress size={28} />
          </Box>
        ) : isEmpty ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 120 }}>
            <Typography color="text.secondary" variant="body2">{emptyText}</Typography>
          </Box>
        ) : (
          children
        )}
      </Box>
    </Card>
  );
};
