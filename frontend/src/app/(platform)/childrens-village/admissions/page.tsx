"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Grid from '@mui/material/Grid';
import CircularProgress from '@mui/material/CircularProgress';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PageHeader from '@/components/PageHeader';
import { apiClient } from '@/lib/api/client';

const STEPS = ['Student Details', 'Medical Profile', 'Guardians'];

export default function AdmissionWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: '',
    bloodGroup: '',
    allergies: '',
    disabilityType: '',
    guardians: [{ firstName: '', lastName: '', relationship: 'Mother', email: '', phone: '', isPrimaryGuardian: true }]
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nextStep = () => setStep(prev => prev + 1);
  const prevStep = () => setStep(prev => prev - 1);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleGuardianChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const newGuardians = [...formData.guardians];
    newGuardians[index] = { ...newGuardians[index], [name]: value };
    setFormData(prev => ({ ...prev, guardians: newGuardians }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // apiClient carries the Bearer token, X-Request-ID, and 401 refresh
      // handling every other module's API calls use (see lib/api/client.ts)
      // -- the previous bare fetch() hit the wrong path (missing the /v1
      // prefix the backend's URI versioning adds) and sent no auth header,
      // so every submission 404'd/401'd before reaching the controller.
      const { data: result } = await apiClient.post('/childrens-village/admissions', formData);
      router.push(`/childrens-village/students/${result.id}`);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error creating admission');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="New Student Admission"
        subtitle="Register a new student into the Children's Village program"
        icon={<PersonAddIcon />}
      />

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3, maxWidth: 800, mx: 'auto' }}>
        <Stepper activeStep={step - 1} sx={{ mb: 4 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {step === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="First Name"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Last Name"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Date of Birth"
                  name="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={handleChange}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel id="gender-label">Gender</InputLabel>
                  <Select
                    labelId="gender-label"
                    label="Gender"
                    name="gender"
                    value={formData.gender}
                    onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value as string }))}
                  >
                    <MenuItem value="">Select...</MenuItem>
                    <MenuItem value="MALE">Male</MenuItem>
                    <MenuItem value="FEMALE">Female</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 2 }}>
              <Button variant="contained" onClick={nextStep}>Next Step</Button>
            </Box>
          </Box>
        )}

        {step === 2 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel id="blood-group-label">Blood Group</InputLabel>
                  <Select
                    labelId="blood-group-label"
                    label="Blood Group"
                    name="bloodGroup"
                    value={formData.bloodGroup}
                    onChange={(e) => setFormData(prev => ({ ...prev, bloodGroup: e.target.value as string }))}
                  >
                    <MenuItem value="">Select...</MenuItem>
                    <MenuItem value="A+">A+</MenuItem>
                    <MenuItem value="O+">O+</MenuItem>
                    <MenuItem value="B+">B+</MenuItem>
                    <MenuItem value="AB+">AB+</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Allergies"
                  name="allergies"
                  value={formData.allergies}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Disability Type"
                  name="disabilityType"
                  placeholder="e.g. ASD, ADHD, Down Syndrome"
                  value={formData.disabilityType}
                  onChange={handleChange}
                />
              </Grid>
            </Grid>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 2 }}>
              <Button variant="outlined" color="inherit" onClick={prevStep}>Previous</Button>
              <Button variant="contained" onClick={nextStep}>Next Step</Button>
            </Box>
          </Box>
        )}

        {step === 3 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2, bgcolor: 'grey.50' }}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Primary Guardian
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="First Name"
                    name="firstName"
                    value={formData.guardians[0].firstName}
                    onChange={(e) => handleGuardianChange(0, e)}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Last Name"
                    name="lastName"
                    value={formData.guardians[0].lastName}
                    onChange={(e) => handleGuardianChange(0, e)}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Phone"
                    name="phone"
                    value={formData.guardians[0].phone}
                    onChange={(e) => handleGuardianChange(0, e)}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Email"
                    name="email"
                    type="email"
                    value={formData.guardians[0].email}
                    onChange={(e) => handleGuardianChange(0, e)}
                  />
                </Grid>
              </Grid>
            </Paper>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 2 }}>
              <Button variant="outlined" color="inherit" onClick={prevStep}>Previous</Button>
              <Button
                variant="contained"
                color="success"
                onClick={handleSubmit}
                disabled={isSubmitting}
                startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                {isSubmitting ? 'Submitting...' : 'Complete Admission'}
              </Button>
            </Box>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
