'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Skeleton from '@mui/material/Skeleton';
import { alpha, useTheme } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EventRepeatRoundedIcon from '@mui/icons-material/EventRepeatRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import Link from 'next/link';

import { billingApi } from '@/lib/api/billing.api';
import CancelSubscriptionDialog from '../_components/CancelSubscriptionDialog';
import SubscriptionTimeline from '../_components/SubscriptionTimeline';
import CurrentModulesList from '../_components/CurrentModulesList';
import PendingChangesList from '../_components/PendingChangesList';

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

const dateLabel = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function DetailTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start">
      <Box
        sx={{
          width: 36, height: 36, borderRadius: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: alpha(theme.palette.primary.main, 0.08), color: theme.palette.primary.main,
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="body2" fontWeight={700}>{value}</Typography>
      </Box>
    </Stack>
  );
}

/**
 * My Subscription -- pure management surface for an already-purchased
 * subscription. Never touches quote/checkout/verify; module and
 * billing-cycle changes hand off to /settings/billing/subscribe (deep-
 * linked with the tenant's current selection prefilled) rather than
 * duplicating the wizard here.
 */
export default function MySubscriptionPage() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const { data: subscription, isLoading } = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: billingApi.getSubscription,
  });

  const { data: payments } = useQuery({
    queryKey: ['billing', 'payments'],
    queryFn: billingApi.listPayments,
  });

  const { data: changes } = useQuery({
    queryKey: ['billing', 'subscription', 'changes'],
    queryFn: billingApi.listSubscriptionChanges,
  });

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [reactivateLoading, setReactivateLoading] = useState(false);
  const [cancellingChangeId, setCancellingChangeId] = useState<string | null>(null);

  const handleCancelChange = async (changeId: string) => {
    setCancellingChangeId(changeId);
    try {
      await billingApi.cancelSubscriptionChange(changeId);
      queryClient.invalidateQueries({ queryKey: ['billing', 'subscription', 'changes'] });
      queryClient.invalidateQueries({ queryKey: ['billing', 'modules'] });
      enqueueSnackbar('Scheduled change cancelled.', { variant: 'info' });
    } catch (err: any) {
      enqueueSnackbar(err?.response?.data?.message || 'Could not cancel this change.', { variant: 'error' });
    } finally {
      setCancellingChangeId(null);
    }
  };

  const handleConfirmCancel = async (atPeriodEnd: boolean) => {
    setCancelLoading(true);
    try {
      const sub = await billingApi.cancelSubscription(atPeriodEnd);
      queryClient.setQueryData(['billing', 'subscription'], sub);
      // Cancel/reactivate also re-run BillingEntitlementSyncService on the
      // backend (see billing-subscription.controller.ts) -- same stale-cache
      // class of bug as the checkout success path, so the license banner
      // and dashboard module grid (both keyed on ['license-status']) need
      // invalidating here too, not just on the subscribe flow.
      queryClient.invalidateQueries({ queryKey: ['license-status'] });
      setCancelDialogOpen(false);
      enqueueSnackbar(
        atPeriodEnd ? 'Your subscription will end at the close of the current billing period.' : 'Your subscription has been cancelled.',
        { variant: 'info' },
      );
    } catch (err: any) {
      enqueueSnackbar(err?.response?.data?.message || 'Could not cancel your subscription. Please try again.', { variant: 'error' });
    } finally {
      setCancelLoading(false);
    }
  };

  const handleReactivate = async () => {
    setReactivateLoading(true);
    try {
      const sub = await billingApi.reactivateSubscription();
      queryClient.setQueryData(['billing', 'subscription'], sub);
      queryClient.invalidateQueries({ queryKey: ['license-status'] });
      enqueueSnackbar('Your subscription has been reactivated.', { variant: 'success' });
    } catch (err: any) {
      enqueueSnackbar(err?.response?.data?.message || 'Could not reactivate your subscription. Please try again.', { variant: 'error' });
    } finally {
      setReactivateLoading(false);
    }
  };

  if (isLoading || !subscription) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Skeleton variant="rounded" height={280} sx={{ borderRadius: 4 }} />
      </Container>
    );
  }

  const items = subscription.items ?? [];
  const currentAmount = items.reduce((sum, i) => sum + (i.unitPrice || 0), 0);
  const isCancelling = subscription.status === 'CANCEL_AT_PERIOD_END';
  const canCancel = subscription.status === 'ACTIVE' || subscription.status === 'PAST_DUE';

  // Per-module prepayment: modules no longer necessarily share one renewal
  // date -- each billing_subscription_items row has its own periodEnd
  // (extended independently via "Buy More Months"). The soonest of those
  // is what actually matters for "when do I need to act next", which can
  // now be earlier than the base plan's own currentPeriodEnd.
  const nextModuleExpiry = items.length > 0
    ? items.reduce((earliest, i) => (new Date(i.periodEnd) < new Date(earliest) ? i.periodEnd : earliest), items[0].periodEnd)
    : null;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={0.5} sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={800}>My Subscription</Typography>
        <Typography variant="body2" color="text.secondary">
          View your plan, manage modules, and control your billing cycle.
        </Typography>
      </Stack>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper elevation={0} sx={{ borderRadius: 4, p: 3.5, border: `1px solid ${theme.palette.divider}`, mb: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Typography variant="h6" fontWeight={800}>Current Plan</Typography>
                <Chip
                  size="small"
                  label={subscription.status.replace(/_/g, ' ')}
                  color={STATUS_COLOR[subscription.status] ?? 'default'}
                  sx={{ fontWeight: 700, fontSize: 11 }}
                />
              </Stack>

              {isCancelling ? (
                <Button
                  variant="contained"
                  onClick={handleReactivate}
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
                  onClick={() => setCancelDialogOpen(true)}
                  sx={{ borderRadius: 2.5, fontWeight: 700, whiteSpace: 'nowrap' }}
                >
                  Cancel Subscription
                </Button>
              ) : null}
            </Stack>

            <Grid container spacing={2.5}>
              <Grid item xs={12} sm={6}>
                <DetailTile
                  icon={<EventRepeatRoundedIcon sx={{ fontSize: 18 }} />}
                  label="Billing Cycle"
                  value={subscription.billingCycle === 'MONTHLY' ? 'Monthly' : 'Yearly'}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <DetailTile
                  icon={<EventRepeatRoundedIcon sx={{ fontSize: 18 }} />}
                  label={isCancelling ? 'Access Ends' : 'Base Plan Renewal'}
                  value={dateLabel(subscription.currentPeriodEnd)}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <DetailTile
                  icon={<EventRepeatRoundedIcon sx={{ fontSize: 18 }} />}
                  label="Next Module Expiry"
                  value={nextModuleExpiry ? dateLabel(nextModuleExpiry) : '—'}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <DetailTile
                  icon={<PaymentsRoundedIcon sx={{ fontSize: 18 }} />}
                  label="Payment Provider"
                  value={subscription.provider ? subscription.provider.charAt(0).toUpperCase() + subscription.provider.slice(1) : '—'}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <DetailTile
                  icon={<ReceiptLongRoundedIcon sx={{ fontSize: 18 }} />}
                  label="Current Amount"
                  value={`${currency(currentAmount, subscription.currency)} / ${subscription.billingCycle === 'MONTHLY' ? 'mo' : 'yr'}`}
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 3 }} />
            <Typography variant="caption" fontWeight={700} color="text.secondary" letterSpacing={0.5}>
              CURRENT MODULES
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Each module is licensed through its own date -- extend one individually without affecting the others.
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              <CurrentModulesList items={items} />
            </Box>

            <Divider sx={{ my: 3 }} />

            <Stack direction="row" flexWrap="wrap" gap={1.5}>
              <Button
                component={Link}
                href="/settings/billing/subscribe"
                variant="contained"
                startIcon={<AddRoundedIcon />}
                sx={{ borderRadius: 2.5, fontWeight: 700 }}
              >
                Add Modules
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              Already-licensed modules are shown as Licensed on the Subscribe page -- click one there (or "Extend" above) to buy more months or schedule its removal.
            </Typography>
          </Paper>

          <Paper elevation={0} sx={{ borderRadius: 4, p: 3.5, border: `1px solid ${theme.palette.divider}` }}>
            <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>Pending Changes</Typography>
            <PendingChangesList changes={changes ?? []} onCancelChange={handleCancelChange} cancellingId={cancellingChangeId} />
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ borderRadius: 4, p: 3, border: `1px solid ${theme.palette.divider}` }}>
            <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 2 }}>Subscription Activity</Typography>
            <SubscriptionTimeline payments={payments ?? []} />
            <Button
              component={Link}
              href="/settings/billing/history"
              fullWidth
              sx={{ mt: 2.5, fontWeight: 700, borderRadius: 2.5 }}
            >
              View Full Billing History
            </Button>
          </Paper>
        </Grid>
      </Grid>

      <CancelSubscriptionDialog
        open={cancelDialogOpen}
        onClose={() => setCancelDialogOpen(false)}
        onConfirm={handleConfirmCancel}
        loading={cancelLoading}
        currentPeriodEndLabel={subscription.currentPeriodEnd ? dateLabel(subscription.currentPeriodEnd) : null}
      />
    </Container>
  );
}
