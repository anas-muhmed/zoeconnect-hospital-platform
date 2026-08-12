import React, { useEffect } from 'react';
import {
  DialogTitle, DialogContent, DialogActions, Button, Grid, TextField, FormControlLabel, Switch,
  Typography, Autocomplete, Chip, Box,
} from '@mui/material';
import ResponsiveDialog from '../../ResponsiveDialog';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSnackbar } from 'notistack';
import { severitySchema, SeverityInput } from '../../../lib/validations/incident.schema';
import { useCreateSeverity, useUpdateSeverity, useIncidentNotificationRoles } from '../../../hooks/incident/use-incident-settings';
import { getApiErrorMessage } from '../../../lib/utils/api-error';
import { IncidentSeverityLevel } from '../../../types/incident.types';

interface SeverityFormDialogProps {
  open: boolean;
  onClose: () => void;
  severity?: IncidentSeverityLevel | null;
}

const COLOR_PRESETS = ['#6B7280', '#3B82F6', '#F59E0B', '#EF4444', '#991B1B', '#10B981'];

export const SeverityFormDialog: React.FC<SeverityFormDialogProps> = ({ open, onClose, severity }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { data: notificationRoles } = useIncidentNotificationRoles();
  const roleOptions = (notificationRoles || []).map((r) => r.name);
  const createSeverity = useCreateSeverity();
  const updateSeverity = useUpdateSeverity();
  const isEdit = !!severity;

  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm<SeverityInput>({
    resolver: zodResolver(severitySchema),
    defaultValues: {
      name: '', code: '', color: '#6B7280',
      slaResponseHours: undefined, slaInvestigationHours: undefined, slaCapaDays: undefined, slaClosureDays: undefined,
      notifyRoles: [], displayOrder: 0, isActive: true,
    },
  });

  useEffect(() => {
    if (open) {
      reset(severity
        ? {
          name: severity.name, code: severity.code, color: severity.color || '#6B7280',
          slaResponseHours: severity.slaResponseHours ?? undefined,
          slaInvestigationHours: severity.slaInvestigationHours ?? undefined,
          slaCapaDays: severity.slaCapaDays ?? undefined,
          slaClosureDays: severity.slaClosureDays ?? undefined,
          notifyRoles: severity.notifyRoles || [], displayOrder: severity.displayOrder, isActive: severity.isActive,
        }
        : {
          name: '', code: '', color: '#6B7280',
          slaResponseHours: undefined, slaInvestigationHours: undefined, slaCapaDays: undefined, slaClosureDays: undefined,
          notifyRoles: [], displayOrder: 0, isActive: true,
        });
    }
  }, [open, severity, reset]);

  const selectedColor = watch('color');

  const onSubmit = async (data: SeverityInput) => {
    try {
      if (isEdit && severity) {
        await updateSeverity.mutateAsync({ id: severity.id, data });
      } else {
        await createSeverity.mutateAsync(data);
      }
      enqueueSnackbar(isEdit ? 'Severity level updated' : 'Severity level created', { variant: 'success' });
      onClose();
    } catch (e) {
      enqueueSnackbar(getApiErrorMessage(e, 'Failed to save severity level'), { variant: 'error' });
    }
  };

  const pending = createSeverity.isPending || updateSeverity.isPending;

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>{isEdit ? 'Edit Severity Level' : 'New Severity Level'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={8}>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Name" fullWidth size="small" error={!!errors.name} helperText={errors.name?.message} />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Controller
                name="code"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Code" fullWidth size="small" error={!!errors.code} helperText={errors.code?.message} />
                )}
              />
            </Grid>

            <Grid item xs={12}>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Color</Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                {COLOR_PRESETS.map((c) => (
                  <Controller
                    key={c}
                    name="color"
                    control={control}
                    render={({ field }) => (
                      <Box
                        onClick={() => field.onChange(c)}
                        sx={{
                          width: 28, height: 28, borderRadius: '50%', bgcolor: c, cursor: 'pointer',
                          border: selectedColor === c ? '3px solid' : '1px solid', borderColor: selectedColor === c ? 'text.primary' : 'divider',
                        }}
                      />
                    )}
                  />
                ))}
              </Box>
            </Grid>

            <Grid item xs={12}><Typography variant="subtitle2" sx={{ mt: 1 }}>SLA Targets</Typography></Grid>
            <Grid item xs={6} sm={3}>
              <Controller
                name="slaResponseHours"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Response (hrs)" type="number" fullWidth size="small"
                    onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))} value={field.value ?? ''} />
                )}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <Controller
                name="slaInvestigationHours"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Investigation (hrs)" type="number" fullWidth size="small"
                    onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))} value={field.value ?? ''} />
                )}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <Controller
                name="slaCapaDays"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="CAPA (days)" type="number" fullWidth size="small"
                    onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))} value={field.value ?? ''} />
                )}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <Controller
                name="slaClosureDays"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Closure (days)" type="number" fullWidth size="small"
                    onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))} value={field.value ?? ''} />
                )}
              />
            </Grid>

            <Grid item xs={12}>
              <Controller
                name="notifyRoles"
                control={control}
                render={({ field }) => (
                  <Autocomplete
                    multiple
                    freeSolo
                    size="small"
                    options={roleOptions}
                    value={field.value}
                    onChange={(_, val) => field.onChange(val)}
                    renderTags={(value, getTagProps) =>
                      value.map((option, index) => <Chip label={option} size="small" {...getTagProps({ index })} key={option} />)
                    }
                    renderInput={(params) => <TextField {...params} label="Notify Roles" placeholder="Add role" />}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <Controller
                name="displayOrder"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Display Order" type="number" fullWidth size="small"
                    onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))} value={field.value ?? ''} />
                )}
              />
            </Grid>
            {isEdit && (
              <Grid item xs={12} sm={6}>
                <Controller
                  name="isActive"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                      label="Active"
                    />
                  )}
                />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={pending}>{isEdit ? 'Save Changes' : 'Create Severity Level'}</Button>
        </DialogActions>
      </form>
    </ResponsiveDialog>
  );
};
