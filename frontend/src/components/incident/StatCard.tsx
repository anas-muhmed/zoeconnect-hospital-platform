import React from 'react';
import { Box, Card, Typography, useTheme, alpha } from '@mui/material';

export type StatCardColor = 'primary' | 'warning' | 'error' | 'success' | 'info' | 'secondary';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  color?: StatCardColor;
  helperText?: string;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color = 'primary', helperText, onClick }) => {
  const theme = useTheme();
  const mainColor = theme.palette[color].main;

  return (
    <Card
      variant="outlined"
      onClick={onClick}
      sx={{
        height: '100%',
        p: 2.5,
        borderRadius: 3,
        borderColor: alpha(mainColor, 0.25),
        background: `linear-gradient(180deg, ${alpha(mainColor, 0.06)} 0%, rgba(255,255,255,0) 60%)`,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s ease, transform 0.15s ease',
        '&:hover': onClick ? { boxShadow: 4, transform: 'translateY(-2px)' } : undefined,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>
          {label}
        </Typography>
        {icon && (
          <Box
            sx={{
              width: 36, height: 36, borderRadius: 2,
              bgcolor: alpha(mainColor, 0.14),
              color: mainColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
        )}
      </Box>
      <Typography variant="h3" fontWeight={800} sx={{ color: 'text.primary', letterSpacing: '-0.02em' }}>
        {value}
      </Typography>
      {helperText && (
        <Typography variant="caption" color="text.secondary">
          {helperText}
        </Typography>
      )}
    </Card>
  );
};
