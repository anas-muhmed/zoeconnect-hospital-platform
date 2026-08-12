'use client';
import { Suspense } from 'react';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import PersonIcon from '@mui/icons-material/Person';
import LockIcon from '@mui/icons-material/Lock';

import { eicApi, type EicDiscipline, DISCIPLINE_LABELS } from '@/lib/api/eic.api';
import PageHeader from '@/components/PageHeader';

const ALL_DISCIPLINES: EicDiscipline[] = ['BT', 'SLP', 'DT', 'OT', 'SE'];

function NewEnrollmentPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const mrnParam     = searchParams.get('mrn') ?? '';

  const [hisData,      setHisData]      = useState<any>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError,   setLookupError]   = useState<string | null>(null);

  const [form, setForm] = useState({
    mrn:              mrnParam,
    admissionDate:    new Date().toISOString().split('T')[0],
    activeDisciplines: [] as EicDiscipline[],
    primaryDiagnosis:  '',
    referralSource:    '',
    notes:             '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Auto-lookup HIS when MRN is pre-filled from search page
  useEffect(() => {
    if (mrnParam) lookupHis(mrnParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mrnParam]);

  const lookupHis = async (mrn: string) => {
    if (!mrn.trim()) return;
    setLookupLoading(true);
    setLookupError(null);
    try {
      const { hisData } = await eicApi.searchByMrn(mrn.trim());
      setHisData(hisData);
    } catch {
      setLookupError('Could not fetch patient from HIS. You may still proceed.');
    } finally {
      setLookupLoading(false);
    }
  };

  const toggleDiscipline = (d: EicDiscipline) => {
    setForm((prev) => ({
      ...prev,
      activeDisciplines: prev.activeDisciplines.includes(d)
        ? prev.activeDisciplines.filter((x) => x !== d)
        : [...prev.activeDisciplines, d],
    }));
  };

  const handleSubmit = async () => {
    if (!form.mrn.trim()) { setError('MRN is required'); return; }
    if (form.activeDisciplines.length === 0) { setError('Select at least one discipline'); return; }
    if (!form.admissionDate) { setError('Admission date is required'); return; }

    setSaving(true);
    setError(null);
    try {
      const enrollment = await eicApi.createEnrollment({
        mrn:               form.mrn.trim().toUpperCase(),
        admissionDate:     form.admissionDate,
        activeDisciplines: form.activeDisciplines,
        primaryDiagnosis:  form.primaryDiagnosis || undefined,
        referralSource:    form.referralSource   || undefined,
        notes:             form.notes            || undefined,
      });
      router.push(`/eic/enrollments/${enrollment.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to create enrollment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="New EIC Enrollment"
        subtitle="Register a patient in the Early Intervention Centre programme"
        icon={<AssignmentIndIcon />}
        back="/eic/patients"
        breadcrumbs={[
          { label: 'EIC', href: '/eic' },
          { label: 'Patients', href: '/eic/patients' },
          { label: 'New Enrollment' },
        ]}
      />

      {/* HIS patient preview */}
      {(lookupLoading || hisData || lookupError) && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            {lookupLoading && <CircularProgress size={20} />}
            {lookupError  && <Alert severity="warning" sx={{ mb: 0 }}>{lookupError}</Alert>}
            {hisData && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PersonIcon color="primary" />
                <Box>
                  <Typography fontWeight={600}>{hisData.fullName}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    MRN: {hisData.mrn} &nbsp;·&nbsp; {hisData.gender} &nbsp;·&nbsp;
                    {hisData.age ? `${hisData.age} years` : hisData.dateOfBirth}
                  </Typography>
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <CardContent>
          {/* Patient MRN */}
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>Patient</Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                label="MRN *"
                size="small"
                fullWidth
                value={form.mrn}
                onChange={(e) => setForm((p) => ({ ...p, mrn: e.target.value.toUpperCase() }))}
                onBlur={() => lookupHis(form.mrn)}
                helperText={mrnParam ? 'Pre-filled from patient search' : 'Patient will be pulled from HIS on save'}
                InputProps={{
                  readOnly: !!mrnParam,
                  endAdornment: mrnParam ? <LockIcon fontSize="small" sx={{ color: 'text.disabled' }} /> : undefined,
                }}
                sx={mrnParam ? { '& .MuiInputBase-root': { bgcolor: 'action.hover' } } : {}}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                label="Admission Date *"
                type="date"
                size="small"
                fullWidth
                value={form.admissionDate}
                onChange={(e) => setForm((p) => ({ ...p, admissionDate: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* Disciplines */}
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Therapy Disciplines *
          </Typography>
          <FormGroup row sx={{ mb: 3 }}>
            {ALL_DISCIPLINES.map((d) => (
              <FormControlLabel
                key={d}
                control={
                  <Checkbox
                    checked={form.activeDisciplines.includes(d)}
                    onChange={() => toggleDiscipline(d)}
                    size="small"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" fontWeight={500}>{DISCIPLINE_LABELS[d]}</Typography>
                    <Typography variant="caption" color="text.secondary">{d}</Typography>
                  </Box>
                }
                sx={{ mr: 3, mb: 1 }}
              />
            ))}
          </FormGroup>

          {form.activeDisciplines.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 3 }}>
              {form.activeDisciplines.map((d) => (
                <Chip key={d} label={DISCIPLINE_LABELS[d]} size="small" color="primary" />
              ))}
            </Box>
          )}

          <Divider sx={{ my: 2 }} />

          {/* Clinical info */}
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>Clinical Information</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Primary Diagnosis"
                size="small"
                fullWidth
                multiline
                rows={2}
                value={form.primaryDiagnosis}
                onChange={(e) => setForm((p) => ({ ...p, primaryDiagnosis: e.target.value }))}
                placeholder="e.g. Autism Spectrum Disorder (ASD), Intellectual Disability (ID)"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Referral Source"
                size="small"
                fullWidth
                value={form.referralSource}
                onChange={(e) => setForm((p) => ({ ...p, referralSource: e.target.value }))}
                placeholder="e.g. Paediatrician, Parent self-referral"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes"
                size="small"
                fullWidth
                multiline
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        <Button variant="outlined" onClick={() => router.back()}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          onClick={handleSubmit}
          disabled={saving}
        >
          Create Enrollment
        </Button>
      </Box>
    </Box>
  );
}

export default function NewEnrollmentPageWrapper() { return <Suspense fallback={null}><NewEnrollmentPage /></Suspense>; }
