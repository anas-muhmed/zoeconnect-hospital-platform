'use client';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha, useTheme } from '@mui/material/styles';
import EventRepeatRoundedIcon from '@mui/icons-material/EventRepeatRounded';
import type { BillingSubscriptionSummary } from '@/lib/api/billing.api';

export interface CurrentPlanCardProps {
  subscription: BillingSubscriptionSummary;
  onCancelClick: () => void;
  onReactivate: () => void;
  reactivateLoading: boolean;
}

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default' | 'info'> = {
  ACTIVE: 'success',
  TRIAL: 'info',
  PAST_DUE: 'warning',
  CANCEL_AT_PERIOD_END: 'warning',
  CANCELLED: 'error',
  SUSPENDED: 'error',
  INCOMPLETE: 'default',
};

const currency = (n: number, ccy: string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: ccy, maximumFractionDigits: 0 }).format(n);

export default function CurrentPlanCard({ subscription, onCancelClick, onReactivate, reactivateLoading }: CurrentPlanCardProps) {
  const theme = useTheme();
  const items = subscription.items ?? [];
  const isCancelling = subscription.status === 'CANCEL_AT_PERIOD_END';
  const isCancelled = subscription.status === 'CANCELLED';
  const canCancel = subscription.status === 'ACTIVE' || subscription.status === 'PAST_DUE';
  const periodEndLabel = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <Paper elevation={0} sx={{ borderRadius: 4, p: 3, border: `1px solid ${theme.palette.divider}` }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2}>
        <Box>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="subtitle1" fontWeight={800}>Current Plan</Typography>
            <Chip
              size="small"
              label={subscription.status.replace(/_/g, ' ')}
              color={STATUS_COLOR[subscription.status] ?? 'default'}
              sx={{ fontWeight: 700, fontSize: 11 }}
            />
          </Stack>
          {periodEndLabel && (
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.75 }}>
              <EventRepeatRoundedIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                {isCancelling
                  ? `Access ends ${periodEndLabel}`
                  : `Renews ${periodEndLabel} · Billed ${subscription.billingCycle === 'MONTHLY' ? 'monthly' : 'yearly'}`}
              </Typography>
            </Stack>
          )}
        </Box>

        {isCancelling ? (
          <Button
            variant="contained"
            onClick={onReactivate}
            disabled={reactivateLoading}
            startIcon={reactivateLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ borderRadius: 2.5, fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            Keep Subscription
          </Button>
        ) : canCancel ? (
          <Button
            variant="outlined"
            color="error"
            onClick={onCancelClick}
            sx={{ borderRadius: 2.5, fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            Cancel Subscription
          </Button>
        ) : null}
      </Stack>

      {items.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="caption" fontWeight={700} color="text.secondary" letterSpacing={0.5}>
            ACTIVE MODULES
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
            {items.map((item) => (
              <Chip
                key={item.moduleCode}
                label={`${item.moduleName} · ${item.unitPrice > 0 ? currency(item.unitPrice, subscription.currency) : 'Included'}`}
                size="small"
                sx={{ bgcolor: alpha(theme.palette.primary.main, 0.06), fontWeight: 600 }}
              />
            ))}
          </Stack>
        </>
      )}

      {isCancelled && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          This subscription has ended. Select modules below to start a new one.
        </Typography>
      )}
    </Paper>
  );
}
