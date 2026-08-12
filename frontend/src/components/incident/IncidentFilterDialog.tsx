import React, { useState, useEffect } from 'react';
import {
  DialogTitle, DialogContent, DialogActions, Button, Grid, TextField, MenuItem,
  FormControlLabel, Switch,
} from '@mui/material';
import ResponsiveDialog from '../ResponsiveDialog';
import { useIncidentCategories, useIncidentSeverityLevels } from '../../hooks/incident/use-incident-settings';

export interface IncidentFilters {
  status?: string;
  severityCode?: string;
  categoryId?: string;
  department?: string;
  isNearMiss?: boolean;
  isSentinelEvent?: boolean;
  fromDate?: string;
  toDate?: string;
}

const STATUS_OPTIONS = [
  'DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'ASSIGNED', 'TRIAGE', 'CONTAINMENT',
  'INVESTIGATION', 'RCA_PENDING', 'CAPA_PENDING', 'VERIFICATION', 'CLOSED', 'ARCHIVED',
];

interface IncidentFilterDialogProps {
  open: boolean;
  value: IncidentFilters;
  onClose: () => void;
  onApply: (filters: IncidentFilters) => void;
}

export function countActiveFilters(filters: IncidentFilters): number {
  return Object.values(filters).filter((v) => v !== undefined && v !== '' && v !== null).length;
}

export const IncidentFilterDialog: React.FC<IncidentFilterDialogProps> = ({ open, value, onClose, onApply }) => {
  const [draft, setDraft] = useState<IncidentFilters>(value);
  const { data: categories } = useIncidentCategories();
  const { data: severityLevels } = useIncidentSeverityLevels();

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  const handleClear = () => {
    setDraft({});
    onApply({});
    onClose();
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Filter Incidents</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ mt: 0.25 }}>
          <Grid item xs={12} sm={6}>
            <TextField
              select fullWidth size="small" label="Status"
              value={draft.status || ''}
              onChange={(e) => setDraft({ ...draft, status: e.target.value || undefined })}
            >
              <MenuItem value="">Any status</MenuItem>
              {STATUS_OPTIONS.map((s) => <MenuItem key={s} value={s}>{s.replace('_', ' ')}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              select fullWidth size="small" label="Severity"
              value={draft.severityCode || ''}
              onChange={(e) => setDraft({ ...draft, severityCode: e.target.value || undefined })}
            >
              <MenuItem value="">Any severity</MenuItem>
              {(severityLevels || []).map((s: any) => <MenuItem key={s.code} value={s.code}>{s.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              select fullWidth size="small" label="Category"
              value={draft.categoryId || ''}
              onChange={(e) => setDraft({ ...draft, categoryId: e.target.value || undefined })}
            >
              <MenuItem value="">Any category</MenuItem>
              {(categories || []).map((c: any) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth size="small" label="Department"
              value={draft.department || ''}
              onChange={(e) => setDraft({ ...draft, department: e.target.value || undefined })}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              type="date" fullWidth size="small" label="Incident date from"
              value={draft.fromDate || ''}
              onChange={(e) => setDraft({ ...draft, fromDate: e.target.value || undefined })}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              type="date" fullWidth size="small" label="Incident date to"
              value={draft.toDate || ''}
              onChange={(e) => setDraft({ ...draft, toDate: e.target.value || undefined })}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControlLabel
              control={<Switch checked={!!draft.isNearMiss} onChange={(e) => setDraft({ ...draft, isNearMiss: e.target.checked || undefined })} />}
              label="Near-miss only"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControlLabel
              control={<Switch checked={!!draft.isSentinelEvent} onChange={(e) => setDraft({ ...draft, isSentinelEvent: e.target.checked || undefined })} />}
              label="Sentinel events only"
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClear} color="inherit">Clear All</Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleApply}>Apply Filters</Button>
      </DialogActions>
    </ResponsiveDialog>
  );
};
