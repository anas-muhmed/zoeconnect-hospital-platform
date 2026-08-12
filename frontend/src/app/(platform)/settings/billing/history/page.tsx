'use client';

import { useQuery } from '@tanstack/react-query';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { billingApi } from '@/lib/api/billing.api';
import InvoiceHistoryTable from '../_components/InvoiceHistoryTable';
import PaymentHistoryTable from '../_components/PaymentHistoryTable';

/**
 * Billing History -- financial records only. No module selection, no
 * checkout/subscription-builder logic; purely reads GET /billing/invoices
 * and GET /billing/payments (both already existed before this refactor).
 */
export default function BillingHistoryPage() {
  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ['billing', 'invoices'],
    queryFn: billingApi.listInvoices,
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['billing', 'payments'],
    queryFn: billingApi.listPayments,
  });

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={0.5} sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={800}>Billing History</Typography>
        <Typography variant="body2" color="text.secondary">
          Your invoices and payment records.
        </Typography>
      </Stack>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <InvoiceHistoryTable invoices={invoices ?? []} loading={invoicesLoading} />
        </Grid>
        <Grid item xs={12}>
          <PaymentHistoryTable payments={payments ?? []} loading={paymentsLoading} />
        </Grid>
      </Grid>
    </Container>
  );
}
