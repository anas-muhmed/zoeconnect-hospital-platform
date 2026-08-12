'use client';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { alpha, useTheme } from '@mui/material/styles';
import type { BillingCycle } from '@/lib/api/billing.api';

export interface BillingCycleSwitchProps {
  value: BillingCycle;
  onChange: (v: BillingCycle) => void;
  yearlyDiscountPercent?: number;
}

export default function BillingCycleSwitch({ value, onChange, yearlyDiscountPercent = 20 }: BillingCycleSwitchProps) {
  const theme = useTheme();

  const Option = ({ cycle, label, badge }: { cycle: BillingCycle; label: string; badge?: string }) => {
    const active = value === cycle;
    return (
      <ButtonBase
        onClick={() => onChange(cycle)}
        aria-pressed={active}
        sx={{
          px: 3, py: 1.25, borderRadius: 999, fontWeight: 700, fontSize: 14,
          display: 'flex', alignItems: 'center', gap: 1,
          color: active ? '#fff' : theme.palette.text.secondary,
          background: active
            ? `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`
            : 'transparent',
          transition: 'all 0.18s ease',
        }}
      >
        {label}
        {badge && (
          <Chip
            size="small"
            label={badge}
            sx={{
              height: 20, fontSize: 11, fontWeight: 700,
              bgcolor: active ? 'rgba(255,255,255,0.25)' : alpha(theme.palette.success.main, 0.12),
              color: active ? '#fff' : theme.palette.success.dark,
            }}
          />
        )}
      </ButtonBase>
    );
  };

  return (
    <Box
      sx={{
        display: 'inline-flex', p: 0.5, borderRadius: 999,
        bgcolor: alpha(theme.palette.text.primary, 0.04),
        border: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Option cycle="MONTHLY" label="Monthly" />
      <Option cycle="YEARLY" label="Yearly" badge={`Save ${yearlyDiscountPercent}%`} />
    </Box>
  );
}
