import React from 'react';
import { Box, Typography, LinearProgress, Stack } from '@mui/material';

interface NearMissRatioGaugeProps {
  total: number;
  nearMiss: number;
  actualIncidents: number;
  ratio: number;
}

export const NearMissRatioGauge: React.FC<NearMissRatioGaugeProps> = ({ total, nearMiss, actualIncidents, ratio }) => {
  const pct = Math.round(ratio * 100);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
        <Typography variant="h3" fontWeight={800}>{pct}%</Typography>
        <Typography variant="body2" color="text.secondary">of reports were near-misses (no harm reached)</Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{ height: 10, borderRadius: 5, mb: 2, bgcolor: 'error.light', '& .MuiLinearProgress-bar': { bgcolor: 'success.main' } }}
      />
      <Stack direction="row" spacing={3}>
        <Box>
          <Typography variant="caption" color="text.secondary">Total Reports</Typography>
          <Typography variant="h6" fontWeight={700}>{total}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">Near Misses</Typography>
          <Typography variant="h6" fontWeight={700} color="success.main">{nearMiss}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">Actual Incidents</Typography>
          <Typography variant="h6" fontWeight={700} color="error.main">{actualIncidents}</Typography>
        </Box>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        A higher near-miss ratio generally indicates healthier safety-reporting culture — staff report close calls before harm occurs.
      </Typography>
    </Box>
  );
};
