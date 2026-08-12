import React, { useState } from 'react';
import {
  DialogTitle, DialogContent, DialogActions, Button, Grid, TextField, MenuItem,
} from '@mui/material';
import ResponsiveDialog from '../ResponsiveDialog';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSnackbar } from 'notistack';
import { capaSchema, CapaInput } from '../../lib/validations/incident.schema';
import { useCreateCapa } from '../../hooks/incident/use-incident-investigation';
import { EmployeeLookup } from './EmployeeLookup';
import { getApiErrorMessage } from '../../lib/utils/api-error';

interface CapaFormDialogProps {
  incidentId: string;
  open: boolean;
  onClose: () => void;
}

const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export const CapaFormDialog: React.FC<CapaFormDialogProps> = ({ incidentId, open, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const createCapa = useCreateCapa(incidentId);
  // Tracked separately from the form's ownerId (a bare string) so the
  // Autocomplete can keep showing the picked person's name instead of
  // round-tripping through the id and losing it.
  const [selectedOwner, setSelectedOwner] = useState<{ id: string; name: string } | null>(null);

  const { control, handleSubmit, reset, setValue, formState: { errors } } = useForm<CapaInput>({
    resolver: zodResolver(capaSchema),
    defaultValues: {
      title: '', capaType: 'CORRECTIVE', description: '', ownerId: '', ownerName: '', department: '',
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      priorityCode: 'MEDIUM',
    },
  });

  const handleClose = () => {
    reset();
    setSelectedOwner(null);
    onClose();
  };

  const onSubmit = async (data: CapaInput) => {
    try {
      await createCapa.mutateAsync(data);
      enqueueSnackbar('CAPA created. Next: work the action, then mark it In Progress and Completed from its card.', { variant: 'success' });
      handleClose();
    } catch (e) {
      enqueueSnackbar(getApiErrorMessage(e, 'Failed to create CAPA'), { variant: 'error' });
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>New Corrective / Preventive Action</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={8}>
              <Controller
                name="title"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Title" fullWidth size="small" error={!!errors.title} helperText={errors.title?.message} />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Controller
                name="capaType"
                control={control}
                render={({ field }) => (
                  <TextField {...field} select label="Type" fullWidth size="small">
                    <MenuItem value="CORRECTIVE">Corrective</MenuItem>
                    <MenuItem value="PREVENTIVE">Preventive</MenuItem>
                  </TextField>
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <Controller
                name="description"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Description" fullWidth multiline rows={3} size="small" error={!!errors.description} helperText={errors.description?.message} />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Controller
                name="ownerId"
                control={control}
                render={({ field }) => (
                  <EmployeeLookup
                    value={selectedOwner}
                    onChange={(emp) => {
                      setSelectedOwner(emp);
                      field.onChange(emp?.id || '');
                      setValue('ownerName', emp?.name || '');
                    }}
                    label="Action Owner"
                    error={!!errors.ownerId}
                    helperText={errors.ownerId?.message}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Controller
                name="department"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Department (optional)" fullWidth size="small" />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Controller
                name="dueDate"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Due Date" type="date" fullWidth size="small" InputLabelProps={{ shrink: true }} error={!!errors.dueDate} helperText={errors.dueDate?.message} />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Controller
                name="priorityCode"
                control={control}
                render={({ field }) => (
                  <TextField {...field} select label="Priority" fullWidth size="small">
                    {PRIORITY_OPTIONS.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                  </TextField>
                )}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={createCapa.isPending}>Create CAPA</Button>
        </DialogActions>
      </form>
    </ResponsiveDialog>
  );
};
