import React, { useEffect } from 'react';
import {
  DialogTitle, DialogContent, DialogActions, Button, Grid, TextField, FormControlLabel, Switch,
} from '@mui/material';
import ResponsiveDialog from '../../ResponsiveDialog';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSnackbar } from 'notistack';
import { categorySchema, CategoryInput } from '../../../lib/validations/incident.schema';
import { useCreateCategory, useUpdateCategory } from '../../../hooks/incident/use-incident-settings';
import { getApiErrorMessage } from '../../../lib/utils/api-error';
import { IncidentCategory } from '../../../types/incident.types';

interface CategoryFormDialogProps {
  open: boolean;
  onClose: () => void;
  category?: IncidentCategory | null;
}

export const CategoryFormDialog: React.FC<CategoryFormDialogProps> = ({ open, onClose, category }) => {
  const { enqueueSnackbar } = useSnackbar();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const isEdit = !!category;

  const { control, handleSubmit, reset, formState: { errors } } = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', code: '', description: '', displayOrder: 0, isActive: true },
  });

  useEffect(() => {
    if (open) {
      reset(category
        ? { name: category.name, code: category.code, description: category.description || '', displayOrder: category.displayOrder, isActive: category.isActive }
        : { name: '', code: '', description: '', displayOrder: 0, isActive: true });
    }
  }, [open, category, reset]);

  const onSubmit = async (data: CategoryInput) => {
    try {
      if (isEdit && category) {
        await updateCategory.mutateAsync({ id: category.id, data });
      } else {
        await createCategory.mutateAsync(data);
      }
      enqueueSnackbar(isEdit ? 'Category updated' : 'Category created', { variant: 'success' });
      onClose();
    } catch (e) {
      enqueueSnackbar(getApiErrorMessage(e, 'Failed to save category'), { variant: 'error' });
    }
  };

  const pending = createCategory.isPending || updateCategory.isPending;

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>{isEdit ? 'Edit Category' : 'New Category'}</DialogTitle>
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
          <Button type="submit" variant="contained" disabled={pending}>{isEdit ? 'Save Changes' : 'Create Category'}</Button>
        </DialogActions>
      </form>
    </ResponsiveDialog>
  );
};
