'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';

import PersonIcon from '@mui/icons-material/Person';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BadgeIcon from '@mui/icons-material/Badge';
import PhoneIcon from '@mui/icons-material/Phone';
import CakeIcon from '@mui/icons-material/Cake';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { eicApi, type EicPatient } from '@/lib/api/eic.api';
import SearchIcon from '@mui/icons-material/Search';
import PageHeader from '@/components/PageHeader';

type Suggestion = {
  mrn: string;
  fullName: string;
  gender: string;
  dateOfBirth: string;
  mobile: string | null;
};

export default function EicPatientSearchPage() {
  const router = useRouter();

  // autocomplete state
  const [inputValue,   setInputValue]   = useState('');
  const [options,      setOptions]      = useState<Suggestion[]>([]);
  const [suggesting,   setSuggesting]   = useState(false);
  const [selected,     setSelected]     = useState<Suggestion | null>(null);

  // full lookup state (after a suggestion is selected)
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [result,   setResult]   = useState<{ hisData: any; eicPatient: EicPatient | null } | null>(null);

  // debounce ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── typeahead ──────────────────────────────────────────────────────────────
  const fetchSuggestions = useCallback((q: string) => {
    if (q.trim().length < 2) { setOptions([]); return; }
    setSuggesting(true);
    eicApi.hisSuggest(q.trim(), 10)
      .then(setOptions)
      .catch(() => setOptions([]))
      .finally(() => setSuggesting(false));
  }, []);

  const handleInputChange = (_: React.SyntheticEvent, value: string, reason: string) => {
    setInputValue(value);
    // MUI fires onInputChange again with reason 'reset' (full option label)
    // right after a selection is made — don't re-query HIS for that.
    if (reason === 'reset') return;
    setSelected(null);
    setResult(null);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 320);
  };

  // ── full lookup when user picks a suggestion ───────────────────────────────
  const handleSelect = async (_: React.SyntheticEvent, value: Suggestion | null) => {
    setSelected(value);
    setResult(null);
    setError(null);
    if (!value) return;

    setLoading(true);
    try {
      const data = await eicApi.searchByMrn(value.mrn);
      setResult(data);
    } catch (err: any) {
      const msg: string = err?.response?.data?.message ?? 'Patient not found or HIS unavailable';
      const isConfigErr = msg.toLowerCase().includes('ora-00904') || msg.toLowerCase().includes('invalid identifier');
      setError(
        isConfigErr
          ? 'HIS column mapping error — the MRN column name in HIS Config does not match your Oracle schema. Go to Vendor Portal → HIS Config and correct the "patient.col.mrn" value.'
          : msg,
      );
    } finally {
      setLoading(false);
    }
  };

  const his = result?.hisData as any;

  return (
    <Box>
      <PageHeader
        title="Patient Search"
        subtitle="HIS lookup — search by MRN or patient name"
        icon={<SearchIcon />}
        back="/eic/patients"
        breadcrumbs={[
          { label: 'EIC', href: '/eic' },
          { label: 'Patients', href: '/eic/patients' },
          { label: 'HIS Search' },
        ]}
      />

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Type MRN or patient name — suggestions load automatically
          </Typography>

          <Autocomplete<Suggestion, false, false, false>
            options={options}
            loading={suggesting}
            inputValue={inputValue}
            value={selected}
            onInputChange={handleInputChange}
            onChange={handleSelect}
            getOptionLabel={(o) => `${o.mrn} — ${o.fullName}`}
            isOptionEqualToValue={(a, b) => a.mrn === b.mrn}
            filterOptions={(x) => x}   // server-side filtering, don't re-filter client-side
            noOptionsText={
              inputValue.length < 2
                ? 'Type at least 2 characters…'
                : suggesting
                ? 'Searching HIS…'
                : 'No patients found'
            }
            renderOption={(props, option) => (
              <Box component="li" {...props} key={option.mrn}>
                <Stack direction="row" spacing={1.5} alignItems="center" width="100%">
                  <PersonIcon fontSize="small" color="action" />
                  <Box flex={1}>
                    <Typography variant="body2" fontWeight={600}>{option.fullName}</Typography>
                    <Stack direction="row" spacing={1} mt={0.3}>
                      <Typography variant="caption" color="text.secondary">
                        <BadgeIcon sx={{ fontSize: 11, mr: 0.3, verticalAlign: 'middle' }} />
                        {option.mrn}
                      </Typography>
                      {option.dateOfBirth && (
                        <Typography variant="caption" color="text.secondary">
                          <CakeIcon sx={{ fontSize: 11, mr: 0.3, verticalAlign: 'middle' }} />
                          {option.dateOfBirth}
                        </Typography>
                      )}
                      {option.mobile && (
                        <Typography variant="caption" color="text.secondary">
                          <PhoneIcon sx={{ fontSize: 11, mr: 0.3, verticalAlign: 'middle' }} />
                          {option.mobile}
                        </Typography>
                      )}
                      {option.gender && (
                        <Chip label={option.gender} size="small" sx={{ height: 16, fontSize: 10 }} />
                      )}
                    </Stack>
                  </Box>
                </Stack>
              </Box>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Search by MRN or Patient Name"
                placeholder="e.g. CICLT8206 or John…"
                size="small"
                sx={{ minWidth: 380 }}
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {suggesting || loading ? <CircularProgress size={16} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />

          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Searches HIS by MRN, name, or mobile number
          </Typography>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert
          severity="error"
          icon={<WarningAmberIcon />}
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => router.push('/eic/patients/new')}>
              Register Manually
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* Loading spinner while fetching full record */}
      {loading && (
        <Box display="flex" alignItems="center" gap={1} py={2}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">Loading patient from HIS…</Typography>
        </Box>
      )}

      {/* Result card */}
      {result && his && !loading && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <PersonIcon color="primary" />
              <Typography variant="h6" fontWeight={600}>{his.fullName}</Typography>
              <Chip label={`MRN: ${his.mrn}`} size="small" variant="outlined" />
              {his.gender && <Chip label={his.gender} size="small" color="default" />}
            </Box>

            <Divider sx={{ mb: 2 }} />

            <Grid container spacing={2}>
              {[
                ['Date of Birth', his.dateOfBirth],
                ['Age',          his.age ? `${his.age} years` : null],
                ['Mobile',       his.mobile],
                ['Email',        his.email],
                ['Blood Group',  his.bloodGroup],
                ['Registered',   his.registrationDate],
              ].map(([label, value]) =>
                value ? (
                  <Grid item xs={12} sm={6} md={4} key={label as string}>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography variant="body2">{value}</Typography>
                  </Grid>
                ) : null,
              )}
            </Grid>

            <Divider sx={{ my: 2 }} />

            {result.eicPatient ? (
              <Alert severity="info">
                This patient is already registered in EIC (ID: {result.eicPatient.id}).
                <Button
                  size="small"
                  sx={{ ml: 2 }}
                  onClick={() => router.push(`/eic/patients/${result.eicPatient!.id}`)}
                >
                  Open Profile
                </Button>
              </Alert>
            ) : (
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Button
                  variant="contained"
                  onClick={() => router.push(`/eic/enrollments/new?mrn=${his.mrn}`)}
                >
                  Admit to EIC
                </Button>
                <Typography variant="body2" color="text.secondary">
                  This will create an EIC patient record and enrollment
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
