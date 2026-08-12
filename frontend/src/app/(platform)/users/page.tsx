'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import FormHelperText from '@mui/material/FormHelperText';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import Skeleton from '@mui/material/Skeleton';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import { alpha } from '@mui/material/styles';

import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import LockResetIcon from '@mui/icons-material/LockReset';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PeopleIcon from '@mui/icons-material/People';
import CloseIcon from '@mui/icons-material/Close';
import SecurityIcon from '@mui/icons-material/Security';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Autocomplete from '@mui/material/Autocomplete';
import { hisApi } from '@/lib/api/his.api';

import { usersApi, rolesApi, type UserListItem, type CreateUserPayload, type UpdateUserPayload, type Permission, type RoleWithPermissions } from '@/lib/api/users.api';
import { branchesApi, type Branch } from '@/lib/api/branches.api';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import { useAuthStore } from '@/lib/store/auth.store';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useFieldAvailability } from '@/lib/hooks/useFieldAvailability';
import PageHeader from '@/components/PageHeader';
import FieldAvailabilityHint from '@/components/FieldAvailabilityHint';

// ── Avatar colour helper ──────────────────────────────────────────────────────
const AVATAR_PALETTE = [
  '#1565C0','#00838F','#6A1B9A','#C62828','#2E7D32',
  '#E65100','#00695C','#283593','#AD1457','#37474F',
];
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

// ── Validation schemas ────────────────────────────────────────────────────────
const createSchema = z.object({
  username: z.string().min(2).max(100).regex(/^[a-zA-Z0-9._-]+$/, 'Letters, numbers, dots, hyphens only'),
  email: z.string().email(),
  password: z
    .string().min(8)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, 'Need uppercase, lowercase, number, special char'),
  fullName: z.string().max(255).optional(),
  roleIds: z.array(z.string().uuid()).min(1, 'At least one role required'),
  hisEmployeeCode: z.string().optional(),
  mustChangePassword: z.boolean().optional(),
});
const editSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().max(255).optional(),
  roleIds: z.array(z.string().uuid()).min(1, 'At least one role required').optional(),
  hisEmployeeCode: z.string().optional(),
  mustChangePassword: z.boolean().optional(),
});
type CreateForm = z.infer<typeof createSchema>;
type EditForm   = z.infer<typeof editSchema>;

// Standalone email-format check, independent of react-hook-form's error
// timing (which by default only populates after a first submit attempt) --
// this is used purely to decide "is it worth calling the availability
// endpoint yet," not to render a field error.
const emailFormatSchema = z.string().email();

// Stable empty arrays — avoids MUI infinite loop caused by inline [] literals.
// React creates a new array reference on every render for inline [], which
// makes useEffect dependencies and controlled Select values change every render.
const EMPTY_STRING_ARRAY: string[] = [];
const EMPTY_BRANCHES: { id: string; name: string }[] = [];

// ── Module colour map ─────────────────────────────────────────────────────────
const MODULE_COLOR: Record<string, string> = {
  PLATFORM: '#1565C0', LOYALTY: '#2E7D32', EIC: '#6A1B9A',
  HIS: '#E65100', TOKEN: '#00838F',
};

// ── Permissions Dialog ────────────────────────────────────────────────────────
function PermissionsDialog({ open, onClose, user }: {
  open: boolean; onClose: () => void; user: UserListItem;
}) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  // All available permissions
  const { data: allPermissions = [], isLoading: loadingPerms } = useQuery({
    queryKey: ['permissions'],
    queryFn: rolesApi.listPermissions,
    staleTime: 60_000,
    enabled: open,
  });

  // Full role list (includes permissions per role for "assign all" shortcut)
  const { data: allRoles = [] } = useQuery<RoleWithPermissions[]>({
    queryKey: ['roles'],
    queryFn: rolesApi.list,
    staleTime: 60_000,
    enabled: open,
  });

  // Current user's direct permissions (fetched fresh when dialog opens)
  const { data: userDetail, isLoading: loadingUser } = useQuery({
    queryKey: ['user-detail', user.id],
    queryFn: () => usersApi.get(user.id),
    staleTime: 0,
    enabled: open,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Sync selected when userDetail loads
  useEffect(() => {
    if (userDetail?.directPermissions) {
      setSelected(new Set(userDetail.directPermissions.map((p) => p.id)));
    }
  }, [userDetail]);

  // Permissions already granted via role
  const rolePermissionIds = new Set(
    user.roles.flatMap((r) => {
      const full = allRoles.find((ar) => ar.id === r.id);
      return full?.permissions?.map((p) => p.id) ?? [];
    }),
  );

  const saveMut = useMutation({
    mutationFn: () => usersApi.assignPermissions(user.id, [...selected]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-detail', user.id] });
      enqueueSnackbar('Permissions saved', { variant: 'success' });
      onClose();
    },
    onError: (err: any) =>
      enqueueSnackbar(err?.response?.data?.message ?? 'Failed to save permissions', { variant: 'error' }),
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // "Assign all from role" — adds all permissions of a role into selected
  const assignAllFromRole = (role: RoleWithPermissions) => {
    setSelected((prev) => {
      const next = new Set(prev);
      (role.permissions ?? []).forEach((p) => next.add(p.id));
      return next;
    });
  };

  // Group permissions by module
  const grouped = allPermissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.moduleCode] ??= []).push(p);
    return acc;
  }, {});

  const isLoading = loadingPerms || loadingUser;

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <SecurityIcon color="primary" />
          <Box>
            <Typography variant="h6" fontWeight={700}>Manage Permissions</Typography>
            <Typography variant="caption" color="text.secondary">
              {user.username} · Direct permissions override on top of role
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small"><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <Divider />

      {/* "Assign all from role" shortcut buttons */}
      <Box sx={{ px: 3, pt: 2, pb: 1, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
          Copy all from role:
        </Typography>
        {user.roles.map((r) => {
          const full = allRoles.find((ar) => ar.id === r.id);
          if (!full) return null;
          return (
            <Chip
              key={r.id}
              label={r.name}
              size="small"
              icon={<ContentCopyIcon sx={{ fontSize: '14px !important' }} />}
              onClick={() => assignAllFromRole(full)}
              clickable
              variant="outlined"
              sx={{ fontWeight: 600, fontSize: '0.7rem' }}
            />
          );
        })}
      </Box>

      <DialogContent sx={{ pt: 1, maxHeight: 480, overflow: 'auto' }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          Object.entries(grouped).sort().map(([module, perms]) => {
            const color = MODULE_COLOR[module] ?? '#3D4A66';
            return (
              <Box key={module} sx={{ mb: 2 }}>
                {/* Module header */}
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 1,
                  px: 1.5, py: 0.75, mb: 0.5, borderRadius: 1,
                  bgcolor: `${color}14`,
                }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
                  <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', color, letterSpacing: 1, textTransform: 'uppercase' }}>
                    {module}
                  </Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', ml: 'auto' }}>
                    {perms.filter((p) => selected.has(p.id) || rolePermissionIds.has(p.id)).length} / {perms.length} granted
                  </Typography>
                </Box>

                {/* Permission rows */}
                {perms.map((p) => {
                  const fromRole   = rolePermissionIds.has(p.id);
                  const isDirect   = selected.has(p.id);
                  const isChecked  = fromRole || isDirect;

                  return (
                    <Box
                      key={p.id}
                      onClick={() => !fromRole && toggle(p.id)}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1.5,
                        px: 1.5, py: 0.6,
                        cursor: fromRole ? 'default' : 'pointer',
                        borderRadius: 1,
                        opacity: fromRole ? 0.6 : 1,
                        '&:hover': !fromRole ? { bgcolor: 'action.hover' } : {},
                      }}
                    >
                      {isChecked
                        ? <CheckBoxIcon sx={{ fontSize: 18, color: fromRole ? 'text.disabled' : 'primary.main' }} />
                        : <CheckBoxOutlineBlankIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                      }
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, fontFamily: 'monospace' }}>
                            {p.resource}:{p.action}
                          </Typography>
                          {fromRole && (
                            <Chip
                              label={`via ${user.roles.find((r) => allRoles.find((ar) => ar.id === r.id)?.permissions?.some((rp) => rp.id === p.id))?.name ?? 'role'}`}
                              size="small"
                              sx={{ height: 16, fontSize: '0.65rem', opacity: 0.75 }}
                            />
                          )}
                          {isDirect && !fromRole && (
                            <Chip
                              label="direct"
                              size="small"
                              color="primary"
                              variant="outlined"
                              sx={{ height: 16, fontSize: '0.65rem' }}
                            />
                          )}
                        </Box>
                        {p.description && (
                          <Typography variant="caption" color="text.disabled" sx={{ lineHeight: 1.2 }}>
                            {p.description}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            );
          })
        )}
      </DialogContent>

      <Divider />
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          {selected.size} direct permission{selected.size !== 1 ? 's' : ''} assigned
        </Typography>
        <Button onClick={onClose} color="inherit" disabled={saveMut.isPending}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || isLoading}
          startIcon={saveMut.isPending ? <CircularProgress size={14} /> : undefined}
        >
          Save Permissions
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ── User Form Dialog ──────────────────────────────────────────────────────────
function UserFormDialog({ open, onClose, editUser }: {
  open: boolean; onClose: () => void; editUser?: UserListItem | null;
}) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [showPw, setShowPw] = useState(false);
  const isEdit = Boolean(editUser);

  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list, staleTime: 60_000 });

  const { data: hisEmployees = [] } = useQuery({
      queryKey: ['his-employees'],
      queryFn: hisApi.getEmployees,
  });

  // Branches
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const { data: allBranches = EMPTY_BRANCHES, isLoading: branchesLoading, isError: branchesError } = useQuery({
    queryKey: ['branches'],
    queryFn: branchesApi.listAll,
    staleTime: 1800_000,
    retry: false, // Oracle may be unavailable
  });
  // Pre-load user's current branches when editing
  const { data: userBranches = EMPTY_BRANCHES } = useQuery({
    queryKey: ['user-branches', editUser?.id],
    queryFn: () => branchesApi.getUserBranches(editUser!.id),
    enabled: !!editUser?.id,
    staleTime: 30_000,
  });
  useEffect(() => {
    setSelectedBranchIds(userBranches.map((b) => b.id));
  }, [userBranches]);

  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema), defaultValues: { mustChangePassword: true } });
  const editForm   = useForm<EditForm>({ resolver: zodResolver(editSchema), defaultValues: {
    email: editUser?.email ?? '', fullName: editUser?.fullName ?? '', roleIds: editUser?.roles?.map((r) => r.id) ?? [], hisEmployeeCode: editUser?.hisEmployeeCode ?? '', mustChangePassword: false,
  }});

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = (isEdit ? editForm : createForm) as any;

  // Live username/email availability, backed by the shared
  // AvailabilityCheckService (see backend `common/validation/`) via
  // `usersApi.checkAvailability`. Username is only checked on create --
  // the edit form doesn't expose a username field at all (see editSchema).
  const watchedUsername = createForm.watch('username');
  const watchedEmail = form.watch('email');
  const usernameFormatValid = !isEdit && createSchema.shape.username.safeParse(watchedUsername).success;
  const emailFormatValid = emailFormatSchema.safeParse(watchedEmail).success;

  const availability = useFieldAvailability<'username' | 'email'>({
    values: isEdit ? { email: watchedEmail } : { username: watchedUsername, email: watchedEmail },
    validFormat: isEdit ? { email: emailFormatValid } : { username: usernameFormatValid, email: emailFormatValid },
    checkFn: (vals, signal) =>
      usersApi.checkAvailability({ ...vals, excludeUserId: isEdit ? editUser?.id : undefined }, signal),
    enabled: open,
  });
  const hasBlockingConflict = availability.status.username === 'taken' || availability.status.email === 'taken';

  // Maps a 409 uniqueness-conflict response back onto the specific
  // username/email field instead of a generic toast. `conflictFields`
  // comes from `global-identity-conflict.util.ts` via the global exception
  // filter -- this is the "backend remains the source of truth" half of
  // the availability-check feature: the client-side check above is only
  // advisory, so if another request wins a race and claims the same
  // username/email between the check and this submit, this is what
  // surfaces that gracefully rather than as a bare toast.
  const applyConflictFieldErrors = (err: any): boolean => {
    const conflictFields: string[] | undefined = err?.response?.data?.conflictFields;
    if (!conflictFields?.length) return false;
    conflictFields.forEach((f) => {
      if (f === 'username' || f === 'email') {
        form.setError(f, { type: 'manual', message: `This ${f} is already in use` });
      }
    });
    return true;
  };

  const createMut = useMutation({
    mutationFn: (data: CreateUserPayload) => usersApi.create(data),
    onSuccess: async (created: any) => {
      if (selectedBranchIds.length > 0) {
        try { await branchesApi.assignBranches(created.id, selectedBranchIds); } catch { /* non-fatal */ }
      }
      qc.invalidateQueries({ queryKey: ['users'] }); enqueueSnackbar('User created', { variant: 'success' }); onClose();
    },
    onError: (err: any) => {
      if (applyConflictFieldErrors(err)) return;
      enqueueSnackbar(err?.response?.data?.message ?? 'Failed to create user', { variant: 'error' });
    },
  });
  const updateMut = useMutation({
    mutationFn: (data: EditForm) => usersApi.update(editUser!.id, data),
    onSuccess: async () => {
      try { await branchesApi.assignBranches(editUser!.id, selectedBranchIds); } catch { /* non-fatal */ }
      qc.invalidateQueries({ queryKey: ['users'] }); qc.invalidateQueries({ queryKey: ['user-branches', editUser?.id] });
      enqueueSnackbar('User updated', { variant: 'success' }); onClose();
    },
    onError: (err: any) => {
      if (applyConflictFieldErrors(err)) return;
      enqueueSnackbar(err?.response?.data?.message ?? 'Failed to update user', { variant: 'error' });
    },
  });

  const isPending = createMut.isPending || updateMut.isPending;
  const onSubmit = (data: CreateForm | EditForm) => {
    // Empty string means "no HIS mapping" — send undefined (omitted) rather
    // than '' so the backend doesn't write it as a real, non-null value that
    // can collide with other unmapped users under the tenant-scoped partial
    // unique index on his_employee_code.
    const normalized = { ...data, hisEmployeeCode: data.hisEmployeeCode || undefined };
    if (isEdit) updateMut.mutate(normalized as EditForm);
    else createMut.mutate(normalized as CreateUserPayload);
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {isEdit && editUser && (
            <Avatar sx={{ width: 34, height: 34, fontSize: 14, fontWeight: 700, bgcolor: avatarColor(editUser.username) }}>
              {editUser.username[0].toUpperCase()}
            </Avatar>
          )}
          <Box>
            <Typography variant="h6" fontWeight={700}>{isEdit ? 'Edit User' : 'New User'}</Typography>
            {isEdit && <Typography variant="caption" color="text.secondary">{editUser?.username}</Typography>}
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2.5 }}>
        {!isEdit && (
          <Box>
            <Controller name="username" control={createForm.control} render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Username" fullWidth size="small"
                error={!!fieldState.error || availability.status.username === 'taken'}
                helperText={fieldState.error?.message}
                onBlur={() => { field.onBlur(); availability.checkNow(); }}
              />
            )} />
            <FieldAvailabilityHint status={availability.status.username} reason={availability.reason.username} label="Username" />
          </Box>
        )}
        <Box>
          <Controller name="email" control={form.control} render={({ field, fieldState }) => (
            <TextField
              {...field}
              label="Email" type="email" fullWidth size="small"
              error={!!fieldState.error || availability.status.email === 'taken'}
              helperText={fieldState.error?.message}
              onBlur={() => { field.onBlur(); availability.checkNow(); }}
            />
          )} />
          <FieldAvailabilityHint status={availability.status.email} reason={availability.reason.email} label="Email" />
        </Box>
        <Controller name="fullName" control={form.control} render={({ field, fieldState }) => (
          <TextField {...field} label="Full Name (optional)" fullWidth size="small" error={!!fieldState.error} helperText={fieldState.error?.message} />
        )} />
        <Controller
            name="hisEmployeeCode"
            control={form.control}
            render={({ field }) => (
                <Autocomplete
                    options={hisEmployees}
                    getOptionLabel={(option: any) =>
                        `${option.employeeCode} - ${option.employeeName}`
                    }
                    value={
                        hisEmployees.find(
                            (e: any) => e.employeeCode === field.value
                        ) ?? null
                    }
                    onChange={(_, value) =>
                        field.onChange(value?.employeeCode ?? null)
                    }
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Map HIS Employee"
                            placeholder="Search employee..."
                        />
                    )}
                />
            )}
        />
        {!isEdit && (
          <Controller name="password" control={createForm.control} render={({ field, fieldState }) => (
            <TextField {...field} label="Password" type={showPw ? 'text' : 'password'} fullWidth size="small"
              error={!!fieldState.error} helperText={fieldState.error?.message ?? 'Min 8 chars, upper/lower/number/special'}
              InputProps={{ endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowPw(s => !s)}>
                    {showPw ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              )}} />
          )} />
        )}
        <Controller name="roleIds" control={form.control} render={({ field, fieldState }) => (
          <FormControl fullWidth size="small" error={!!fieldState.error}>
            <InputLabel>Roles</InputLabel>
            <Select
              {...field}
              multiple
              label="Roles"
              value={field.value ?? []}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {(selected as string[]).map((id) => {
                    const role = roles.find((r) => r.id === id);
                    return role ? (
                      <Chip key={id} label={role.name} size="small" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600 }} />
                    ) : null;
                  })}
                </Box>
              )}
            >
              {roles.map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      bgcolor: (field.value ?? []).includes(r.id) ? 'primary.main' : 'divider',
                    }} />
                    {r.name}
                  </Box>
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>{fieldState.error?.message ?? 'Users can have multiple roles — permissions are combined'}</FormHelperText>
          </FormControl>
        )} />
        {/* Branch Assignment */}
        <FormControl fullWidth size="small" disabled={branchesLoading || branchesError}>
          <InputLabel>Branch Access</InputLabel>
          {branchesLoading ? (
            <Select label="Branch Access" value={EMPTY_STRING_ARRAY} multiple renderValue={() => (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={12} />
                <Typography variant="caption">Loading branches…</Typography>
              </Box>
            )}>
              <MenuItem disabled><em>Loading…</em></MenuItem>
            </Select>
          ) : branchesError || allBranches.length === 0 ? (
            <Select label="Branch Access" value={EMPTY_STRING_ARRAY} multiple renderValue={() => (
              <Typography variant="caption" color="text.disabled">HIS unavailable — branches not loaded</Typography>
            )}>
              <MenuItem disabled><em>Oracle HIS not connected</em></MenuItem>
            </Select>
          ) : (
            <Select
              multiple
              label="Branch Access"
              value={selectedBranchIds}
              onChange={(e) => setSelectedBranchIds(e.target.value as string[])}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {(selected as string[]).map((id) => {
                    const b = allBranches.find((br) => br.id === id);
                    return b ? (
                      <Chip key={id} label={b.name} size="small" icon={<AccountBalanceIcon sx={{ fontSize: '0.85rem !important' }} />}
                        sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600 }} />
                    ) : null;
                  })}
                </Box>
              )}
            >
              {allBranches.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      bgcolor: selectedBranchIds.includes(b.id) ? 'primary.main' : 'divider',
                    }} />
                    {b.name}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          )}
          <FormHelperText>
            {branchesError
              ? 'Oracle HIS is not connected — branches unavailable'
              : 'Select which branches this user can access (leave empty for default branch only)'}
          </FormHelperText>
        </FormControl>
                <Controller name="mustChangePassword" control={form.control} render={({ field }) => (
          <FormControlLabel
            control={<Switch checked={field.value ?? true} onChange={(e) => field.onChange(e.target.checked)} size="small" />}
            label={<Typography variant="body2">Require password change on first login</Typography>}
          />
        )} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isPending} color="inherit">Cancel</Button>
        <Button variant="contained" onClick={form.handleSubmit(onSubmit as any)}
          disabled={isPending || availability.isChecking || hasBlockingConflict}
          startIcon={isPending ? <CircularProgress size={15} /> : undefined}>
          {isEdit ? 'Save Changes' : 'Create User'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { hasPermission } = useAuthStore();
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  const [page, setPage]         = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 400);
  const [dialogOpen, setDialogOpen]         = useState(false);
  const [editUser, setEditUser]             = useState<UserListItem | null>(null);
  const [permsDialogOpen, setPermsDialogOpen] = useState(false);
  const [permsUser, setPermsUser]           = useState<UserListItem | null>(null);

  // Hydration fix: the auth store is persisted to sessionStorage, which
  // doesn't exist during SSR — the server always renders with `user: null`.
  // Deriving canCreate/canUpdate from hasPermission() before the store
  // rehydrates on the client made the very first client render disagree
  // with the server-rendered HTML (buttons/columns that shouldn't exist yet
  // popping in), which React's hydration reconciler flags as an error.
  // Match PlatformLayout's pattern: default permission-gated JSX to "off"
  // until we know we're safely past the first client paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const canCreate = mounted && hasPermission('PLATFORM:USERS:CREATE');
  const canUpdate = mounted && hasPermission('PLATFORM:USERS:UPDATE');

  const { data, isLoading } = useQuery({
    queryKey: ['users', page + 1, rowsPerPage, search],
    queryFn: () => usersApi.list(page + 1, rowsPerPage, search || undefined),
    placeholderData: (prev) => prev,
  });

  const resetPasswordMut = useMutation({
    mutationFn: (id: string) => usersApi.resetPassword(id),
    onSuccess: (res) => enqueueSnackbar(`Temporary password: ${res.temporaryPassword}`, { variant: 'info', persist: true }),
    onError: () => enqueueSnackbar('Failed to reset password', { variant: 'error' }),
  });
  const unlockMut = useMutation({
    mutationFn: (id: string) => usersApi.unlock(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); enqueueSnackbar('Account unlocked', { variant: 'success' }); },
    onError: () => enqueueSnackbar('Failed to unlock account', { variant: 'error' }),
  });
  const toggleActiveMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? usersApi.deactivate(id) : usersApi.activate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: () => enqueueSnackbar('Failed to update status', { variant: 'error' }),
  });

  const openCreate = () => { setEditUser(null); setDialogOpen(true); };
  const openEdit   = (u: UserListItem) => { setEditUser(u); setDialogOpen(true); };
  const openPerms  = (u: UserListItem) => { setPermsUser(u); setPermsDialogOpen(true); };

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Users"
        subtitle={data ? `${data.total.toLocaleString()} accounts` : undefined}
        icon={<PeopleIcon />}
        actions={
          <>
            <TextField
              size="small"
              placeholder="Search username, email…"
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); setPage(0); }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                  </InputAdornment>
                ),
                endAdornment: searchInput ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => { setSearchInput(''); setPage(0); }}>
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
              sx={{ width: 260 }}
            />
            {canCreate && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                New User
              </Button>
            )}
          </>
        }
      />

      <Paper sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Login</TableCell>
                {canUpdate && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading
                ? Array.from({ length: 7 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: canUpdate ? 6 : 5 }).map((_, j) => (
                        <TableCell key={j}><Skeleton /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : data?.items.map((user) => {
                    const color = avatarColor(user.username);
                    return (
                      <TableRow key={user.id} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Avatar sx={{ width: 30, height: 30, fontSize: 12, fontWeight: 700, bgcolor: color, flexShrink: 0 }}>
                              {user.username[0].toUpperCase()}
                            </Avatar>
                            <Box>
                              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.2 }}>
                                {user.username}
                              </Typography>
                              {user.fullName && (
                                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                                  {user.fullName}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>{user.email}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {user.roles?.map((r) => (
                              <Chip key={r.id} label={r.name} size="small" variant="outlined"
                                sx={{ fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
                            ))}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip label={user.isActive ? 'Active' : 'Inactive'} size="small"
                            color={user.isActive ? 'success' : 'default'} />
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>
                          {user.lastLoginAt
                            ? new Date(user.lastLoginAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '–'}
                        </TableCell>
                        {canUpdate && (
                          <TableCell align="right">
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.25 }}>
                              <Tooltip title="Edit user" arrow>
                                <IconButton size="small" onClick={() => openEdit(user)}
                                  sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: (t) => alpha(t.palette.primary.main, 0.08) } }} aria-label="Edit user">
                                  <EditIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Manage permissions" arrow>
                                <IconButton size="small" onClick={() => openPerms(user)}
                                  sx={{ color: 'text.secondary', '&:hover': { color: 'secondary.main', bgcolor: (t) => alpha(t.palette.secondary.main, 0.08) } }} aria-label="Manage permissions">
                                  <SecurityIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Reset password" arrow>
                                <IconButton size="small" onClick={() => resetPasswordMut.mutate(user.id)}
                                  disabled={resetPasswordMut.isPending}
                                  sx={{ color: 'text.secondary', '&:hover': { color: 'warning.main', bgcolor: (t) => alpha(t.palette.warning.main, 0.08) } }} aria-label="Reset password">
                                  <LockResetIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Unlock account" arrow>
                                <IconButton size="small" onClick={() => unlockMut.mutate(user.id)}
                                  disabled={unlockMut.isPending}
                                  sx={{ color: 'text.secondary', '&:hover': { color: 'info.main', bgcolor: (t) => alpha(t.palette.info.main, 0.08) } }} aria-label="Unlock account">
                                  <LockOpenIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title={user.isActive ? 'Deactivate' : 'Activate'} arrow>
                                <Switch size="small" checked={user.isActive}
                                  onChange={() => toggleActiveMut.mutate({ id: user.id, active: user.isActive })}
                                  disabled={toggleActiveMut.isPending} />
                              </Tooltip>
                            </Box>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={data?.total ?? 0} page={page}
          onPageChange={(_, p) => setPage(p)} rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 20, 50]} />
      </Paper>

      <UserFormDialog
        key={dialogOpen ? (editUser?.id ?? 'new') : 'closed'}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editUser={editUser}
      />

      {permsUser && (
        <PermissionsDialog
          key={permsDialogOpen ? permsUser.id : 'closed'}
          open={permsDialogOpen}
          onClose={() => { setPermsDialogOpen(false); setPermsUser(null); }}
          user={permsUser}
        />
      )}
    </Box>
  );
}
