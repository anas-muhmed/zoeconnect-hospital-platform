import React, { useState } from 'react';
import { Box, Card, CardContent, CardHeader, Typography, Grid, Chip, Button, TextField, Divider, DialogTitle, DialogContent, DialogActions, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import ResponsiveDialog from '../ResponsiveDialog';
import { useForm, Controller } from 'react-hook-form';
import { IncidentRca, RcaFishboneNode as FishboneNode } from '../../types/incident.types';
import { useUpsertFishbone } from '../../hooks/incident/use-incident-investigation';
import { getActionStatusColor, getActionStatusLabel } from '../../lib/utils/incident-formatters';
import { useSnackbar } from 'notistack';

interface RcaFishboneProps {
  incidentId: string;
  rca: IncidentRca;
  nodes?: FishboneNode[];
  readOnly?: boolean;
}

const CATEGORIES = ['People', 'Process', 'Equipment', 'Materials', 'Environment', 'Management'];

export const RcaFishbone: React.FC<RcaFishboneProps> = ({ incidentId, rca, nodes = [], readOnly = false }) => {
  const [openDialog, setOpenDialog] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const upsertNode = useUpsertFishbone(incidentId, rca.id);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<{ category: string; causeText: string }>({
    defaultValues: { category: 'Process', causeText: '' }
  });

  const onSubmit = async (data: { category: string; causeText: string }) => {
    try {
      const payload = {
        category: data.category.toUpperCase(),
        causeText: data.causeText,
      };
      await upsertNode.mutateAsync(payload as any); // using as any since Partial<RcaFishboneNode> is expected
      enqueueSnackbar('Fishbone node added', { variant: 'success' });
      setOpenDialog(false);
      reset();
    } catch (e) {
      enqueueSnackbar('Failed to add node', { variant: 'error' });
    }
  };

  // Group nodes by category (case-insensitive mapping for display)
  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = nodes.filter(n => n.category?.toUpperCase() === cat.toUpperCase());
    return acc;
  }, {} as Record<string, FishboneNode[]>);

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardHeader
        title={<Typography variant="h6">Ishikawa (Fishbone) Diagram</Typography>}
        action={
          <Chip
            label={getActionStatusLabel(rca.status)}
            color={getActionStatusColor(rca.status)}
            size="small"
          />
        }
      />
      <Divider />
      <CardContent>
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" fontWeight="bold">Causes by Category</Typography>
          {!readOnly && rca.status !== 'COMPLETED' && (
            <Button variant="outlined" size="small" onClick={() => setOpenDialog(true)}>
              Add Node
            </Button>
          )}
        </Box>
        
        {nodes.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No fishbone nodes recorded.</Typography>
        ) : (
          <Grid container spacing={2}>
            {CATEGORIES.map(cat => {
              const catNodes = grouped[cat];
              if (catNodes.length === 0) return null;
              
              return (
                <Grid item xs={12} sm={6} md={4} key={cat}>
                  <Card variant="outlined" sx={{ bgcolor: 'grey.50', height: '100%' }}>
                    <CardHeader title={cat} titleTypographyProps={{ variant: 'subtitle2', fontWeight: 'bold' }} sx={{ pb: 0 }} />
                    <CardContent sx={{ pt: 1 }}>
                      <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                        {catNodes.map(node => (
                          <li key={node.id} style={{ marginBottom: '4px' }}>
                            <Typography variant="body2" color="text.primary">
                              {node.causeText}
                            </Typography>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </CardContent>

      <ResponsiveDialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogTitle>Add Fishbone Node</DialogTitle>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Controller
                  name="category"
                  control={control}
                  rules={{ required: 'Category is required' }}
                  render={({ field }) => (
                    <FormControl fullWidth size="small">
                      <InputLabel>Category</InputLabel>
                      <Select {...field} label="Category">
                        {CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                      </Select>
                    </FormControl>
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="causeText"
                  control={control}
                  rules={{ required: 'Cause is required' }}
                  render={({ field }) => (
                    <TextField {...field} label="Identified Cause" fullWidth multiline rows={2} error={!!errors.causeText} helperText={errors.causeText?.message} />
                  )}
                />
              </Grid>

            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={upsertNode.isPending}>Save</Button>
          </DialogActions>
        </form>
      </ResponsiveDialog>
    </Card>
  );
};
