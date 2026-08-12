'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { billingApi } from '@/lib/api/billing.api';

/**
 * `/settings/billing` is intentionally content-free -- it exists only to
 * route a tenant to the right one of the three billing journeys:
 * Subscribe (no paid subscription yet) or My Subscription (already
 * subscribed). Bookmarks/nav links can keep pointing here indefinitely;
 * this decides where they actually land.
 */
export default function BillingIndexPage() {
  const router = useRouter();

  const { data: subscription, isError } = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: billingApi.getSubscription,
  });

  useEffect(() => {
    if (!subscription) return;
    const hasPaidSubscription = subscription.status !== 'TRIAL';
    router.replace(hasPaidSubscription ? '/settings/billing/subscription' : '/settings/billing/subscribe');
  }, [subscription, router]);

  useEffect(() => {
    // Can't determine subscription state (e.g. transient network error) --
    // fail toward the safer default (the purchase wizard) rather than
    // stranding the tenant on a blank page.
    if (isError) router.replace('/settings/billing/subscribe');
  }, [isError, router]);

  return (
    <Box sx={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Stack spacing={2} alignItems="center">
        <CircularProgress size={32} />
        <Typography variant="body2" color="text.secondary">Loading your billing information...</Typography>
      </Stack>
    </Box>
  );
}
