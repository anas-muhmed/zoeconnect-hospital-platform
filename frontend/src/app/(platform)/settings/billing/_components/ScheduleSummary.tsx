'use client';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import { alpha, useTheme } from '@mui/material/styles';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';

export interface ScheduleSummaryItem {
  code: string;
  name: string;
  price: number | null;
}

export interface ScheduleSummaryProps {
  items: ScheduleSummaryItem[];
  onRemove: (code: string) => void;
  onRemoveAll: () => void;
  onContinue: () => void;
  continueLoading: boolean;
  renewalDateLabel: string | null;
  currency?: string;
  /** Sidebar title -- spec calls for "Subscription Changes" for the ACTIVE_SUBSCRIPTION journey. */
  title?: string;
}

const fmt = (n: number, ccy = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: ccy, maximumFractionDigits: 0 }).format(n);

/**
 * Sidebar used on the Subscribe page instead of ConfigurationSummary
 * whenever the tenant already has an open subscription (ACTIVE/PAST_DUE/
 * CANCEL_AT_PERIOD_END). New modules picked here never go through
 * checkout -- there's deliberately no live server quote, no tax
 * calculation, and no "Total" figure, because none of that is
 * authoritative until the module is actually applied and priced at the
 * next renewal (BillingSubscriptionChangeService.applyDueChanges()). This
 * only shows an unpriced-for-tax estimate so the tenant knows roughly
 * what to expect, clearly labeled as such.
 */
export default function ScheduleSummary({ items, onRemove, onRemoveAll, onContinue, continueLoading, renewalDateLabel, currency = 'INR', title = 'Subscription Changes' }: ScheduleSummaryProps) {
  const theme = useTheme();
  const estimatedSubtotal = items.reduce((sum, i) => sum + (i.price ?? 0), 0);

  return (
    <Paper elevation={0} sx={{ borderRadius: 4, p: 3, position: 'sticky', top: 24, border: `1px solid ${theme.palette.divider}` }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle1" fontWeight={800}>{title}</Typography>
        {items.length > 0 && (
          <ButtonBase onClick={onRemoveAll} sx={{ fontSize: 12, fontWeight: 700, color: 'error.main', px: 0.5, borderRadius: 1 }}>
            Remove All
          </ButtonBase>
        )}
      </Stack>

      <Divider sx={{ my: 1.5 }} />

      {items.length === 0 ? (
        <Box sx={{ py: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Select new modules to add to your subscription.
          </Typography>
        </Box>
      ) : (
        <>
          <Typography variant="caption" fontWeight={700} color="text.secondary" letterSpacing={0.5}>
            MODULES TO ADD
          </Typography>
          <Stack spacing={0.75} sx={{ mt: 1, maxHeight: 260, overflowY: 'auto', pr: 0.5 }}>
            {items.map((item) => (
              <Stack
                key={item.code}
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ py: 0.75, px: 1, borderRadius: 2, bgcolor: alpha(theme.palette.info.main, 0.04) }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>{item.name}</Typography>
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                      {item.price !== null ? fmt(item.price, currency) : 'Contact sales'}
                    </Typography>
                    {renewalDateLabel && (
                      <Typography variant="caption" color="info.dark" fontWeight={700}>
                        · Effective {renewalDateLabel}
                      </Typography>
                    )}
                  </Stack>
                </Box>
                <IconButton size="small" onClick={() => onRemove(item.code)} aria-label={`Remove ${item.name}`} sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}>
                  <CloseRoundedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Stack>
            ))}
          </Stack>
        </>
      )}

      <Divider sx={{ my: 2 }} />

      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.info.main, 0.06), mb: 2 }}>
        <EventAvailableRoundedIcon sx={{ fontSize: 18, color: 'info.dark', mt: 0.25 }} />
        <Typography variant="caption" color="info.dark">
          No payment due today. These modules activate and are billed starting your next renewal
          {renewalDateLabel ? ` on ${renewalDateLabel}` : ''}.
        </Typography>
      </Stack>

      {items.length > 0 && (
        <Stack direction="row" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">Estimated addition</Typography>
          <Typography variant="body2" fontWeight={700}>{fmt(estimatedSubtotal, currency)} / cycle</Typography>
        </Stack>
      )}

      <Button
        fullWidth
        size="large"
        variant="contained"
        onClick={onContinue}
        disabled={items.length === 0 || continueLoading}
        sx={{ py: 1.4, borderRadius: 2.5, fontWeight: 700 }}
        startIcon={continueLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
      >
        {continueLoading ? 'Scheduling...' : 'Schedule Changes'}
      </Button>
    </Paper>
  );
}
