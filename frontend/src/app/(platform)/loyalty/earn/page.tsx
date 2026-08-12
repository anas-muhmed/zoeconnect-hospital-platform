'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StarIcon from '@mui/icons-material/Star';
import ReceiptIcon from '@mui/icons-material/Receipt';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';

import PatientSearch from '@/components/PatientSearch';
import { loyaltyApi, type EarnResult, type LoyaltyAccount } from '@/lib/api/loyalty.api';
import type { HisSearchResult } from '@/lib/api/his.api';
import PageHeader from '@/components/PageHeader';

const schema = z.object({
  billId:     z.string().min(1, 'Bill number required').max(100),
  billAmount: z.coerce.number().min(1, 'Amount must be at least ₹1'),
  description: z.string().max(500).optional(),
});
type Form = z.infer<typeof schema>;

export default function EarnPage() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  const [patient, setPatient] = useState<HisSearchResult | null>(null);
  const [account, setAccount] = useState<LoyaltyAccount | null>(null);
  const [result, setResult] = useState<EarnResult | null>(null);

  const { control, handleSubmit, reset } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  // Load account when patient selected
  const { isFetching: loadingAccount } = useQuery({
    queryKey: ['loyalty-account-mrn', patient?.mrn],
    queryFn: () => loyaltyApi.getByMrn(patient!.mrn),
    enabled: !!patient,
    onSuccess: (a: any) => setAccount(a),
    onError: () => {
      setAccount(null);
      enqueueSnackbar('No loyalty account found for this patient. Please enroll first.', {
        variant: 'warning',
      });
    },
  } as any);

  const earnMut = useMutation({
    mutationFn: (data: Form) =>
      loyaltyApi.earnPoints({
        identifier: patient!.mrn,
        billId: data.billId,
        billAmount: data.billAmount,
        description: data.description,
      }),
    onSuccess: (res) => {
      setResult(res);
      qc.invalidateQueries({ queryKey: ['loyalty-account-mrn', patient?.mrn] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Failed to post points';
      enqueueSnackbar(msg, { variant: 'error' });
    },
  });

  const handleReset = () => {
    setPatient(null);
    setAccount(null);
    setResult(null);
    reset();
  };

  if (result) {
    return (
      <Box sx={{ p: 3, maxWidth: 520 }}>
        <Card elevation={0} sx={{ border: 1, borderColor: 'success.main' }}>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <StarIcon color="warning" sx={{ fontSize: 56, mb: 1 }} />
            <Typography variant="h5" fontWeight={700} gutterBottom>
              +{result.pointsEarned} Points Earned!
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Card: {result.cardNumber}
            </Typography>

            <Box sx={{ bgcolor: 'grey.50', borderRadius: 2, p: 2.5, mb: 3, textAlign: 'left' }}>
              <Grid container spacing={1}>
                <EarnRow label="Points Before" value={String(result.balanceBefore)} />
                <EarnRow label="Points Earned" value={`+${result.pointsEarned}`} highlight />
                <EarnRow label="Points After" value={String(result.balanceAfter)} bold />
                {result.tierChanged && (
                  <Grid item xs={12}>
                    <Alert severity="success" sx={{ mt: 1 }}>
                      Tier upgraded to <strong>{result.newTier}</strong>!
                    </Alert>
                  </Grid>
                )}
                {result.activeCampaigns.length > 0 && (
                  <Grid item xs={12}>
                    <Typography variant="caption" color="text.secondary">
                      Active campaigns: {result.activeCampaigns.join(', ')}
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </Box>

            <Button variant="contained" onClick={handleReset} startIcon={<ReceiptIcon />}>
              Process Another Bill
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 560 }}>
      <PageHeader
        title="Earn Points"
        subtitle="Post loyalty points for a patient visit or transaction"
        icon={<EmojiEventsIcon />}
        back="/loyalty"
        breadcrumbs={[
          { label: 'Loyalty', href: '/loyalty' },
          { label: 'Earn Points' },
        ]}
      />

      <Card elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Patient search */}
          <Box>
            <Typography variant="subtitle2" fontWeight={600} mb={1}>
              1. Find Patient
            </Typography>
            <PatientSearch onSelect={setPatient} />
          </Box>

          {/* Account preview */}
          {loadingAccount && <CircularProgress size={24} sx={{ alignSelf: 'center' }} />}
          {account && (
            <Box sx={{ bgcolor: 'primary.50', border: 1, borderColor: 'primary.200', borderRadius: 1, p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="body2" fontWeight={600}>{account.cardNumber}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Available: <strong>{account.availablePoints.toLocaleString()} pts</strong>
                  </Typography>
                </Box>
                <Chip
                  label={account.category.name}
                  size="small"
                  sx={{
                    bgcolor: account.category.name === 'GOLD' ? '#F9A825'
                           : account.category.name === 'PLATINUM' ? '#7B1FA2'
                           : '#78909C',
                    color: 'white',
                  }}
                />
              </Box>
            </Box>
          )}

          {account && (
            <>
              <Divider />
              <Typography variant="subtitle2" fontWeight={600}>
                2. Enter Bill Details
              </Typography>

              <Controller
                name="billId"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    label="Bill Number"
                    size="small"
                    fullWidth
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                    placeholder="BILL-2024-001234"
                  />
                )}
              />

              <Controller
                name="billAmount"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    label="Bill Amount"
                    size="small"
                    fullWidth
                    type="number"
                    error={!!fieldState.error}
                    helperText={
                      fieldState.error?.message
                      ?? `Earns approx. ${Math.floor((field.value || 0) / 100) * account.category.pointValuePer100} pts`
                    }
                    InputProps={{
                      startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                    }}
                  />
                )}
              />

              <Controller
                name="description"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Note (optional)" size="small" fullWidth />
                )}
              />

              <Button
                variant="contained"
                size="large"
                startIcon={earnMut.isPending ? <CircularProgress size={18} /> : <StarIcon />}
                disabled={earnMut.isPending}
                onClick={handleSubmit((d) => earnMut.mutate(d))}
              >
                Post Points
              </Button>
            </>
          )}

          {!patient && (
            <Typography variant="body2" color="text.secondary" align="center">
              Search for a patient to begin
            </Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

function EarnRow({
  label, value, highlight = false, bold = false,
}: { label: string; value: string; highlight?: boolean; bold?: boolean }) {
  return (
    <>
      <Grid item xs={6}>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
      </Grid>
      <Grid item xs={6}>
        <Typography
          variant="body2"
          fontWeight={bold || highlight ? 700 : 400}
          color={highlight ? 'success.main' : 'text.primary'}
        >
          {value}
        </Typography>
      </Grid>
    </>
  );
}
