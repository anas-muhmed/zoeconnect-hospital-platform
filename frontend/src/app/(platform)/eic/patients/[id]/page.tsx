'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SyncIcon from '@mui/icons-material/Sync';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import PersonIcon from '@mui/icons-material/Person';
import SaveIcon from '@mui/icons-material/Save';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import {
  eicApi,
  type EicPatient,
  type EicDevelopmentalHistory,
  type EicTherapyEnrollment,
  DISCIPLINE_LABELS,
} from '@/lib/api/eic.api';
import PageHeader from '@/components/PageHeader';


// ─── Status colour map ────────────────────────────────────────────────────────
const ENROLLMENT_STATUS_COLOUR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  ACTIVE:     'success',
  INITIATED:  'warning',
  ON_HOLD:    'warning',
  DISCHARGED: 'error',
  CLOSED:     'default',
};

// ─── DevHistory form ──────────────────────────────────────────────────────────
function DevHistoryForm({
  patientId,
  initial,
}: {
  patientId: string;
  initial: Partial<EicDevelopmentalHistory>;
}) {
  const [form, setForm]       = useState<Record<string, unknown>>(initial as any);
  const [saving, setSaving]   = useState(false);
  const [saved,  setSaved]    = useState(false);
  const [error,  setError]    = useState<string | null>(null);

  const set = (key: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await eicApi.saveDevelopmentalHistory(patientId, form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Failed to save developmental history');
    } finally {
      setSaving(false);
    }
  };

  const numField = (label: string, key: string) => (
    <Grid item xs={12} sm={6} md={4}>
      <TextField
        label={label}
        type="number"
        size="small"
        fullWidth
        value={(form as Record<string, unknown>)[key] as string ?? ''}
        onChange={(e) => set(key, e.target.value ? Number(e.target.value) : null)}
      />
    </Grid>
  );

  const txtField = (label: string, key: string, multiline = false) => (
    <Grid item xs={12} sm={multiline ? 12 : 6}>
      <TextField
        label={label}
        size="small"
        fullWidth
        multiline={multiline}
        rows={multiline ? 3 : 1}
        value={(form[key] as string) ?? ''}
        onChange={(e) => set(key, e.target.value || null)}
      />
    </Grid>
  );

  return (
    <Box>
      {error  && <Alert severity="error"   sx={{ mb: 2 }}>{error}</Alert>}
      {saved  && <Alert severity="success" sx={{ mb: 2 }}>Developmental history saved.</Alert>}

      {/* Prenatal */}
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, mt: 1 }}>Prenatal</Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <TextField
            select label="Pregnancy Type" size="small" fullWidth
            value={(form.pregnancyType as string) ?? ''}
            onChange={(e) => set('pregnancyType', e.target.value || null)}
          >
            {['', 'FULL_TERM', 'PREMATURE', 'POST_TERM'].map((v) => (
              <MenuItem key={v} value={v}>{v || '— Select —'}</MenuItem>
            ))}
          </TextField>
        </Grid>
        {numField('Maternal Age at Birth', 'maternalAgeAtBirth')}
      </Grid>

      {/* Natal */}
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Natal</Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <TextField
            select label="Delivery Type" size="small" fullWidth
            value={(form.deliveryType as string) ?? ''}
            onChange={(e) => set('deliveryType', e.target.value || null)}
          >
            {['', 'NORMAL', 'LSCS', 'FORCEPS', 'VACUUM'].map((v) => (
              <MenuItem key={v} value={v}>{v || '— Select —'}</MenuItem>
            ))}
          </TextField>
        </Grid>
        {numField('Gestational Age (weeks)', 'gestationalAgeWeeks')}
        {numField('Birth Weight (kg)', 'birthWeightKg')}
        <Grid item xs={12} sm={6} md={4}>
          <TextField
            select label="Birth Cry" size="small" fullWidth
            value={form.birthCry == null ? '' : String(form.birthCry)}
            onChange={(e) => set('birthCry', e.target.value === '' ? null : e.target.value === 'true')}
          >
            {[['', '— Select —'], ['true', 'Present'], ['false', 'Absent']].map(([v, l]) => (
              <MenuItem key={v} value={v}>{l}</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <TextField
            select label="NICU Stay" size="small" fullWidth
            value={form.nicuStay == null ? '' : String(form.nicuStay)}
            onChange={(e) => set('nicuStay', e.target.value === '' ? null : e.target.value === 'true')}
          >
            {[['', '— Select —'], ['true', 'Yes'], ['false', 'No']].map(([v, l]) => (
              <MenuItem key={v} value={v}>{l}</MenuItem>
            ))}
          </TextField>
        </Grid>
        {!!(form as any).nicuStay && numField('NICU Duration (days)', 'nicuDurationDays')}
      </Grid>

      {/* Postnatal */}
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Postnatal</Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {['postnatalJaundice', 'postnatalSeizures'].map((key) => (
          <Grid item xs={12} sm={6} md={4} key={key}>
            <TextField
              select label={key === 'postnatalJaundice' ? 'Jaundice' : 'Seizures'}
              size="small" fullWidth
              value={form[key] == null ? '' : String(form[key])}
              onChange={(e) => set(key, e.target.value === '' ? null : e.target.value === 'true')}
            >
              {[['', '— Select —'], ['true', 'Yes'], ['false', 'No']].map(([v, l]) => (
                <MenuItem key={v} value={v}>{l}</MenuItem>
              ))}
            </TextField>
          </Grid>
        ))}
        {txtField('Other Postnatal', 'postnatalOther')}
      </Grid>

      {/* Milestones */}
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Developmental Milestones (age in months)</Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          ['Neck Holding', 'neckHoldingMonths'],
          ['Sitting',      'sittingMonths'],
          ['Standing',     'standingMonths'],
          ['Walking',      'walkingMonths'],
          ['First Words',  'firstWordsMonths'],
          ['Phrases',      'phrasesMonths'],
          ['Sentences',    'sentencesMonths'],
        ].map(([label, key]) => numField(label, key))}
      </Grid>

      {/* Medical History */}
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Medical History</Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {txtField('Diagnosis', 'diagnosis')}
        {txtField('Current Medications', 'currentMedications')}
        {txtField('Previous Therapy', 'previousTherapy')}
        {txtField('Family History', 'familyHistory', true)}
        {txtField('Remarks', 'remarks', true)}
      </Grid>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving}
        >
          Save Developmental History
        </Button>
      </Box>
    </Box>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function EicPatientDetailPage() {
  const params  = useParams();
  const router  = useRouter();
  const id      = params.id as string;

  const [tab,         setTab]         = useState(0);
  const [patient,     setPatient]     = useState<EicPatient | null>(null);
  const [devHistory,  setDevHistory]  = useState<Partial<EicDevelopmentalHistory>>({});
  const [enrollments, setEnrollments] = useState<EicTherapyEnrollment[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [syncing,     setSyncing]     = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [p, dh, enr] = await Promise.all([
          eicApi.getPatient(id),
          eicApi.getDevelopmentalHistory(id),
          eicApi.getPatientEnrollments(id),
        ]);
        setPatient(p);
        setDevHistory(dh ?? {});
        setEnrollments(enr);
      } catch {
        setError('Failed to load patient');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const updated = await eicApi.syncFromHis(id);
      setPatient(updated);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
      <CircularProgress />
    </Box>
  );

  if (error || !patient) return (
    <Alert severity="error">{error ?? 'Patient not found'}</Alert>
  );

  return (
    <Box>
      <PageHeader
        title={patient.fullName}
        subtitle={`MRN: ${patient.mrn}`}
        icon={<PersonIcon />}
        back="/eic/patients"
        breadcrumbs={[
          { label: 'EIC', href: '/eic' },
          { label: 'Patients', href: '/eic/patients' },
          { label: patient.fullName },
        ]}
        actions={
          <>
            <Chip label={patient.isActive ? 'Active' : 'Inactive'} color={patient.isActive ? 'success' : 'default'} size="small" />
            <Tooltip title="Sync demographics from HIS" arrow>
              <IconButton size="small" onClick={handleSync} disabled={syncing}
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }} aria-label="Sync demographics from HIS">
                <SyncIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        }
      />

      {/* Quick info bar */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent sx={{ py: '12px !important' }}>
          <Grid container spacing={3}>
            {[
              ['Gender',  patient.gender ?? '—'],
              ['DOB',     patient.dateOfBirth ?? '—'],
              ['Age',     patient.ageYears != null ? `${patient.ageYears}y ${patient.ageMonths ?? 0}m` : '—'],
              ['Father',  patient.fatherName ?? '—'],
              ['Mother',  patient.motherName ?? '—'],
              ['Contact', patient.parentContact ?? patient.mobile ?? '—'],
              ['Referring Doctor', patient.referringDoctorName ?? '—'],
            ].map(([label, value]) => (
              <Grid item key={label}>
                <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                <Typography variant="body2" fontWeight={500}>{value}</Typography>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tab label="Enrollments" />
        <Tab label="Developmental History" />
      </Tabs>

      {/* Enrollments tab */}
      {tab === 0 && (
        <Box>
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddCircleIcon />}
              onClick={() => router.push(`/eic/enrollments/new?mrn=${patient.mrn}`)}
            >
              New Enrollment
            </Button>
          </Box>

          {enrollments.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
              No enrollments yet.
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableBody>
                  {enrollments.map((enr) => (
                    <TableRow
                      key={enr.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => router.push(`/eic/enrollments/${enr.id}`)}
                    >
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace" fontWeight={600}>
                          {enr.enrollmentNumber}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {enr.activeDisciplines.map((d) => (
                            <Chip key={d} label={DISCIPLINE_LABELS[d]} size="small" />
                          ))}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">Admitted</Typography>
                        <Typography variant="body2">{enr.admissionDate}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={enr.status}
                          color={ENROLLMENT_STATUS_COLOUR[enr.status] ?? 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <OpenInNewIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      {/* Developmental History tab */}
      {tab === 1 && (
        <DevHistoryForm patientId={id} initial={devHistory} />
      )}
    </Box>
  );
}
