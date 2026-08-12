'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

import PatientSearch from '@/components/PatientSearch';
import { loyaltyApi, type LoyaltyAccount } from '@/lib/api/loyalty.api';
import type { HisSearchResult } from '@/lib/api/his.api';
import PageHeader from '@/components/PageHeader';

const TIER_COLORS: Record<string, string> = {
  SILVER: '#78909C',
  GOLD: '#F9A825',
  PLATINUM: '#7B1FA2',
};

export default function EnrollPage() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  const [selectedPatient, setSelectedPatient] = useState<HisSearchResult | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [enrolled, setEnrolled] = useState<LoyaltyAccount | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['card-categories'],
    queryFn: () => loyaltyApi.getCatalog().then(() => []),   // reuse enum categories from seed
    // In real implementation this would call GET /loyalty/categories
    // For now we'll use the inline list from context
    staleTime: Infinity,
  });

  const enrollMut = useMutation({
    mutationFn: () => loyaltyApi.enroll(selectedPatient!.mrn, categoryId || undefined),
    onSuccess: (account) => {
      setEnrolled(account);
      qc.invalidateQueries({ queryKey: ['loyalty-account', selectedPatient?.mrn] });
      enqueueSnackbar('Patient enrolled successfully', { variant: 'success' });
    },
    onError: (err: any) => {
      enqueueSnackbar(err?.response?.data?.message ?? 'Enrollment failed', { variant: 'error' });
    },
  });

  const handleReset = () => {
    setSelectedPatient(null);
    setCategoryId('');
    setEnrolled(null);
  };

  if (enrolled) {
    return (
      <Box sx={{ p: 3, maxWidth: 600 }}>
        <Card elevation={0} sx={{ border: 1, borderColor: 'success.main' }}>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircleIcon color="success" sx={{ fontSize: 56, mb: 2 }} />
            <Typography variant="h5" fontWeight={700} gutterBottom>
              Enrollment Successful
            </Typography>
            <Typography variant="body1" mb={3}>
              {selectedPatient?.fullName} has been enrolled in the loyalty program.
            </Typography>

            <Box
              sx={{
                bgcolor: 'grey.50', borderRadius: 2, p: 3, mb: 3,
                border: 1, borderColor: 'divider', textAlign: 'left',
              }}
            >
              <Grid container spacing={1.5}>
                <InfoRow label="Card Number" value={enrolled.cardNumber} />
                <InfoRow label="MRN" value={enrolled.patientMrn} />
                <InfoRow
                  label="Tier"
                  value={
                    <Chip
                      label={enrolled.category.name}
                      size="small"
                      sx={{ bgcolor: TIER_COLORS[enrolled.category.name] ?? 'grey.400', color: 'white' }}
                    />
                  }
                />
                <InfoRow label="Point Value" value={`${enrolled.category.pointValuePer100} pts per ₹100`} />
                <InfoRow label="Starting Points" value="0" />
              </Grid>
            </Box>

            <Button variant="contained" onClick={handleReset} startIcon={<PersonAddIcon />}>
              Enroll Another Patient
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 600 }}>
      <PageHeader
        title="Enroll Patient"
        subtitle="Register a new patient in the loyalty programme"
        icon={<PersonAddIcon />}
        back="/loyalty"
        breadcrumbs={[
          { label: 'Loyalty', href: '/loyalty' },
          { label: 'Enroll Patient' },
        ]}
      />

      <Card elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Step 1: Search patient */}
          <Box>
            <Typography variant="subtitle2" fontWeight={600} mb={1}>
              1. Find Patient
            </Typography>
            <PatientSearch
              onSelect={(p) => setSelectedPatient(p)}
              label="Search patient by MRN, name or mobile"
            />
          </Box>

          {/* Selected patient preview */}
          {selectedPatient && (
            <Box
              sx={{
                bgcolor: 'primary.50', border: 1, borderColor: 'primary.200',
                borderRadius: 1, p: 2,
              }}
            >
              <Typography variant="body2" fontWeight={600}>{selectedPatient.fullName}</Typography>
              <Typography variant="caption" color="text.secondary">
                MRN: {selectedPatient.mrn} · {selectedPatient.gender} · DOB: {selectedPatient.dateOfBirth}
                {selectedPatient.mobile ? ` · ${selectedPatient.mobile}` : ''}
              </Typography>
            </Box>
          )}

          <Divider />

          {/* Step 2: Category (optional) */}
          <Box>
            <Typography variant="subtitle2" fontWeight={600} mb={1}>
              2. Select Tier <Typography component="span" variant="caption" color="text.secondary">(optional — auto-assigns Silver)</Typography>
            </Typography>
            <FormControl fullWidth size="small">
              <InputLabel>Card Tier</InputLabel>
              <Select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                label="Card Tier"
              >
                <MenuItem value="">Auto (Silver)</MenuItem>
                {/* Tier names are known from seed */}
                {['SILVER', 'GOLD', 'PLATINUM'].map((name) => (
                  <MenuItem key={name} value={name}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 12, height: 12, borderRadius: '50%',
                          bgcolor: TIER_COLORS[name],
                        }}
                      />
                      {name}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Button
            variant="contained"
            size="large"
            startIcon={enrollMut.isPending ? <CircularProgress size={18} /> : <PersonAddIcon />}
            disabled={!selectedPatient || enrollMut.isPending}
            onClick={() => enrollMut.mutate()}
          >
            Enroll Patient
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <Grid item xs={5}>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
      </Grid>
      <Grid item xs={7}>
        <Typography variant="body2" fontWeight={500}>{value}</Typography>
      </Grid>
    </>
  );
}
