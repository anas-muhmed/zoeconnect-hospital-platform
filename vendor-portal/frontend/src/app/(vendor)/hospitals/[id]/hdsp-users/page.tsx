'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import PageHeader from '@/components/PageHeader';
import ResponsiveTable from '@/components/ResponsiveTable';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import Snackbar from '@mui/material/Snackbar';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';

import PeopleIcon from '@mui/icons-material/People';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LockResetIcon from '@mui/icons-material/LockReset';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

import { vendorApi } from '@/lib/api/vendor.api';
import type { HdspUser } from '@/lib/api/vendor.api';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import NoEncryptionIcon from '@mui/icons-material/NoEncryption';
import AutorenewIcon from '@mui/icons-material/Autorenew';

type ToastState = { open: boolean; msg: string; severity: 'success' | 'error' };

const EMPTY_CREATE = { username: '', password: '', confirmPassword: '', role: 'STAFF' as 'SUPER_ADMIN' | 'ADMIN' | 'STAFF', fullName: '' };
const EMPTY_RECOVERY = { username: 'recovery.admin', fullName: 'Recovery Administrator', expiresAt: '24' };

export default function HdspUsersPage() {
  const params     = useParams();
  const qc         = useQueryClient();
  const hospitalId = params.id as string;

  const [toast, setToast] = useState<ToastState>({ open: false, msg: '', severity: 'success' });
  const showToast = (msg: string, severity: 'success' | 'error') => setToast({ open: true, msg, severity });

  // Create dialog state
  const [createOpen, setCreateOpen]   = useState(false);
  const [createForm, setCreateForm]   = useState(EMPTY_CREATE);

  // Edit dialog state
  const [editUser, setEditUser]       = useState<HdspUser | null>(null);
  const [editRole, setEditRole]       = useState<'SUPER_ADMIN' | 'ADMIN' | 'STAFF'>('STAFF');
  const [editFullName, setEditFN]     = useState('');
  const [editActive, setEditActive]   = useState(true);
  const [editPwd, setEditPwd]         = useState('');
  const [editConfirm, setEditConfirm] = useState('');

  // Delete confirm dialog
  const [deleteUser, setDeleteUser] = useState<HdspUser | null>(null);

  // Recovery Admin Dialog
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryForm, setRecoveryForm] = useState(EMPTY_RECOVERY);
  const [recoveryResult, setRecoveryResult] = useState<{ username: string, temporaryPassword: string } | null>(null);

  // Data
  const { data: hospital } = useQuery({
    queryKey: ['hospital', hospitalId],
    queryFn:  () => vendorApi.getHospital(hospitalId),
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['hdsp-users', hospitalId],
    queryFn:  () => vendorApi.listHdspUsers(hospitalId),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: () => vendorApi.createHdspUser(hospitalId, {
      username: createForm.username.trim(),
      password: createForm.password,
      role:     createForm.role,
      fullName: createForm.fullName.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hdsp-users', hospitalId] });
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE);
      showToast('User created. Click "Push to Hospital" to provision them on ZoeConnect.', 'success');
    },
    onError: (e: any) => showToast(e?.response?.data?.message ?? 'Failed to create user.', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: () => vendorApi.updateHdspUser(editUser!.id, {
      role:     editRole,
      fullName: editFullName.trim() || undefined,
      isActive: editActive,
      ...(editPwd ? { password: editPwd } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hdsp-users', hospitalId] });
      setEditUser(null);
      showToast('User updated. Push to Hospital to apply changes.', 'success');
    },
    onError: (e: any) => showToast(e?.response?.data?.message ?? 'Failed to update user.', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => vendorApi.deleteHdspUser(deleteUser!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hdsp-users', hospitalId] });
      setDeleteUser(null);
      showToast('User removed.', 'success');
    },
    onError: () => showToast('Failed to delete user.', 'error'),
  });

  const pushMutation = useMutation({
    mutationFn: () => vendorApi.pushHisConfig(hospitalId),
    onSuccess: (res) => showToast(res.message, res.ok ? 'success' : 'error'),
    onError: () => showToast('Push failed.', 'error'),
  });

  const recoveryMutation = useMutation({
    mutationFn: () => vendorApi.remoteCreateUser(hospitalId, {
      username: recoveryForm.username,
      fullName: recoveryForm.fullName,
      roles: ['SUPER_ADMIN'],
      mustChangePassword: true,
      isRecoveryAccount: true,
      expiresAt: recoveryForm.expiresAt !== 'never' 
        ? new Date(Date.now() + parseInt(recoveryForm.expiresAt) * 3600 * 1000).toISOString()
        : null
    }),
    onSuccess: (res) => setRecoveryResult(res.result),
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to create recovery admin', 'error'),
  });

  const unlockMutation = useMutation({
    mutationFn: (username: string) => vendorApi.remoteUnlockUser(hospitalId, username, { reason: 'Vendor unlocked' }),
    onSuccess: () => showToast('Unlock command sent successfully', 'success'),
    onError: () => showToast('Failed to send unlock command', 'error'),
  });

  const resetMutation = useMutation({
    mutationFn: (username: string) => vendorApi.remoteResetPassword(hospitalId, username, { vendorRequestId: 'ADMIN_INITIATED', reason: 'Vendor reset' }),
    onSuccess: () => showToast('Password reset command sent successfully', 'success'),
    onError: () => showToast('Failed to send reset command', 'error'),
  });

  // Helpers
  const openEdit = (u: HdspUser) => {
    setEditUser(u);
    setEditRole(u.role);
    setEditFN(u.fullName ?? '');
    setEditActive(u.isActive);
    setEditPwd('');
    setEditConfirm('');
  };

  const createValid =
    createForm.username.trim().length >= 3 &&
    createForm.password.length >= 8 &&
    createForm.password === createForm.confirmPassword;

  const editPwdValid = !editPwd || (editPwd.length >= 8 && editPwd === editConfirm);

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <PageHeader
        icon={<PeopleIcon color="primary" />}
        title="ZoeConnect User Credentials"
        subtitle={`${hospital?.hospitalName ?? hospitalId} — manage login accounts for hospital staff`}
        back={true}
        mb={1}
        actions={
          <>
            <Button
              size="small" variant="outlined" startIcon={<CloudUploadIcon />}
              onClick={() => pushMutation.mutate()} disabled={pushMutation.isPending}
            >
              {pushMutation.isPending ? 'Pushing...' : 'Push to Hospital'}
            </Button>
            <Button
              variant="outlined" size="small" color="secondary" startIcon={<AdminPanelSettingsIcon />}
              onClick={() => setRecoveryOpen(true)}
            >
              Recovery Admin
            </Button>
            <Button
              variant="contained" size="small" startIcon={<PersonAddIcon />}
              onClick={() => setCreateOpen(true)}
            >
              Add User
            </Button>
          </>
        }
      />

      <Alert severity="info" icon={<InfoOutlinedIcon />} sx={{ mb: 2.5, fontSize: 13 }}>
        Users added here are provisioned on the hospital's ZoeConnect instance when you click <strong>Push to Hospital</strong>.
        Passwords are bcrypt-hashed before storage and never sent in plaintext.
      </Alert>

      {/* User table */}
      {isLoading ? (
        <Skeleton variant="rectangular" height={200} />
      ) : users.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
          <PeopleIcon sx={{ fontSize: 48, opacity: 0.2, mb: 1 }} />
          <Typography>No users yet. Click <strong>Add User</strong> to create the first ZoeConnect login.</Typography>
        </Box>
      ) : (
        <ResponsiveTable minWidth={900}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, color: 'text.secondary' } }}>
              <TableCell>Username</TableCell>
              <TableCell>Full Name</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Added</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.id} hover>
                <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{u.username}</TableCell>
                <TableCell>{u.fullName ?? <span style={{ opacity: 0.4 }}>—</span>}</TableCell>
                <TableCell>
                  <Chip
                    label={u.role} size="small"
                    sx={{
                      bgcolor: u.role === 'SUPER_ADMIN' ? '#f3e5f5' : u.role === 'ADMIN' ? '#fce4ec' : '#e3f2fd',
                      color:   u.role === 'SUPER_ADMIN' ? '#6a1b9a' : u.role === 'ADMIN' ? '#c62828' : '#1565c0',
                      fontWeight: 600, fontSize: 11,
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={u.isActive ? 'Active' : 'Inactive'} size="small"
                    sx={{
                      bgcolor: u.isActive ? '#e8f5e9' : '#f5f5f5',
                      color:   u.isActive ? '#2e7d32' : '#9e9e9e',
                      fontWeight: 600, fontSize: 11,
                    }}
                  />
                </TableCell>
                <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {new Date(u.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Remote Unlock (direct to instance)">
                    <IconButton size="small" onClick={() => unlockMutation.mutate(u.username)} disabled={unlockMutation.isPending} aria-label="Remote Unlock (direct to instance)">
                      <NoEncryptionIcon fontSize="small" color="info" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Remote Password Reset">
                    <IconButton size="small" onClick={() => resetMutation.mutate(u.username)} disabled={resetMutation.isPending} aria-label="Remote Password Reset">
                      <AutorenewIcon fontSize="small" color="warning" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Edit / reset password">
                    <IconButton size="small" onClick={() => openEdit(u)} aria-label="Edit / reset password"><EditIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="Delete user">
                    <IconButton size="small" color="error" onClick={() => setDeleteUser(u)} aria-label="Delete user">
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </ResponsiveTable>
      )}

      {/* ── Create User Dialog ── */}
      <ResponsiveDialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>Add ZoeConnect User</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <TextField
            label="Username" size="small" fullWidth autoFocus
            value={createForm.username} onChange={e => setCreateForm(p => ({ ...p, username: e.target.value }))}
            helperText="Min 3 characters"
          />
          <TextField
            label="Full name (optional)" size="small" fullWidth
            value={createForm.fullName} onChange={e => setCreateForm(p => ({ ...p, fullName: e.target.value }))}
          />
          <FormControl size="small" fullWidth>
            <InputLabel>Role</InputLabel>
            <Select
              label="Role" value={createForm.role}
              onChange={e => setCreateForm(p => ({ ...p, role: e.target.value as 'ADMIN' | 'STAFF' }))}
            >
              <MenuItem value="STAFF">STAFF</MenuItem>
              <MenuItem value="ADMIN">ADMIN</MenuItem>
              <MenuItem value="SUPER_ADMIN">SUPER_ADMIN</MenuItem>
            </Select>
          </FormControl>
          <Divider />
          <TextField
            label="Password" type="password" size="small" fullWidth
            value={createForm.password} onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))}
            helperText="Min 8 characters"
            error={createForm.password.length > 0 && createForm.password.length < 8}
          />
          <TextField
            label="Confirm password" type="password" size="small" fullWidth
            value={createForm.confirmPassword} onChange={e => setCreateForm(p => ({ ...p, confirmPassword: e.target.value }))}
            error={createForm.confirmPassword.length > 0 && createForm.password !== createForm.confirmPassword}
            helperText={createForm.confirmPassword.length > 0 && createForm.password !== createForm.confirmPassword ? 'Passwords do not match' : ''}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!createValid || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? 'Creating...' : 'Create User'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* ── Edit User Dialog ── */}
      <ResponsiveDialog open={!!editUser} onClose={() => setEditUser(null)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>
          Edit User — <span style={{ fontFamily: 'monospace' }}>{editUser?.username}</span>
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <TextField
            label="Full name" size="small" fullWidth
            value={editFullName} onChange={e => setEditFN(e.target.value)}
          />
          <FormControl size="small" fullWidth>
            <InputLabel>Role</InputLabel>
            <Select label="Role" value={editRole} onChange={e => setEditRole(e.target.value as 'ADMIN' | 'STAFF')}>
              <MenuItem value="STAFF">STAFF</MenuItem>
              <MenuItem value="ADMIN">ADMIN</MenuItem>
              <MenuItem value="SUPER_ADMIN">SUPER_ADMIN</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel
            control={<Switch checked={editActive} onChange={e => setEditActive(e.target.checked)} />}
            label={editActive ? 'Active' : 'Inactive'}
          />
          <Divider>
            <Typography variant="caption" color="text.secondary">Reset Password (optional)</Typography>
          </Divider>
          <TextField
            label="New password" type="password" size="small" fullWidth
            value={editPwd} onChange={e => setEditPwd(e.target.value)}
            helperText="Leave blank to keep existing password"
            InputProps={{ startAdornment: <LockResetIcon sx={{ fontSize: 16, mr: 1, color: 'text.disabled' }} /> }}
          />
          {editPwd && (
            <TextField
              label="Confirm new password" type="password" size="small" fullWidth
              value={editConfirm} onChange={e => setEditConfirm(e.target.value)}
              error={editConfirm.length > 0 && editPwd !== editConfirm}
              helperText={editConfirm.length > 0 && editPwd !== editConfirm ? 'Passwords do not match' : ''}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditUser(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!editPwdValid || updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* ── Delete Confirm Dialog ── */}
      <ResponsiveDialog open={!!deleteUser} onClose={() => setDeleteUser(null)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700} color="error.main">Delete User</DialogTitle>
        <DialogContent>
          <Typography>
            Remove <strong style={{ fontFamily: 'monospace' }}>{deleteUser?.username}</strong> from this hospital?
            This does not immediately remove them from ZoeConnect — that happens on the next config push.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteUser(null)}>Cancel</Button>
          <Button
            variant="contained" color="error"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* ── Create Recovery Admin Dialog ── */}
      <ResponsiveDialog open={recoveryOpen} onClose={() => { setRecoveryOpen(false); setRecoveryResult(null); }} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700} color="secondary.main">
          {recoveryResult ? 'Recovery Admin Created' : 'Create Recovery Super Admin'}
        </DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          {recoveryResult ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Alert severity="success">Temporary recovery account provisioned successfully.</Alert>
              <TextField label="Username" size="small" fullWidth value={recoveryResult.username} InputProps={{ readOnly: true }} />
              <TextField label="Temporary Password" size="small" fullWidth value={recoveryResult.temporaryPassword} InputProps={{ readOnly: true }} helperText="Please securely copy this password. It will not be shown again." />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Alert severity="info" sx={{ mb: 1 }}>This command bypasses the config push queue and executes immediately on the remote ZoeConnect instance.</Alert>
              <TextField
                label="Username" size="small" fullWidth
                value={recoveryForm.username} onChange={e => setRecoveryForm(p => ({ ...p, username: e.target.value }))}
              />
              <TextField
                label="Full name" size="small" fullWidth
                value={recoveryForm.fullName} onChange={e => setRecoveryForm(p => ({ ...p, fullName: e.target.value }))}
              />
              <FormControl size="small" fullWidth>
                <InputLabel>Expiration</InputLabel>
                <Select label="Expiration" value={recoveryForm.expiresAt} onChange={e => setRecoveryForm(p => ({ ...p, expiresAt: e.target.value }))}>
                  <MenuItem value="24">24 hours</MenuItem>
                  <MenuItem value="48">48 hours</MenuItem>
                  <MenuItem value="72">72 hours</MenuItem>
                  <MenuItem value="never">Never (Not recommended)</MenuItem>
                </Select>
              </FormControl>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {recoveryResult ? (
            <Button variant="contained" onClick={() => { setRecoveryOpen(false); setRecoveryResult(null); }}>Close</Button>
          ) : (
            <>
              <Button onClick={() => setRecoveryOpen(false)}>Cancel</Button>
              <Button
                variant="contained" color="secondary"
                disabled={recoveryMutation.isPending || !recoveryForm.username.trim()}
                onClick={() => recoveryMutation.mutate()}
              >
                {recoveryMutation.isPending ? 'Provisioning...' : 'Provision Now'}
              </Button>
            </>
          )}
        </DialogActions>
      </ResponsiveDialog>

      {/* Toast */}
      <Snackbar open={toast.open} autoHideDuration={6000}
        onClose={() => setToast(p => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.severity} onClose={() => setToast(p => ({ ...p, open: false }))}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
