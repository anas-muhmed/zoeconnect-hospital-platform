import React, { useState } from 'react';
import { Box, Card, CardContent, CardHeader, Typography, Grid, Chip, Button, TextField, Divider, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import ResponsiveDialog from '../ResponsiveDialog';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { IncidentRca, RcaFiveWhy as FiveWhyType } from '../../types/incident.types';
import { useAddFiveWhy } from '../../hooks/incident/use-incident-investigation';
import { getActionStatusColor, getActionStatusLabel } from '../../lib/utils/incident-formatters';
import { fiveWhySchema, FiveWhyInput } from '../../lib/validations/incident.schema';
import { useSnackbar } from 'notistack';

interface RcaFiveWhyProps {
  incidentId: string;
  rca: IncidentRca;
  fiveWhys?: FiveWhyType[];
  readOnly?: boolean;
}

export const RcaFiveWhy: React.FC<RcaFiveWhyProps> = ({ incidentId, rca, fiveWhys = [], readOnly = false }) => {
  const [openDialog, setOpenDialog] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const addFiveWhy = useAddFiveWhy(incidentId, rca.id);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FiveWhyInput>({
    resolver: zodResolver(fiveWhySchema),
    defaultValues: { problemStatement: '', why1: '', why2: '', why3: '', why4: '', why5: '', rootCause: '' }
  });

  const onSubmit = async (data: FiveWhyInput) => {
    try {
      await addFiveWhy.mutateAsync(data);
      enqueueSnackbar('5 Why Analysis added', { variant: 'success' });
      setOpenDialog(false);
      reset();
    } catch (e) {
      enqueueSnackbar('Failed to add analysis', { variant: 'error' });
    }
  };

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardHeader
        title={<Typography variant="h6">Root Cause Analysis (5 Whys)</Typography>}
        action={
          <Chip
            label={getActionStatusLabel(rca.status)}
            color={getActionStatusColor(rca.status)}
            size="small"
          />
        }
      />
      <Divider />
      <CardContent>
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" fontWeight="bold">Analyses</Typography>
          {!readOnly && rca.status !== 'COMPLETED' && (
            <Button variant="outlined" size="small" onClick={() => setOpenDialog(true)}>
              Add 5 Why Analysis
            </Button>
          )}
        </Box>
        
        {fiveWhys.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No 5 Whys recorded.</Typography>
        ) : (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Card variant="outlined" sx={{ bgcolor: 'grey.50' }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                    Problem: {rca.summary || 'N/A'}
                  </Typography>
                  <Box sx={{ ml: 2, borderLeft: '2px solid #ccc', pl: 2, py: 0.5, mb: 1 }}>
                    {fiveWhys.map(why => (
                      <Typography key={why.id} variant="body2" sx={{ mb: 0.5 }}>
                        {why.whyNumber}. Why? {why.whyText} {why.because && <Typography component="span" color="text.secondary"> (Because: {why.because})</Typography>}
                      </Typography>
                    ))}
                  </Box>
                  <Typography variant="subtitle2" color="error.main" fontWeight="bold">
                    Root Cause: {rca.rootCause || 'N/A'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}
      </CardContent>

      <ResponsiveDialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogTitle>Add 5 Why Analysis</DialogTitle>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Controller
                  name="problemStatement"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Problem Statement" fullWidth size="small" error={!!errors.problemStatement} helperText={errors.problemStatement?.message} />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="why1"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Why 1" fullWidth size="small" error={!!errors.why1} helperText={errors.why1?.message} />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="why2"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Why 2 (Optional)" fullWidth size="small" />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="why3"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Why 3 (Optional)" fullWidth size="small" />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="why4"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Why 4 (Optional)" fullWidth size="small" />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="why5"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Why 5 (Optional)" fullWidth size="small" />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="rootCause"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Identified Root Cause" fullWidth multiline rows={2} error={!!errors.rootCause} helperText={errors.rootCause?.message} />
                  )}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={addFiveWhy.isPending}>Save</Button>
          </DialogActions>
        </form>
      </ResponsiveDialog>
    </Card>
  );
};
