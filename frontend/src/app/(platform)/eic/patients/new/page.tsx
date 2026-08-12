'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';

import ArrowBackIcon  from '@mui/icons-material/ArrowBack';
import PersonAddIcon  from '@mui/icons-material/PersonAdd';
import WarningIcon    from '@mui/icons-material/Warning';

import { eicApi } from '@/lib/api/eic.api';
import PageHeader from '@/components/PageHeader';

const SALUTATIONS = ['Master', 'Miss', 'Mr', 'Mrs', 'Dr'];
const GENDERS     = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'];

interface FormState {
  mrn:                 string;
  salutation:          string;
  firstName:           string;
  middleName:          string;
  lastName:            string;
  gender:              string;
  dateOfBirth:         string;
  mobile:              string;
  email:               string;
  fatherName:          string;
  motherName:          string;
  parentContact:       string;
  parentEmail:         string;
  referringDoctorName: string;
}

const EMPTY: FormState = {
  mrn: '', salutation: '', firstName: '', middleName: '', lastName: '',
  gender: '', dateOfBirth: '', mobile: '', email: '',
  fatherName: '', motherName: '', parentContact: '', parentEmail: '',
  referringDoctorName: '',
};

export default function EicManualPatientPage() {
  const router = useRouter();
  const [form,    setForm]    = useState<FormState>(EMPTY);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const set = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.mrn.trim() || !form.firstName.trim() || !form.lastName.trim()) {
      setError('MRN, First Name, and Last Name are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const patient = await eicApi.createPatientManual({
        mrn:                 form.mrn.trim().toUpperCase(),
        salutation:          form.salutation  || undefined,
        firstName:           form.firstName.trim(),
        middleName:          form.middleName.trim() || undefined,
        lastName:            form.lastName.trim(),
        gender:              form.gender      || undefined,
        dateOfBirth:         form.dateOfBirth || undefined,
        mobile:              form.mobile.trim()  || undefined,
        email:               form.email.trim()   || undefined,
        fatherName:          form.fatherName.trim()  || undefined,
        motherName:          form.motherName.trim()  || undefined,
        parentContact:       form.parentContact.trim() || undefined,
        parentEmail:         form.parentEmail.trim()   || undefined,
        referringDoctorName: form.referringDoctorName.trim() || undefined,
      });
      router.push(`/eic/patients/${patient.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to create patient');
      setSaving(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Register Patient Manually"
        subtitle="Use only when HIS is unavailable — sync demographics after HIS is restored"
        icon={<PersonAddIcon />}
        back="/eic/patients/search"
        breadcrumbs={[
          { label: 'EIC', href: '/eic' },
          { label: 'Patients', href: '/eic/patients' },
          { label: 'Manual Registration' },
        ]}
      />

      <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 3 }}>
        Use manual registration only when the Hospital Information System (HIS) is unavailable.
        Once HIS is restored, sync this patient's demographics via the HIS Sync page.
      </Alert>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Identity */}
      <Card sx={{ mb: 3 }}>
        <CardHeader title="Patient Identity" titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }} />
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField
                label="MRN *"
                fullWidth size="small"
                value={form.mrn}
                onChange={(e) => setForm((p) => ({ ...p, mrn: e.target.value.toUpperCase() }))}
                helperText="Hospital Medical Record Number"
              />
            </Grid>
            <Grid item xs={12} sm={2}>
              <TextField
                select label="Salutation" fullWidth size="small"
                value={form.salutation} onChange={set('salutation')}
              >
                <MenuItem value="">—</MenuItem>
                {SALUTATIONS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} />

            <Grid item xs={12} sm={4}>
              <TextField label="First Name *" fullWidth size="small" value={form.firstName} onChange={set('firstName')} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Middle Name" fullWidth size="small" value={form.middleName} onChange={set('middleName')} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Last Name *" fullWidth size="small" value={form.lastName} onChange={set('lastName')} />
            </Grid>

            <Grid item xs={12} sm={3}>
              <TextField
                select label="Gender" fullWidth size="small"
                value={form.gender} onChange={set('gender')}
              >
                <MenuItem value="">—</MenuItem>
                {GENDERS.map((g) => <MenuItem key={g} value={g}>{g.replace(/_/g, ' ')}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                label="Date of Birth" type="date" fullWidth size="small"
                value={form.dateOfBirth} onChange={set('dateOfBirth')}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card sx={{ mb: 3 }}>
        <CardHeader title="Contact Details" titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }} />
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField label="Mobile" fullWidth size="small" value={form.mobile} onChange={set('mobile')} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Email" type="email" fullWidth size="small" value={form.email} onChange={set('email')} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Family */}
      <Card sx={{ mb: 3 }}>
        <CardHeader title="Family Details" titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }} />
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField label="Father's Name" fullWidth size="small" value={form.fatherName} onChange={set('fatherName')} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Mother's Name" fullWidth size="small" value={form.motherName} onChange={set('motherName')} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Parent Contact" fullWidth size="small" value={form.parentContact} onChange={set('parentContact')} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Parent Email" type="email" fullWidth size="small" value={form.parentEmail} onChange={set('parentEmail')} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Referral */}
      <Card sx={{ mb: 3 }}>
        <CardHeader title="Referral" titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }} />
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField label="Referring Doctor Name" fullWidth size="small" value={form.referringDoctorName} onChange={set('referringDoctorName')} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Divider sx={{ mb: 3 }} />

      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <PersonAddIcon />}
          onClick={handleSubmit}
          disabled={saving}
        >
          Register Patient
        </Button>
        <Button variant="outlined" onClick={() => router.back()} disabled={saving}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}
