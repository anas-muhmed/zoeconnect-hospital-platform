import React from 'react';
import { DialogTitle, DialogContent, DialogActions, Button, Typography, Alert } from '@mui/material';
import ResponsiveDialog from '../ResponsiveDialog';
import { useSnackbar } from 'notistack';
import { useIncidentWorkflow } from '../../hooks/incident/use-incident';
import { getApiErrorMessage } from '../../lib/utils/api-error';
import { getNextStepMessage } from '../../lib/utils/incident-workflow';

interface ReopenDialogProps {
  incidentId: string;
  open: boolean;
  onClose: () => void;
}

export const ReopenDialog: React.FC<ReopenDialogProps> = ({ incidentId, open, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { reopen } = useIncidentWorkflow(incidentId);

  const handleReopen = async () => {
    try {
      await reopen.mutateAsync();
      enqueueSnackbar(`Incident reopened for investigation. Next: ${getNextStepMessage('INVESTIGATION')}`, { variant: 'success' });
      onClose();
    } catch (e) {
      enqueueSnackbar(getApiErrorMessage(e, 'Failed to reopen incident'), { variant: 'error' });
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Reopen Incident</DialogTitle>
      <DialogContent dividers>
        <Alert severity="warning" sx={{ mb: 2 }}>
          This is a controlled reopen — the incident will move back to the Investigation stage.
        </Alert>
        <Typography variant="body2" color="text.secondary">
          Confirm you want to reopen this closed incident. The reopen is recorded automatically in the audit timeline.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="warning" onClick={handleReopen} disabled={reopen.isPending}>
          Reopen Incident
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
};
