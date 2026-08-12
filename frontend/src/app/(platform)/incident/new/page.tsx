'use client';

import React, { useState, useEffect } from 'react';
import { Box, Paper, Grid, TextField, Button, Typography, MenuItem, Select, FormControl, InputLabel, Divider, Accordion, AccordionSummary, AccordionDetails, Switch, FormControlLabel } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useSnackbar } from 'notistack';
import PageHeader from '../../../../components/PageHeader';
import { INCIDENT_ROUTES } from '../../../../lib/constants/incident-routes';
import { createIncidentSchema, CreateIncidentInput } from '../../../../lib/validations/incident.schema';
import { useCreateIncident } from '../../../../hooks/incident/use-incident';
import { useIncidentCategories, useIncidentTypes, useIncidentSeverityLevels } from '../../../../hooks/incident/use-incident-settings';
import PatientSearch from '../../../../components/PatientSearch';
import { EmployeeLookup } from '../../../../components/incident/EmployeeLookup';
import { incidentApi } from '../../../../lib/api/incident.api';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

const DRAFT_KEY = 'hdsp_incident_draft';

export default function CreateIncidentPage() {
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();
  const createMutation = useCreateIncident();
  
  const { data: categories = [] } = useIncidentCategories();
  const { data: severityLevels = [] } = useIncidentSeverityLevels();

  const [files, setFiles] = useState<File[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);

  const { control, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<CreateIncidentInput>({
    resolver: zodResolver(createIncidentSchema),
    defaultValues: {
      categoryId: '',
      typeId: '',
      severityCode: '',
      incidentDate: new Date().toISOString().slice(0, 16),
      department: '',
      description: '',
      isAnonymous: false,
      isNearMiss: false,
      isSentinelEvent: false,
      tags: [],
    }
  });

  const watchCategoryId = watch('categoryId');
  const { data: types = [] } = useIncidentTypes(watchCategoryId);

  // Auto-save draft
  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        Object.keys(parsed).forEach(key => {
          setValue(key as any, parsed[key]);
        });
        enqueueSnackbar('Draft restored', { variant: 'info' });
      } catch (e) {}
    }
  }, [setValue, enqueueSnackbar]);

  useEffect(() => {
    const subscription = watch((value) => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(value));
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const onSubmit = async (data: CreateIncidentInput) => {
    try {
      if (selectedPatient) data.patientMrn = selectedPatient.mrn;
      if (selectedEmployee) data.employeeId = selectedEmployee.id;

      // Create incident
      const incident = await createMutation.mutateAsync(data as any);

      // Upload files if any
      if (files.length > 0) {
        for (const file of files) {
          await incidentApi.uploadAttachment(incident.id, 'INCIDENT', incident.id, file);
        }
      }

      localStorage.removeItem(DRAFT_KEY);
      enqueueSnackbar('Incident reported successfully', { variant: 'success' });
      router.push(INCIDENT_ROUTES.DETAIL(incident.id));
    } catch (error) {
      console.error(error);
      enqueueSnackbar('Failed to report incident', { variant: 'error' });
    }
  };

  return (
    <Box>
      <PageHeader
        title="Report New Incident"
        subtitle="Quick report form (< 2 mins)"
      />
      <Paper sx={{ p: { xs: 2, md: 4 }, mt: 3, maxWidth: 900, mx: 'auto' }}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={3}>
            
            {/* Essential Information */}
            <Grid item xs={12}>
              <Typography variant="h6">Essential Information</Typography>
              <Divider sx={{ mb: 2 }} />
            </Grid>

            <Grid item xs={12} sm={6}>
              <Controller
                name="incidentDate"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Date & Time of Incident" type="datetime-local" fullWidth InputLabelProps={{ shrink: true }} error={!!errors.incidentDate} helperText={errors.incidentDate?.message} />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Controller
                name="department"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Department / Location" fullWidth error={!!errors.department} helperText={errors.department?.message} />
                )}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <Controller
                name="categoryId"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.categoryId}>
                    <InputLabel>Category</InputLabel>
                    <Select {...field} label="Category">
                      {categories.map((c: any) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Controller
                name="typeId"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.typeId} disabled={!watchCategoryId}>
                    <InputLabel>Type</InputLabel>
                    <Select {...field} label="Type">
                      {types.map((t: any) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                )}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <Controller
                name="severityCode"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.severityCode}>
                    <InputLabel>Severity</InputLabel>
                    <Select {...field} label="Severity">
                      {severityLevels.map((s: any) => <MenuItem key={s.id} value={s.code}>{s.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                )}
              />
            </Grid>

            <Grid item xs={12}>
              <Controller
                name="description"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="What happened? (Description)" multiline rows={4} fullWidth error={!!errors.description} helperText={errors.description?.message} />
                )}
              />
            </Grid>

            {/* Involvements */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ mt: 2 }}>Involvements (Optional)</Typography>
              <Divider sx={{ mb: 2 }} />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <PatientSearch 
                label="Search Affected Patient (Optional)" 
                onSelect={(p) => setSelectedPatient(p)} 
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <EmployeeLookup 
                value={selectedEmployee} 
                onChange={(e) => setSelectedEmployee(e)} 
                label="Search Affected Employee (Optional)" 
              />
            </Grid>

            {/* Attachments */}
            <Grid item xs={12}>
              <Box sx={{ border: '1px dashed #ccc', borderRadius: 2, p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
                <CloudUploadIcon color="primary" sx={{ fontSize: 40 }} />
                <Typography variant="body1" sx={{ mt: 1 }}>Drag & Drop files here or click to browse</Typography>
                <Button component="label" variant="outlined" sx={{ mt: 2 }}>
                  Browse Files
                  <input type="file" hidden multiple onChange={onFileChange} />
                </Button>
                {files.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" fontWeight="bold">Selected Files:</Typography>
                    {files.map((f, i) => <Typography key={i} variant="caption" display="block">{f.name}</Typography>)}
                  </Box>
                )}
              </Box>
            </Grid>

            {/* Advanced Section */}
            <Grid item xs={12}>
              <Accordion sx={{ mt: 2 }} elevation={0} variant="outlined">
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography fontWeight="bold">Advanced Settings</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Controller
                        name="immediateAction"
                        control={control}
                        render={({ field }) => (
                          <TextField {...field} label="Immediate Action Taken" multiline rows={2} fullWidth />
                        )}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Controller
                        name="isNearMiss"
                        control={control}
                        render={({ field }) => (
                          <FormControlLabel control={<Switch checked={field.value} onChange={e => field.onChange(e.target.checked)} />} label="Is Near Miss?" />
                        )}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Controller
                        name="isSentinelEvent"
                        control={control}
                        render={({ field }) => (
                          <FormControlLabel control={<Switch checked={field.value} onChange={e => field.onChange(e.target.checked)} />} label="Is Sentinel Event?" />
                        )}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Controller
                        name="isAnonymous"
                        control={control}
                        render={({ field }) => (
                          <FormControlLabel control={<Switch checked={field.value} onChange={e => field.onChange(e.target.checked)} />} label="Report Anonymously?" />
                        )}
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>

            <Grid item xs={12}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3, gap: 2 }}>
                <Button variant="outlined" onClick={() => router.back()}>Cancel</Button>
                <Button type="submit" variant="contained" color="primary" disabled={isSubmitting || createMutation.isPending}>
                  {isSubmitting || createMutation.isPending ? 'Submitting...' : 'Submit Incident'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </Box>
  );
}
