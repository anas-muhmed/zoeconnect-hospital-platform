import React from 'react';
import {
  DialogTitle, DialogContent, DialogActions, Button, Grid, TextField, MenuItem,
  FormControlLabel, Switch, Alert,
} from '@mui/material';
import ResponsiveDialog from '../ResponsiveDialog';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSnackbar } from 'notistack';
import { closureSchema, ClosureInput } from '../../lib/validations/incident.schema';
import { useIncidentWorkflow } from '../../hooks/incident/use-incident';
import { getApiErrorMessage } from '../../lib/utils/api-error';
import { getNextStepMessage } from '../../lib/utils/incident-workflow';

const RISK_SCALE = [1, 2, 3, 4, 5];

interface ClosureFormDialogProps {
  incidentId: string;
  open: boolean;
  onClose: () => void;
}

export const ClosureFormDialog: React.FC<ClosureFormDialogProps> = ({ incidentId, open, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { close } = useIncidentWorkflow(incidentId);

  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm<ClosureInput>({
    resolver: zodResolver(closureSchema),
    defaultValues: {
      closureNotes: '', lessonsLearned: '', residualRiskAccepted: false, residualRiskNotes: '',
    },
  });

  const residualRiskAccepted = watch('residualRiskAccepted');

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = async (data: ClosureInput) => {
    try {
      await close.mutateAsync(data);
      enqueueSnackbar(`Incident closed. ${getNextStepMessage('CLOSED')}`, { variant: 'success' });
      handleClose();
    } catch (e) {
      enqueueSnackbar(getApiErrorMessage(e, 'Failed to close incident'), { variant: 'error' });
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>Close Incident</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>
            Closure notes and lessons learned become part of the permanent audit record.
          </Alert>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Controller
                name="closureNotes"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Closure Notes" fullWidth multiline rows={3} size="small" error={!!errors.closureNotes} helperText={errors.closureNotes?.message} />
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <Controller
                name="lessonsLearned"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Lessons Learned" fullWidth multiline rows={3} size="small" />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Controller
                name="finalLikelihood"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Final Likelihood (1-5)"
                    fullWidth
                    size="small"
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                  >
                    <MenuItem value="">— Not assessed —</MenuItem>
                    {RISK_SCALE.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
                  </TextField>
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Controller
                name="finalImpact"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Final Impact (1-5)"
                    fullWidth
                    size="small"
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                  >
                    <MenuItem value="">— Not assessed —</MenuItem>
                    {RISK_SCALE.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
                  </TextField>
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <Controller
                name="residualRiskAccepted"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                    label="Residual risk accepted"
                  />
                )}
              />
            </Grid>
            {residualRiskAccepted && (
              <Grid item xs={12}>
                <Controller
                  name="residualRiskNotes"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Residual Risk Justification" fullWidth multiline rows={2} size="small" error={!!errors.residualRiskNotes} helperText={errors.residualRiskNotes?.message} />
                  )}
                />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button type="submit" variant="contained" color="success" disabled={close.isPending}>Close Incident</Button>
        </DialogActions>
      </form>
    </ResponsiveDialog>
  );
};
