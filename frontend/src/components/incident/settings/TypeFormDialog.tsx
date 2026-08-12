import React, { useEffect } from 'react';
import {
  DialogTitle, DialogContent, DialogActions, Button, Grid, TextField, MenuItem, FormControlLabel, Switch,
} from '@mui/material';
import ResponsiveDialog from '../../ResponsiveDialog';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSnackbar } from 'notistack';
import { typeSchema, TypeInput } from '../../../lib/validations/incident.schema';
import { useCreateType, useUpdateType } from '../../../hooks/incident/use-incident-settings';
import { getApiErrorMessage } from '../../../lib/utils/api-error';
import { IncidentCategory, IncidentType } from '../../../types/incident.types';

interface TypeFormDialogProps {
  open: boolean;
  onClose: () => void;
  categories: IncidentCategory[];
  type?: IncidentType | null;
  defaultCategoryId?: string;
}

export const TypeFormDialog: React.FC<TypeFormDialogProps> = ({ open, onClose, categories, type, defaultCategoryId }) => {
  const { enqueueSnackbar } = useSnackbar();
  const createType = useCreateType();
  const updateType = useUpdateType();
  const isEdit = !!type;

  const { control, handleSubmit, reset, formState: { errors } } = useForm<TypeInput>({
    resolver: zodResolver(typeSchema),
    defaultValues: { categoryId: defaultCategoryId || '', name: '', code: '', description: '', displayOrder: 0, isActive: true },
  });

  useEffect(() => {
    if (open) {
      reset(type
        ? { categoryId: type.categoryId, name: type.name, code: type.code, description: type.description || '', displayOrder: type.displayOrder, isActive: type.isActive }
        : { categoryId: defaultCategoryId || '', name: '', code: '', description: '', displayOrder: 0, isActive: true });
    }
  }, [open, type, defaultCategoryId, reset]);

  const onSubmit = async (data: TypeInput) => {
    try {
      if (isEdit && type) {
        await updateType.mutateAsync({ id: type.id, data });
      } else {
        await createType.mutateAsync(data);
      }
      enqueueSnackbar(isEdit ? 'Type updated' : 'Type created', { variant: 'success' });
      onClose();
    } catch (e) {
      enqueueSnackbar(getApiErrorMessage(e, 'Failed to save type'), { variant: 'error' });
    }
  };

  const pending = createType.isPending || updateType.isPending;

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>{isEdit ? 'Edit Type' : 'New Type'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Controller
                name="categoryId"
                control={control}
                render={({ field }) => (
                  <TextField {...field} select label="Category" fullWidth size="small" error={!!errors.categoryId} helperText={errors.categoryId?.message}>
                    {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                  </TextField>
                )}
              />
            </Grid>
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
          <Button type="submit" variant="contained" disabled={pending}>{isEdit ? 'Save Changes' : 'Create Type'}</Button>
        </DialogActions>
      </form>
    </ResponsiveDialog>
  );
};
