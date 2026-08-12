'use client';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import type { Payment } from '@/lib/api/billing.api';

export interface SubscriptionTimelineProps {
  payments: Payment[];
}

const currency = (n: number, ccy: string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: ccy, maximumFractionDigits: 0 }).format(n);

/**
 * Built entirely from successful payment history -- the only
 * subscription-change signal actually available without a dedicated
 * audit-event API (which billing doesn't expose yet). Each SUCCESS
 * payment represents either the initial activation or a renewal, which
 * covers the "timeline of subscription changes" ask honestly rather than
 * fabricating events the backend can't back up.
 */
export default function SubscriptionTimeline({ payments }: SubscriptionTimelineProps) {
  const theme = useTheme();
  const successful = payments.filter((p) => p.status === 'SUCCESS' && p.paidAt).slice(0, 6);

  if (successful.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No activity yet.
      </Typography>
    );
  }

  return (
    <Stack spacing={0}>
      {successful.map((p, idx) => (
        <Stack key={p.id} direction="row" spacing={2} sx={{ position: 'relative', pb: idx === successful.length - 1 ? 0 : 3 }}>
          {idx !== successful.length - 1 && (
            <Box
              sx={{
                position: 'absolute', left: 11, top: 26, bottom: 0, width: 2,
                bgcolor: alpha(theme.palette.divider, 1),
              }}
            />
          )}
          <Box
            sx={{
              width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: alpha(theme.palette.success.main, 0.12), color: theme.palette.success.dark, zIndex: 1,
            }}
          >
            <CheckCircleRoundedIcon sx={{ fontSize: 15 }} />
          </Box>
          <Box sx={{ pb: 0.5 }}>
            <Typography variant="body2" fontWeight={700}>
              Payment received · {currency(p.amount, p.currency)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {new Date(p.paidAt as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} via {p.provider}
            </Typography>
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}
