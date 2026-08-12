import React from 'react';
import {
  DialogTitle, DialogContent, DialogActions, Button, Grid, TextField, MenuItem, Alert,
} from '@mui/material';
import ResponsiveDialog from '../ResponsiveDialog';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSnackbar } from 'notistack';
import { verificationSchema, VerificationInput } from '../../lib/validations/incident.schema';
import { useVerifyCapa } from '../../hooks/incident/use-incident-investigation';
import { IncidentCapa } from '../../types/incident.types';
import { getApiErrorMessage } from '../../lib/utils/api-error';
import { getNextStepMessage } from '../../lib/utils/incident-workflow';

interface VerificationFormDialogProps {
  incidentId: string;
  capa: IncidentCapa | null;
  open: boolean;
  onClose: () => void;
}

export const VerificationFormDialog: React.FC<VerificationFormDialogProps> = ({ incidentId, capa, open, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const verifyCapa = useVerifyCapa(incidentId, capa?.id || '');

  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm<VerificationInput>({
    resolver: zodResolver(verificationSchema),
    defaultValues: { outcome: 'APPROVED', notes: '' },
  });

  const outcome = watch('outcome');

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = async (data: VerificationInput) => {
    try {
      await verifyCapa.mutateAsync(data);
      enqueueSnackbar(
        data.outcome === 'APPROVED'
          ? `CAPA verified and approved. If every CAPA on this incident is approved, next: ${getNextStepMessage('VERIFICATION')}`
          : `CAPA sent back to quality team — incident returned to CAPA Pending. Next: ${getNextStepMessage('CAPA_PENDING')}`,
        { variant: data.outcome === 'APPROVED' ? 'success' : 'warning' },
      );
      handleClose();
    } catch (e) {
      enqueueSnackbar(getApiErrorMessage(e, 'Failed to record verification'), { variant: 'error' });
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>Verify CAPA{capa ? `: ${capa.title}` : ''}</DialogTitle>
        <DialogContent dividers>
          {outcome !== 'APPROVED' && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Rejecting or requesting more evidence reopens this CAPA and returns the incident to the CAPA stage.
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Controller
                name="outcome"
                control={control}
                render={({ field }) => (
                  <TextField {...field} select label="Verification Outcome" fullWidth size="small">
                    <MenuItem value="APPROVED">Approved</MenuItem>
                    <MenuItem value="REJECTED">Rejected</MenuItem>
                    <MenuItem value="NEED_MORE_EVIDENCE">Need More Evidence</MenuItem>
                  </TextField>
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Verification Notes"
                    fullWidth
                    multiline
                    rows={4}
                    size="small"
                    error={!!errors.notes}
                    helperText={errors.notes?.message}
                  />
                )}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={verifyCapa.isPending || !capa}>Submit Verification</Button>
        </DialogActions>
      </form>
    </ResponsiveDialog>
  );
};
