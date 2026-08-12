import React, { useState } from 'react';
import { Box, Card, CardContent, CardHeader, Typography, Grid, Chip, Button, TextField, Divider, DialogTitle, DialogContent, DialogActions, IconButton } from '@mui/material';
import ResponsiveDialog from '../ResponsiveDialog';
import EditIcon from '@mui/icons-material/Edit';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { IncidentInvestigation, IncidentStatement } from '../../types/incident.types';
import { useUpdateInvestigation, useAddStatement, useIncidentInvestigationStatements } from '../../hooks/incident/use-incident-investigation';
import { getActionStatusColor, getActionStatusLabel } from '../../lib/utils/incident-formatters';
import { statementSchema, StatementInput } from '../../lib/validations/incident.schema';
import { useSnackbar } from 'notistack';
import { EmployeeName } from './EmployeeName';
import { getNextStepMessage } from '../../lib/utils/incident-workflow';

interface InvestigationCardProps {
  incidentId: string;
  investigation: IncidentInvestigation;
  // statements prop is no longer needed as we fetch it directly
  readOnly?: boolean;
}

export const InvestigationCard: React.FC<InvestigationCardProps> = ({ incidentId, investigation, readOnly = false }) => {
  const [openStatementDialog, setOpenStatementDialog] = useState(false);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const updateInv = useUpdateInvestigation(incidentId, investigation.id);
  const addStmt = useAddStatement(incidentId, investigation.id);
  const { data: statements = [] } = useIncidentInvestigationStatements(incidentId, investigation.id);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<StatementInput>({
    resolver: zodResolver(statementSchema),
    defaultValues: { statementType: 'WITNESS', personName: '', personRole: '', statementText: '', statementDate: new Date().toISOString().split('T')[0] }
  });

  const onAddStatement = async (data: StatementInput) => {
    try {
      await addStmt.mutateAsync(data);
      enqueueSnackbar('Statement added', { variant: 'success' });
      setOpenStatementDialog(false);
      reset();
    } catch (e) {
      enqueueSnackbar('Failed to add statement', { variant: 'error' });
    }
  };

  const { control: editControl, handleSubmit: handleEditSubmit, reset: resetEdit } = useForm({
    defaultValues: { findings: investigation.findings || '', timelineNotes: investigation.timelineNotes || '' }
  });

  const onUpdateInvestigation = async (data: { findings: string; timelineNotes: string }) => {
    try {
      await updateInv.mutateAsync({ findings: data.findings, timelineNotes: data.timelineNotes });
      enqueueSnackbar('Investigation updated', { variant: 'success' });
      setOpenEditDialog(false);
    } catch (e) {
      enqueueSnackbar('Failed to update investigation', { variant: 'error' });
    }
  };

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardHeader
        title={<Typography variant="h6">Investigation Findings</Typography>}
        action={
          <Chip
            label={getActionStatusLabel(investigation.status)}
            color={getActionStatusColor(investigation.status)}
            size="small"
          />
        }
      />
      <Divider />
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          {!readOnly && investigation.status !== 'COMPLETED' && (
            <Button startIcon={<EditIcon />} size="small" onClick={() => {
              resetEdit({ findings: investigation.findings || '', timelineNotes: investigation.timelineNotes || '' });
              setOpenEditDialog(true);
            }}>
              Edit Findings
            </Button>
          )}
        </Box>
        <Grid container spacing={3}>
          <Grid item xs={12} md={12}>
            <Typography variant="subtitle2" color="text.secondary">Lead Investigator</Typography>
            <Box sx={{ mt: 0.5 }}>
              <EmployeeName id={investigation.leadId} variant="body2" />
            </Box>
          </Grid>
          <Grid item xs={12} md={12}>
            <Typography variant="subtitle2" color="text.secondary">Findings</Typography>
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>
              {investigation.findings || 'No findings recorded yet.'}
            </Typography>
          </Grid>
          <Grid item xs={12} md={12}>
            <Typography variant="subtitle2" color="text.secondary">Timeline Notes</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              {investigation.timelineNotes || 'N/A'}
            </Typography>
          </Grid>
        </Grid>

        <Box sx={{ mt: 4, mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" fontWeight="bold">Statements & Interviews</Typography>
          {!readOnly && investigation.status !== 'COMPLETED' && (
            <Button variant="outlined" size="small" onClick={() => setOpenStatementDialog(true)}>
              Add Statement
            </Button>
          )}
        </Box>
        
        {statements.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No statements recorded.</Typography>
        ) : (
          <Grid container spacing={2}>
            {statements.map(stmt => (
              <Grid item xs={12} key={stmt.id}>
                <Card variant="outlined" sx={{ bgcolor: 'grey.50' }}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="subtitle2" fontWeight="bold">
                        {stmt.personName} <Typography component="span" variant="caption" color="text.secondary">({stmt.personRole})</Typography>
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Date: {stmt.statementDate ? new Date(stmt.statementDate).toLocaleDateString() : 'N/A'}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      "{stmt.statementText}"
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </CardContent>

      <ResponsiveDialog open={openStatementDialog} onClose={() => setOpenStatementDialog(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmit(onAddStatement)}>
          <DialogTitle>Add Statement</DialogTitle>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Controller
                  name="personName"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Person Name" fullWidth size="small" error={!!errors.personName} helperText={errors.personName?.message} />
                  )}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Controller
                  name="personRole"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Role" fullWidth size="small" error={!!errors.personRole} helperText={errors.personRole?.message} />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="statementDate"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Date Taken" type="date" fullWidth size="small" error={!!errors.statementDate} helperText={errors.statementDate?.message} InputLabelProps={{ shrink: true }} />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="statementText"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Statement" fullWidth multiline rows={4} error={!!errors.statementText} helperText={errors.statementText?.message} />
                  )}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenStatementDialog(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={addStmt.isPending}>Save</Button>
          </DialogActions>
        </form>
      </ResponsiveDialog>

      {/* Edit Investigation Dialog */}
      <ResponsiveDialog open={openEditDialog} onClose={() => setOpenEditDialog(false)} maxWidth="md" fullWidth>
        <form onSubmit={handleEditSubmit(onUpdateInvestigation)}>
          <DialogTitle>Edit Investigation</DialogTitle>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Controller
                  name="timelineNotes"
                  control={editControl}
                  render={({ field }) => (
                    <TextField {...field} label="Timeline Notes" fullWidth size="small" multiline rows={2} />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="findings"
                  control={editControl}
                  render={({ field }) => (
                    <TextField {...field} label="Findings" fullWidth multiline rows={6} />
                  )}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenEditDialog(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={updateInv.isPending}>Save</Button>
            <Button 
              variant="contained" 
              color="success" 
              disabled={updateInv.isPending}
              onClick={handleEditSubmit(async (data) => {
                try {
                  await updateInv.mutateAsync({ ...data, completedAt: new Date().toISOString() });
                  enqueueSnackbar(`Investigation completed. Next: ${getNextStepMessage('RCA_PENDING')}`, { variant: 'success' });
                  setOpenEditDialog(false);
                } catch (e) {
                  enqueueSnackbar('Failed to complete investigation', { variant: 'error' });
                }
              })}
            >
              Mark Completed
            </Button>
          </DialogActions>
        </form>
      </ResponsiveDialog>
    </Card>
  );
};
