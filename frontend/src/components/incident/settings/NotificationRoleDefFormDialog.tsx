import React, { useEffect } from 'react';
import {
  DialogTitle, DialogContent, DialogActions, Button, Grid, TextField, FormControlLabel, Switch,
} from '@mui/material';
import ResponsiveDialog from '../../ResponsiveDialog';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSnackbar } from 'notistack';
import { notificationRoleSchema, NotificationRoleInput } from '../../../lib/validations/incident.schema';
import { useCreateNotificationRole, useUpdateNotificationRole } from '../../../hooks/incident/use-incident-settings';
import { getApiErrorMessage } from '../../../lib/utils/api-error';
import { IncidentNotificationRole } from '../../../types/incident.types';

interface NotificationRoleDefFormDialogProps {
  open: boolean;
  onClose: () => void;
  role?: IncidentNotificationRole | null;
}

/**
 * Add/Edit dialog for incident-scoped notification roles (e.g.
 * "RISK_MANAGER") — the list managed under Incident Settings → Role
 * Assignments. Distinct from platform RBAC role management.
 */
export const NotificationRoleDefFormDialog: React.FC<NotificationRoleDefFormDialogProps> = ({ open, onClose, role }) => {
  const { enqueueSnackbar } = useSnackbar();
  const createRole = useCreateNotificationRole();
  const updateRole = useUpdateNotificationRole();
  const isEdit = !!role;

  const { control, handleSubmit, reset, formState: { errors } } = useForm<NotificationRoleInput>({
    resolver: zodResolver(notificationRoleSchema),
    defaultValues: { name: '', description: '', displayOrder: 0, isActive: true },
  });

  useEffect(() => {
    if (open) {
      reset(role
        ? { name: role.name, description: role.description || '', displayOrder: role.displayOrder, isActive: role.isActive }
        : { name: '', description: '', displayOrder: 0, isActive: true });
    }
  }, [open, role, reset]);

  const onSubmit = async (data: NotificationRoleInput) => {
    try {
      if (isEdit && role) {
        await updateRole.mutateAsync({ id: role.id, data });
      } else {
        await createRole.mutateAsync(data);
      }
      enqueueSnackbar(isEdit ? 'Role updated' : 'Role created', { variant: 'success' });
      onClose();
    } catch (e) {
      enqueueSnackbar(getApiErrorMessage(e, 'Failed to save role'), { variant: 'error' });
    }
  };

  const pending = createRole.isPending || updateRole.isPending;

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>{isEdit ? 'Edit Notification Role' : 'New Notification Role'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Role Name"
                    placeholder="e.g. RISK_MANAGER"
                    fullWidth
                    size="small"
                    error={!!errors.name}
                    helperText={errors.name?.message || 'This is the exact value used in Notify Roles dropdowns'}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <Controller
                name="description"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Description (optional)" fullWidth multiline rows={2} size="small" />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Controller
                name="displayOrder"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Display Order"
                    type="number"
                    fullWidth
                    size="small"
                    onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                    value={field.value ?? ''}
                  />
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
          <Button type="submit" variant="contained" disabled={pending}>{isEdit ? 'Save Changes' : 'Create Role'}</Button>
        </DialogActions>
      </form>
    </ResponsiveDialog>
  );
};
