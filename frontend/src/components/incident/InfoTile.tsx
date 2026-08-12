import React from 'react';
import { Box, Typography, alpha, useTheme } from '@mui/material';

interface InfoTileProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}

export const InfoTile: React.FC<InfoTileProps> = ({ label, value, icon }) => {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
      {icon && (
        <Box
          sx={{
            width: 32, height: 32, borderRadius: 1.5, flexShrink: 0, mt: 0.25,
            bgcolor: alpha(theme.palette.primary.main, 0.08), color: 'primary.main',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {icon}
        </Box>
      )}
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
        <Typography component="div" variant="body2" fontWeight={600} sx={{ wordBreak: 'break-word' }}>{value}</Typography>
      </Box>
    </Box>
  );
};
