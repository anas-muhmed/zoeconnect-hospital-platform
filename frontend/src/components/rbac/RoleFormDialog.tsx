'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';

import { rolesApi, type Permission, type RoleWithPermissions } from '@/lib/api/users.api';

// Kept in sync with rbac/page.tsx's MODULE_META -- module tag colour used
// consistently between the read-only card view and this editor.
const MODULE_META: Record<string, { color: string; bg: string; label: string }> = {
  PLATFORM: { color: '#1565C0', bg: alpha('#1565C0', 0.1), label: 'Platform' },
  LOYALTY:  { color: '#2E7D32', bg: alpha('#2E7D32', 0.1), label: 'Loyalty'  },
  EIC:      { color: '#6A1B9A', bg: alpha('#6A1B9A', 0.1), label: 'EIC'      },
  HIS:      { color: '#E65100', bg: alpha('#E65100', 0.1), label: 'HIS'      },
  TOKEN:    { color: '#00838F', bg: alpha('#00838F', 0.1), label: 'Token'    },
  FORMS:    { color: '#5D4037', bg: alpha('#5D4037', 0.1), label: 'Forms'    },
  FEEDBACK: { color: '#AD1457', bg: alpha('#AD1457', 0.1), label: 'Feedback' },
  CMS:      { color: '#4527A0', bg: alpha('#4527A0', 0.1), label: 'CMS'      },
  INCIDENT: { color: '#C62828', bg: alpha('#C62828', 0.1), label: 'Incident' },
};
function moduleMeta(code: string) {
  return MODULE_META[code] ?? { color: '#37474F', bg: alpha('#37474F', 0.1), label: code };
}

interface RoleFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** null/undefined = create a new role. A populated role = edit it. */
  role?: RoleWithPermissions | null;
  permissions: Permission[];
}

export default function RoleFormDialog({ open, onClose, role, permissions }: RoleFormDialogProps) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const isEdit = !!role;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Re-seed the form every time the dialog opens (or the role being edited
  // changes) rather than only on mount -- the same dialog instance is reused
  // for every "Edit" click on the page.
  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? '');
    setDescription(role?.description ?? '');
    setSelectedIds(new Set((role?.permissions ?? []).map((p) => p.id)));
  }, [open, role]);

  const grouped = useMemo(() => {
    const acc: Record<string, Permission[]> = {};
    for (const p of permissions) (acc[p.moduleCode] ??= []).push(p);
    return acc;
  }, [permissions]);

  const togglePermission = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleModule = (modulePerms: Permission[], allSelected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const p of modulePerms) {
        if (allSelected) next.delete(p.id); else next.add(p.id);
      }
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        permissionIds: Array.from(selectedIds),
      };
      return isEdit ? rolesApi.update(role!.id, payload) : rolesApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      enqueueSnackbar(isEdit ? 'Role updated' : 'Role created', { variant: 'success' });
      onClose();
    },
    onError: (err: any) => {
      enqueueSnackbar(err?.response?.data?.message ?? `Failed to ${isEdit ? 'update' : 'create'} role`, { variant: 'error' });
    },
  });

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? `Edit Role — ${role!.name}` : 'Create Role'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
        <TextField
          label="Role Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          size="small"
          required
          placeholder="e.g. INCIDENT_MANAGER"
          helperText="Uppercase with underscores is the existing convention, but not enforced."
        />
        <TextField
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          fullWidth
          size="small"
          multiline
          minRows={2}
        />

        <Box>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
            Permissions ({selectedIds.size} selected)
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: 360, overflowY: 'auto', pr: 0.5 }}>
            {Object.entries(grouped).map(([moduleCode, modulePerms]) => {
              const meta = moduleMeta(moduleCode);
              const selectedInModule = modulePerms.filter((p) => selectedIds.has(p.id)).length;
              const allSelected = selectedInModule === modulePerms.length;
              const someSelected = selectedInModule > 0 && !allSelected;
              return (
                <Box key={moduleCode} sx={{ flexShrink: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, bgcolor: '#F7F9FC' }}>
                    <Checkbox
                      size="small"
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={() => toggleModule(modulePerms, allSelected)}
                    />
                    <Chip label={meta.label} size="small" sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 700, height: 22 }} />
                    <Typography variant="caption" color="text.secondary">
                      {selectedInModule}/{modulePerms.length}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, p: 1 }}>
                    {modulePerms.map((p) => (
                      <FormControlLabel
                        key={p.id}
                        sx={{ mr: 1.5, ml: 0 }}
                        control={
                          <Checkbox
                            size="small"
                            checked={selectedIds.has(p.id)}
                            onChange={() => togglePermission(p.id)}
                          />
                        }
                        label={
                          <Typography variant="caption" sx={{ fontWeight: 500 }}>
                            {p.resource}:{p.action}
                          </Typography>
                        }
                      />
                    ))}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => mutation.mutate()}
          disabled={!name.trim() || mutation.isPending}
          startIcon={mutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {isEdit ? 'Save Changes' : 'Create Role'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}
