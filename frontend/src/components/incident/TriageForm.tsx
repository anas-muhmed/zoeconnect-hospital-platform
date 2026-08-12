import React from 'react';
import {
  Box, Card, CardContent, CardHeader, Typography, Grid, TextField, Switch,
  FormControlLabel, Button, Divider, MenuItem, Autocomplete, Chip,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSnackbar } from 'notistack';
import { IncidentTriage } from '../../types/incident.types';
import { triageSchema, TriageInput } from '../../lib/validations/incident.schema';
import { useCreateTriage, useUpdateTriage } from '../../hooks/incident/use-incident-triage';
import { EmployeeLookup } from './EmployeeLookup';
import { getApiErrorMessage } from '../../lib/utils/api-error';
import { useEmployeeName } from '../../hooks/incident/use-employee';
import { getNextStepMessage } from '../../lib/utils/incident-workflow';

const PRIORITY_OPTIONS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
const ESCALATION_ROLE_OPTIONS = ['DEPARTMENT_HEAD', 'QUALITY_MANAGER', 'MEDICAL_DIRECTOR', 'RISK_MANAGER', 'CEO'];

interface TriageFormProps {
  incidentId: string;
  triage?: IncidentTriage | null;
  readOnly?: boolean;
}

export const TriageForm: React.FC<TriageFormProps> = ({ incidentId, triage, readOnly = false }) => {
  const { enqueueSnackbar } = useSnackbar();
  const createTriage = useCreateTriage(incidentId);
  const updateTriage = useUpdateTriage(incidentId);
  const isEditing = !!triage;
  const pending = createTriage.isPending || updateTriage.isPending;

  const { control, handleSubmit, watch, formState: { errors } } = useForm<TriageInput>({
    resolver: zodResolver(triageSchema),
    defaultValues: {
      assignedToId: triage?.assignedToId || '',
      priorityCode: triage?.priorityCode || '',
      responseSlaHours: triage?.responseSlaHours,
      escalationRequired: triage?.escalationRequired || false,
      escalationRoles: triage?.escalationRoles || [],
      containmentRequired: triage?.containmentRequired || false,
      containmentNotes: triage?.containmentNotes || '',
      triageNotes: triage?.triageNotes || '',
    },
  });

  const escalationRequired = watch('escalationRequired');
  const containmentRequired = watch('containmentRequired');
  const assignedToId = watch('assignedToId');
  // The Autocomplete only has the raw id at hand for the pre-existing
  // selection — resolve it to a display name instead of showing the id.
  const { name: assignedToName } = useEmployeeName(assignedToId);

  const onSubmit = async (data: TriageInput) => {
    try {
      const payload = { ...data, assignedToId: data.assignedToId || undefined };
      if (isEditing) {
        await updateTriage.mutateAsync(payload);
        enqueueSnackbar('Triage assessment updated', { variant: 'success' });
      } else {
        await createTriage.mutateAsync(payload);
        enqueueSnackbar(`Triage completed — incident moved to Triage stage. Next: ${getNextStepMessage('TRIAGE')}`, { variant: 'success' });
      }
    } catch (e) {
      enqueueSnackbar(getApiErrorMessage(e, 'Failed to save triage assessment'), { variant: 'error' });
    }
  };

  return (
    <Card variant="outlined">
      <CardHeader
        title={<Typography variant="h6">Triage Assessment</Typography>}
        subheader={isEditing ? `Last assessed ${new Date(triage!.triagedAt).toLocaleString()}` : 'Mandatory for Critical / High severity incidents before investigation can begin'}
      />
      <Divider />
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Controller
                name="priorityCode"
                control={control}
                render={({ field }) => (
                  <TextField {...field} select label="Priority Override" fullWidth size="small" disabled={readOnly}>
                    <MenuItem value="">— No override —</MenuItem>
                    {PRIORITY_OPTIONS.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                  </TextField>
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Controller
                name="responseSlaHours"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Response SLA (hours)"
                    type="number"
                    fullWidth
                    size="small"
                    disabled={readOnly}
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                    error={!!errors.responseSlaHours}
                    helperText={errors.responseSlaHours?.message}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <Controller
                name="assignedToId"
                control={control}
                render={({ field }) => (
                  <EmployeeLookup
                    value={field.value ? { id: field.value, name: assignedToName || field.value } : null}
                    onChange={(emp) => field.onChange(emp?.id || '')}
                    label="Assign Investigator (optional)"
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <Controller
                name="escalationRequired"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} disabled={readOnly} />}
                    label="Immediate Escalation Required"
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Controller
                name="containmentRequired"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} disabled={readOnly} />}
                    label="Immediate Containment Required"
                  />
                )}
              />
            </Grid>

            {escalationRequired && (
              <Grid item xs={12}>
                <Controller
                  name="escalationRoles"
                  control={control}
                  render={({ field }) => (
                    <Autocomplete
                      multiple
                      freeSolo
                      options={ESCALATION_ROLE_OPTIONS}
                      value={field.value || []}
                      onChange={(e, val) => field.onChange(val)}
                      disabled={readOnly}
                      renderTags={(value, getTagProps) =>
                        value.map((option, index) => (
                          <Chip variant="outlined" label={option} size="small" {...getTagProps({ index })} key={option} />
                        ))
                      }
                      renderInput={(params) => <TextField {...params} label="Escalation Roles to Notify" size="small" />}
                    />
                  )}
                />
              </Grid>
            )}

            {containmentRequired && (
              <Grid item xs={12}>
                <Controller
                  name="containmentNotes"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Containment Notes" fullWidth multiline rows={2} size="small" disabled={readOnly} />
                  )}
                />
              </Grid>
            )}

            <Grid item xs={12}>
              <Controller
                name="triageNotes"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Triage Assessment Notes" fullWidth multiline rows={3} size="small" disabled={readOnly} />
                )}
              />
            </Grid>
          </Grid>

          {!readOnly && (
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" variant="contained" disabled={pending}>
                {isEditing ? 'Update Triage' : 'Complete Triage'}
              </Button>
            </Box>
          )}
        </form>
      </CardContent>
    </Card>
  );
};
