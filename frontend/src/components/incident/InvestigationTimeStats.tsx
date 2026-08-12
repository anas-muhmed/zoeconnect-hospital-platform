import React from 'react';
import { Box, Typography, Grid } from '@mui/material';

interface InvestigationTimeStatsProps {
  avgHours?: number | string | null;
  minHours?: number | string | null;
  maxHours?: number | string | null;
  totalCompleted?: number | string | null;
}

function fmtHours(v?: number | string | null): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (n < 24) return `${n.toFixed(1)}h`;
  return `${(n / 24).toFixed(1)}d`;
}

export const InvestigationTimeStats: React.FC<InvestigationTimeStatsProps> = ({ avgHours, minHours, maxHours, totalCompleted }) => {
  const stats = [
    { label: 'Average', value: fmtHours(avgHours), color: 'primary.main' },
    { label: 'Fastest', value: fmtHours(minHours), color: 'success.main' },
    { label: 'Slowest', value: fmtHours(maxHours), color: 'error.main' },
    { label: 'Completed', value: totalCompleted ?? '0', color: 'text.primary' },
  ];

  return (
    <Grid container spacing={2}>
      {stats.map((s) => (
        <Grid item xs={6} key={s.label}>
          <Typography variant="caption" color="text.secondary">{s.label}</Typography>
          <Typography variant="h5" fontWeight={800} sx={{ color: s.color }}>{s.value}</Typography>
        </Grid>
      ))}
    </Grid>
  );
};
