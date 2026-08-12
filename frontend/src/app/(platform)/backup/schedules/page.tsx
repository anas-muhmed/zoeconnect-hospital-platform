'use client';

import React, { useState } from 'react';
import {
  Box, Alert, Button, Card, CardContent, Typography, Chip, IconButton, Tooltip,
  DialogTitle, DialogContent, DialogActions, TextField, FormControlLabel,
  Checkbox, FormGroup, MenuItem, Switch, Grid, CircularProgress,
} from '@mui/material';
import ResponsiveDialog from '../../../../components/ResponsiveDialog';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../../../../components/PageHeader';
import { useAuthStore } from '../../../../lib/store/auth.store';
import { BACKUP_PERMISSIONS } from '../../../../lib/constants/backup-permissions';
import {
  useBackupSchedules, useCreateBackupSchedule, useUpdateBackupSchedule, useDeleteBackupSchedule,
} from '../../../../hooks/backup/use-backup-schedules';
import { BackupSchedule, BackupModuleName, BackupType, BACKUP_MODULES, BACKUP_TYPES_FOR_CREATE } from '../../../../types/backup.types';
import { getBackupTypeLabel, getModuleLabel } from '../../../../lib/utils/backup-formatters';
import { licenseApi } from '../../../../lib/api/license.api';
import { format } from 'date-fns';

interface ScheduleFormState {
  name: string;
  cronExpression: string;
  backupType: BackupType;
  modules: BackupModuleName[];
  retentionCount: number | '';
  retentionDays: number | '';
  encrypt: boolean;
  isActive: boolean;
}

const EMPTY_FORM: ScheduleFormState = {
  name: '', cronExpression: '0 2 * * *', backupType: 'full', modules: [...BACKUP_MODULES],
  retentionCount: 30, retentionDays: '', encrypt: false, isActive: true,
};

export default function BackupSchedulesPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(BACKUP_PERMISSIONS.SCHEDULE);

  const { data: schedules, isLoading } = useBackupSchedules();
  const createMutation = useCreateBackupSchedule();
  const updateMutation = useUpdateBackupSchedule();
  const deleteMutation = useDeleteBackupSchedule();

  const { data: licenseStatus } = useQuery({ queryKey: ['license-status'], queryFn: licenseApi.getStatus, staleTime: 60_000 });
  const isCloud = licenseStatus?.deploymentMode === 'cloud';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BackupSchedule | null>(null);
  const [form, setForm] = useState<ScheduleFormState>(EMPTY_FORM);

  if (!hasPermission(BACKUP_PERMISSIONS.SCHEDULE)) {
    return <Alert severity="warning" sx={{ m: 3 }}>You don't have permission to view backup schedules.</Alert>;
  }

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (s: BackupSchedule) => {
    setEditing(s);
    setForm({
      name: s.name, cronExpression: s.cronExpression, backupType: s.backupType,
      modules: s.modules, retentionCount: s.retentionCount ?? '', retentionDays: s.retentionDays ?? '',
      encrypt: s.encrypt, isActive: s.isActive,
    });
    setDialogOpen(true);
  };

  const toggleModule = (mod: BackupModuleName) => {
    setForm((f) => ({ ...f, modules: f.modules.includes(mod) ? f.modules.filter((m) => m !== mod) : [...f.modules, mod] }));
  };

  const handleSave = async () => {
    const payload = {
      name: form.name,
      cronExpression: form.cronExpression,
      backupType: form.backupType,
      modules: form.modules,
      retentionCount: form.retentionCount === '' ? undefined : Number(form.retentionCount),
      retentionDays: form.retentionDays === '' ? undefined : Number(form.retentionDays),
      encrypt: form.encrypt,
      isActive: form.isActive,
    };
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    setDialogOpen(false);
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Box>
      <PageHeader
        title="Backup Schedules"
        subtitle={isCloud ? 'Cron-based recurring backups (per-tenant)' : 'Cron-based recurring backups'}
        icon={<ScheduleIcon />}
        actions={canManage && <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>New Schedule</Button>}
      />

      {isLoading ? <CircularProgress size={24} /> : (
        <Grid container spacing={2}>
          {(schedules || []).map((s) => (
            <Grid item xs={12} md={6} key={s.id}>
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={700}>{s.name}</Typography>
                      <Typography variant="body2" color="text.secondary" fontFamily="monospace">{s.cronExpression}</Typography>
                    </Box>
                    <Chip label={s.isActive ? 'Active' : 'Disabled'} color={s.isActive ? 'success' : 'default'} size="small" />
                  </Box>
                  <Box sx={{ mt: 1.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    <Chip label={getBackupTypeLabel(s.backupType)} size="small" variant="outlined" />
                    {s.modules.map((m) => <Chip key={m} label={getModuleLabel(m)} size="small" variant="outlined" />)}
                    {s.encrypt && <Chip label="Encrypted" size="small" color="secondary" />}
                  </Box>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                    Next run: {s.nextRunAt ? format(new Date(s.nextRunAt), 'PPp') : '—'} · Last run: {s.lastRunAt ? format(new Date(s.lastRunAt), 'PPp') : 'Never'}
                  </Typography>
                  {(s.retentionCount || s.retentionDays) && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      Retention: {s.retentionCount ? `${s.retentionCount} backups` : ''}{s.retentionCount && s.retentionDays ? ' / ' : ''}{s.retentionDays ? `${s.retentionDays} days` : ''}
                    </Typography>
                  )}
                  {canManage && (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5, mt: 1 }}>
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(s)} aria-label="Edit"><EditIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small" color="error"
                          onClick={() => { if (window.confirm(`Delete schedule "${s.name}"?`)) deleteMutation.mutate(s.id); }}
                         aria-label="Delete">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
          {(schedules || []).length === 0 && (
            <Grid item xs={12}><Alert severity="info">No backup schedules configured yet.</Alert></Grid>
          )}
        </Grid>
      )}

      <ResponsiveDialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Schedule' : 'New Schedule'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} fullWidth />
          <TextField
            label="Cron Expression" value={form.cronExpression}
            onChange={(e) => setForm({ ...form, cronExpression: e.target.value })}
            helperText="Standard 5-field cron (e.g. '0 2 * * *' = daily at 2am)" fullWidth
          />
          <TextField
            select label="Backup Type" value={form.backupType}
            onChange={(e) => setForm({ ...form, backupType: e.target.value as BackupType })} fullWidth
          >
            {BACKUP_TYPES_FOR_CREATE.map((t) => <MenuItem key={t} value={t}>{getBackupTypeLabel(t)}</MenuItem>)}
          </TextField>
          <Box>
            <Typography variant="body2" gutterBottom>Modules</Typography>
            <FormGroup row>
              {BACKUP_MODULES.map((mod) => (
                <FormControlLabel
                  key={mod}
                  control={<Checkbox checked={form.modules.includes(mod)} onChange={() => toggleModule(mod)} />}
                  label={getModuleLabel(mod)}
                />
              ))}
            </FormGroup>
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Retention Count" type="number" value={form.retentionCount}
              onChange={(e) => setForm({ ...form, retentionCount: e.target.value === '' ? '' : Number(e.target.value) })}
              fullWidth
            />
            <TextField
              label="Retention Days" type="number" value={form.retentionDays}
              onChange={(e) => setForm({ ...form, retentionDays: e.target.value === '' ? '' : Number(e.target.value) })}
              fullWidth
            />
          </Box>
          <FormControlLabel
            control={<Switch checked={form.encrypt} onChange={(e) => setForm({ ...form, encrypt: e.target.checked })} />}
            label="Encrypt backups from this schedule"
          />
          <FormControlLabel
            control={<Switch checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />}
            label="Active"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving || !form.name || !form.cronExpression}>
            {editing ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
