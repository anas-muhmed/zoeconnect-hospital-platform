import React from 'react';
import { Box, Typography } from '@mui/material';

interface RiskBadgeProps {
  score?: number;
  level?: string;
  colorHex?: string;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ score, level, colorHex }) => {
  if (score === undefined || score === null) {
    return (
      <Typography variant="body2" color="text.secondary">
        Not Evaluated
      </Typography>
    );
  }

  const getFallbackColor = (l?: string) => {
    switch (l?.toUpperCase()) {
      case 'LOW': return '#4caf50';
      case 'MODERATE': return '#ffeb3b';
      case 'HIGH': return '#ff9800';
      case 'EXTREME': return '#f44336';
      default: return '#e0e0e0';
    }
  };

  const bgColor = colorHex || getFallbackColor(level);
  
  // Use black text for yellow/light backgrounds for contrast
  const textColor = (bgColor.toLowerCase() === '#ffeb3b' || bgColor.toLowerCase() === 'yellow') 
    ? '#000' 
    : '#fff';

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 1.5,
        py: 0.5,
        borderRadius: 4,
        bgcolor: bgColor,
        color: textColor,
        border: `1px solid ${bgColor !== '#e0e0e0' ? 'transparent' : '#ccc'}`,
      }}
    >
      <Typography variant="caption" fontWeight="bold">
        {score} - {level || 'Unknown'}
      </Typography>
    </Box>
  );
};
