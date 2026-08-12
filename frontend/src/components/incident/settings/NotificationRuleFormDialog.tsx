import React, { useEffect, useState } from 'react';
import {
  DialogTitle, DialogContent, DialogActions, Button, Grid, TextField, MenuItem, FormControlLabel, Switch,
  Autocomplete, Chip,
} from '@mui/material';
import ResponsiveDialog from '../../ResponsiveDialog';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSnackbar } from 'notistack';
import { notificationRuleSchema, NotificationRuleInput } from '../../../lib/validations/incident.schema';
import { useCreateNotificationRule, useUpdateNotificationRule, useIncidentNotificationRoles } from '../../../hooks/incident/use-incident-settings';
import { getApiErrorMessage } from '../../../lib/utils/api-error';
import { IncidentNotificationRule } from '../../../types/incident.types';
import { incidentApi } from '../../../lib/api/incident.api';
import { EmployeeMultiLookup } from '../EmployeeMultiLookup';

interface ResolvedEmployee { id: string; name: string; department?: string; role?: string; }

interface NotificationRuleFormDialogProps {
  open: boolean;
  onClose: () => void;
  rule?: IncidentNotificationRule | null;
}

const TRIGGER_EVENTS = [
  'INCIDENT_CREATED', 'INCIDENT_SUBMITTED', 'INCIDENT_ACKNOWLEDGED', 'INCIDENT_ASSIGNED',
  'TRIAGE_COMPLETED', 'INVESTIGATION_STARTED', 'RCA_COMPLETED', 'CAPA_CREATED',
  'CAPA_DUE_TOMORROW', 'CAPA_OVERDUE', 'VERIFICATION_REJECTED', 'INCIDENT_CLOSED',
];
const CHANNELS = ['PUSH', 'EMAIL', 'SMS'];

export const NotificationRuleFormDialog: React.FC<NotificationRuleFormDialogProps> = ({ open, onClose, rule }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { data: notificationRoles } = useIncidentNotificationRoles();
  const roleOptions = (notificationRoles || []).map((r) => r.name);
  const createRule = useCreateNotificationRule();
  const updateRule = useUpdateNotificationRule();
  const isEdit = !!rule;

  // Tracked separately from the form's notifyUserIds (bare strings) so the
  // multi-lookup can keep showing names instead of round-tripping through ids.
  const [selectedUsers, setSelectedUsers] = useState<ResolvedEmployee[]>([]);
  const [resolvingUsers, setResolvingUsers] = useState(false);

  const { control, handleSubmit, reset, setValue, formState: { errors } } = useForm<NotificationRuleInput>({
    resolver: zodResolver(notificationRuleSchema),
    defaultValues: { name: '', description: '', triggerEvent: '', notifyRoles: [], notifyUserIds: [], channel: 'PUSH', isActive: true },
  });

  useEffect(() => {
    if (open) {
      reset(rule
        ? {
          name: rule.name, description: rule.description || '', triggerEvent: rule.triggerEvent,
          notifyRoles: rule.notifyRoles || [], notifyUserIds: rule.notifyUserIds || [], channel: rule.channel, isActive: rule.isActive,
        }
        : { name: '', description: '', triggerEvent: '', notifyRoles: [], notifyUserIds: [], channel: 'PUSH', isActive: true });

      // Resolve existing user ids to names for display
      if (rule?.notifyUserIds && rule.notifyUserIds.length > 0) {
        setResolvingUsers(true);
        Promise.all(rule.notifyUserIds.map((id) =>
          incidentApi.resolveEmployee(id).catch(() => ({ id, name: `Unknown (${id.slice(0, 8)}…)` }))
        ))
          .then((results) => setSelectedUsers(results as ResolvedEmployee[]))
          .finally(() => setResolvingUsers(false));
      } else {
        setSelectedUsers([]);
      }
    }
  }, [open, rule, reset]);

  const onSubmit = async (data: NotificationRuleInput) => {
    try {
      if (isEdit && rule) {
        await updateRule.mutateAsync({ id: rule.id, data });
      } else {
        await createRule.mutateAsync(data);
      }
      enqueueSnackbar(isEdit ? 'Notification rule updated' : 'Notification rule created', { variant: 'success' });
      onClose();
    } catch (e) {
      enqueueSnackbar(getApiErrorMessage(e, 'Failed to save notification rule'), { variant: 'error' });
    }
  };

  const pending = createRule.isPending || updateRule.isPending;

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>{isEdit ? 'Edit Notification Rule' : 'New Notification Rule'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Rule Name" fullWidth size="small" error={!!errors.name} helperText={errors.name?.message} />
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
            <Grid item xs={12} sm={8}>
              <Controller
                name="triggerEvent"
                control={control}
                render={({ field }) => (
                  <TextField {...field} select label="Trigger Event" fullWidth size="small" error={!!errors.triggerEvent} helperText={errors.triggerEvent?.message}>
                    {TRIGGER_EVENTS.map((e) => <MenuItem key={e} value={e}>{e.replace(/_/g, ' ')}</MenuItem>)}
                  </TextField>
                )}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Controller
                name="channel"
                control={control}
                render={({ field }) => (
                  <TextField {...field} select label="Channel" fullWidth size="small">
                    {CHANNELS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                  </TextField>
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
            <Grid item xs={12}>
              <Controller
                name="notifyUserIds"
                control={control}
                render={({ field }) => (
                  <EmployeeMultiLookup
                    value={selectedUsers}
                    onChange={(users) => {
                      setSelectedUsers(users);
                      field.onChange(users.map((u) => u.id));
                    }}
                    label="Notify Specific Users (optional)"
                    helperText={resolvingUsers ? 'Loading current recipients…' : 'Always notified in addition to matching roles'}
                  />
                )}
              />
            </Grid>
            {isEdit && (
              <Grid item xs={12}>
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
          <Button type="submit" variant="contained" disabled={pending}>{isEdit ? 'Save Changes' : 'Create Rule'}</Button>
        </DialogActions>
      </form>
    </ResponsiveDialog>
  );
};
