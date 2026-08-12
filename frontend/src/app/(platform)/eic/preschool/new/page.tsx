'use client';
import { Suspense } from 'react';

import { useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Autocomplete from '@mui/material/Autocomplete';
import InputAdornment from '@mui/material/InputAdornment';

import SearchIcon from '@mui/icons-material/Search';
import SchoolIcon from '@mui/icons-material/School';
import PersonIcon from '@mui/icons-material/Person';

import { eicApi, type EicPatient } from '@/lib/api/eic.api';
import PageHeader from '@/components/PageHeader';

interface HisSuggestion {
  mrn: string;
  fullName: string;
  gender: string;
  dateOfBirth: string;
  mobile: string | null;
}

function PreschoolEnrollPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  // Typeahead state
  const [inputValue,    setInputValue]    = useState(searchParams.get('mrn') ?? '');
  const [suggestions,   setSuggestions]   = useState<HisSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lookup state
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError,   setLookupError]   = useState<string | null>(null);
  const [patient,       setPatient]       = useState<EicPatient | null>(null);

  const [form, setForm] = useState({
    admissionDate: new Date().toISOString().split('T')[0],
    classGroup:    '',
    teacherName:   '',
    notes:         '',
  });

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Debounced typeahead — fires 350 ms after user stops typing
  const handleInputChange = useCallback((_: unknown, value: string) => {
    setInputValue(value);
    setPatient(null);
    setLookupError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) { setSuggestions([]); return; }

    debounceRef.current = setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const results = await eicApi.hisSuggest(value.trim(), 10);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestLoading(false);
      }
    }, 350);
  }, []);

  // Full MRN lookup — called when user picks a suggestion OR hits Search
  const handleLookup = useCallback(async (mrn: string) => {
    const trimmed = mrn.trim();
    if (!trimmed) { setLookupError('Enter a name or MRN to search'); return; }
    setLookupLoading(true);
    setLookupError(null);
    setPatient(null);
    try {
      const result = await eicApi.searchByMrn(trimmed);
      if (result.eicPatient) {
        setPatient(result.eicPatient);
      } else {
        setLookupError('Patient found in HIS but not yet registered in EIC. Please register the patient first.');
      }
    } catch (err: any) {
      setLookupError(err?.response?.data?.message ?? 'Patient not found in HIS');
    } finally {
      setLookupLoading(false);
    }
  }, []);

  // User picks a suggestion from the dropdown
  const handleSelect = useCallback((_: unknown, option: HisSuggestion | string | null) => {
    if (!option) return;
    const mrn = typeof option === 'string' ? option : option.mrn;
    setInputValue(mrn);
    setSuggestions([]);
    handleLookup(mrn);
  }, [handleLookup]);

  const handleSubmit = async () => {
    if (!patient) { setError('Perform a patient lookup first'); return; }
    setSaving(true);
    setError(null);
    try {
      const enrollment = await eicApi.preschoolEnroll(patient.id, {
        admissionDate: form.admissionDate,
        classGroup:    form.classGroup   || undefined,
        teacherName:   form.teacherName  || undefined,
        notes:         form.notes        || undefined,
      });
      router.push(`/eic/preschool/${enrollment.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Enrollment failed');
    } finally {
      setSaving(false);
    }
  };

  const ageLabel = patient?.ageYears != null
    ? `${patient.ageYears}y ${patient.ageMonths ?? 0}m`
    : '—';

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }} />
      <PageHeader
        title="Enroll Student — Preschool"
        subtitle="Search by patient name or MRN, then complete the enrollment details"
        icon={<SchoolIcon />}
        back="/eic/preschool"
        breadcrumbs={[
          { label: 'EIC', href: '/eic' },
          { label: 'Preschool', href: '/eic/preschool' },
          { label: 'New Enrollment' },
        ]}
      />

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {/* Patient lookup */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
            Step 1 — Patient Lookup
          </Typography>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Autocomplete
              freeSolo
              fullWidth
              options={suggestions}
              getOptionLabel={(opt) =>
                typeof opt === 'string' ? opt : `${opt.fullName} — ${opt.mrn}`
              }
              filterOptions={(x) => x}           // server-side filtering
              inputValue={inputValue}
              onInputChange={handleInputChange}
              onChange={handleSelect}
              loading={suggestLoading}
              noOptionsText={inputValue.length >= 2 ? 'No patients found' : 'Type to search…'}
              renderOption={(props, opt) => (
                <Box component="li" {...props} key={opt.mrn}>
                  <PersonIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
                  <Box>
                    <Typography variant="body2" fontWeight={600}>{opt.fullName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      MRN: {opt.mrn}
                      {opt.gender ? ` · ${opt.gender}` : ''}
                      {opt.dateOfBirth ? ` · DOB: ${opt.dateOfBirth}` : ''}
                      {opt.mobile ? ` · ${opt.mobile}` : ''}
                    </Typography>
                  </Box>
                </Box>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search by Name or MRN"
                  size="small"
                  placeholder="e.g. Ahmed Ali or CICLT2026-00123"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleLookup(inputValue); }}
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" color="action" />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <>
                        {suggestLoading && <CircularProgress size={16} />}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
            <Button
              variant="outlined"
              startIcon={lookupLoading ? <CircularProgress size={16} /> : <SearchIcon />}
              onClick={() => handleLookup(inputValue)}
              disabled={lookupLoading || !inputValue.trim()}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Search
            </Button>
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Type at least 2 characters to see suggestions, or enter an exact MRN and press Search.
          </Typography>

          {lookupError && (
            <Alert severity="warning" sx={{ mt: 2 }}>{lookupError}</Alert>
          )}

          {patient && (
            <Card variant="outlined" sx={{ mt: 2, bgcolor: 'success.50' }}>
              <CardContent sx={{ py: '10px !important' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PersonIcon color="success" />
                  <Box sx={{ flex: 1 }}>
                    <Typography fontWeight={700}>{patient.fullName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      MRN: {patient.mrn} · {patient.gender ?? '—'} · Age: {ageLabel}
                    </Typography>
                    {patient.fatherName && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        S/D/O {patient.fatherName}
                        {patient.motherName ? ` / ${patient.motherName}` : ''}
                      </Typography>
                    )}
                  </Box>
                  <Chip label="Found" size="small" color="success" />
                </Box>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Enrollment form */}
      <Card variant="outlined" sx={{ mb: 3, opacity: patient ? 1 : 0.5, pointerEvents: patient ? 'auto' : 'none' }}>
        <CardContent>
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
            Step 2 — Enrollment Details
          </Typography>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Admission Date *" type="date" fullWidth size="small"
                InputLabelProps={{ shrink: true }}
                value={form.admissionDate}
                onChange={(e) => setForm((p) => ({ ...p, admissionDate: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Class / Group" fullWidth size="small"
                value={form.classGroup}
                onChange={(e) => setForm((p) => ({ ...p, classGroup: e.target.value }))}
                placeholder="e.g. Nursery A, LKG-1…"
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Teacher Name" fullWidth size="small"
                value={form.teacherName}
                onChange={(e) => setForm((p) => ({ ...p, teacherName: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes" fullWidth size="small" multiline rows={2}
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Any initial observations or parent-provided context…"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <Button variant="outlined" onClick={() => router.back()}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SchoolIcon />}
          onClick={handleSubmit}
          disabled={saving || !patient}
        >
          Enroll & Open
        </Button>
      </Box>
    </Box>
  );
}

export default function PreschoolEnrollPageWrapper() { return <Suspense fallback={null}><PreschoolEnrollPage /></Suspense>; }
