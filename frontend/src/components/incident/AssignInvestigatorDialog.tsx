import React, { useState } from 'react';
import { DialogTitle, DialogContent, DialogActions, Button, Box } from '@mui/material';
import ResponsiveDialog from '../ResponsiveDialog';
import { useSnackbar } from 'notistack';
import { EmployeeLookup } from './EmployeeLookup';
import { useIncidentWorkflow } from '../../hooks/incident/use-incident';
import { getApiErrorMessage } from '../../lib/utils/api-error';
import { getNextStepMessage } from '../../lib/utils/incident-workflow';

interface AssignInvestigatorDialogProps {
  incidentId: string;
  open: boolean;
  onClose: () => void;
}

export const AssignInvestigatorDialog: React.FC<AssignInvestigatorDialogProps> = ({ incidentId, open, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { assign } = useIncidentWorkflow(incidentId);
  const [investigator, setInvestigator] = useState<{ id: string; name: string } | null>(null);

  const handleClose = () => {
    setInvestigator(null);
    onClose();
  };

  const handleAssign = async () => {
    if (!investigator) return;
    try {
      await assign.mutateAsync(investigator.id);
      enqueueSnackbar(`Investigator assigned. Next: ${getNextStepMessage('ASSIGNED')}`, { variant: 'success' });
      handleClose();
    } catch (e) {
      enqueueSnackbar(getApiErrorMessage(e, 'Failed to assign investigator'), { variant: 'error' });
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Assign Investigator</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ pt: 1 }}>
          <EmployeeLookup value={investigator} onChange={setInvestigator} label="Lead Investigator" />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" onClick={handleAssign} disabled={!investigator || assign.isPending}>
          Assign
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
};
