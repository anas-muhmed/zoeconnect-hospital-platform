'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import PageHeader from '@/components/PageHeader';
import ResponsiveTable from '@/components/ResponsiveTable';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Checkbox from '@mui/material/Checkbox';
import SecurityIcon from '@mui/icons-material/Security';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

import { vendorApi } from '@/lib/api/vendor.api';
import { PasswordResetRequests } from './PasswordResetRequests';

export default function SecurityPage() {
  const { id } = useParams() as { id: string };
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [unlockTarget, setUnlockTarget] = useState<string | null>(null);
  const [bulkUnlockOpen, setBulkUnlockOpen] = useState(false);
  const [reason, setReason] = useState('');

  const { data: lockedUsers, isLoading, error } = useQuery({
    queryKey: ['locked-users', id],
    queryFn: () => vendorApi.getLockedUsers(id),
  });

  const unlockMutation = useMutation({
    mutationFn: (userId: string) => vendorApi.remoteUnlockUser(id, userId, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locked-users', id] });
      enqueueSnackbar('User unlocked successfully', { variant: 'success' });
      setUnlockTarget(null);
      setReason('');
    },
    onError: (err: any) => enqueueSnackbar(err?.response?.data?.message ?? 'Unlock failed', { variant: 'error' }),
  });

  const resetAttemptsMutation = useMutation({
    mutationFn: (userId: string) => vendorApi.remoteResetAttempts(id, userId, { reason: 'Admin override' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locked-users', id] });
      enqueueSnackbar('Login attempts reset successfully', { variant: 'success' });
    },
    onError: (err: any) => enqueueSnackbar(err?.response?.data?.message ?? 'Reset failed', { variant: 'error' }),
  });

  const bulkUnlockMutation = useMutation({
    mutationFn: () => vendorApi.remoteBulkUnlock(id, Array.from(selectedUsers), { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locked-users', id] });
      enqueueSnackbar('Selected users unlocked successfully', { variant: 'success' });
      setBulkUnlockOpen(false);
      setSelectedUsers(new Set());
      setReason('');
    },
    onError: (err: any) => enqueueSnackbar(err?.response?.data?.message ?? 'Bulk unlock failed', { variant: 'error' }),
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked && lockedUsers) {
      setSelectedUsers(new Set(lockedUsers.map(u => u.id)));
    } else {
      setSelectedUsers(new Set());
    }
  };

  const handleSelect = (userId: string, checked: boolean) => {
    const next = new Set(selectedUsers);
    if (checked) next.add(userId);
    else next.delete(userId);
    setSelectedUsers(next);
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <PageHeader
        icon={<SecurityIcon color="error" fontSize="large" />}
        title="Remote Admin: Security"
        back={true}
      />

      {error && <Alert severity="error" sx={{ mb: 3 }}>Failed to fetch locked users</Alert>}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Locked User Accounts</Typography>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<LockOpenIcon />}
          disabled={selectedUsers.size === 0}
          onClick={() => setBulkUnlockOpen(true)}
        >
          Bulk Unlock ({selectedUsers.size})
        </Button>
      </Box>

      <Card sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }} elevation={0}>
        <ResponsiveTable minWidth={900}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell padding="checkbox">
                <Checkbox 
                  indeterminate={selectedUsers.size > 0 && selectedUsers.size < (lockedUsers?.length || 0)}
                  checked={lockedUsers?.length! > 0 && selectedUsers.size === lockedUsers?.length}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }}>User / Role</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Lock Reason</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Failed Attempts</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Locked Until</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : lockedUsers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No locked user accounts found for this hospital.
                </TableCell>
              </TableRow>
            ) : (
              lockedUsers?.map((user) => (
                <TableRow key={user.id} hover>
                  <TableCell padding="checkbox">
                    <Checkbox 
                      checked={selectedUsers.has(user.id)}
                      onChange={(e) => handleSelect(user.id, e.target.checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{user.firstName} {user.lastName}</Typography>
                    <Typography variant="caption" color="text.secondary">{user.username} • {user.role}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="error.main">{user.lockReason}</Typography>
                  </TableCell>
                  <TableCell>
                    {user.failedLoginCount}
                  </TableCell>
                  <TableCell>
                    {user.lockedUntil ? new Date(user.lockedUntil).toLocaleString() : 'N/A'}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Reset Login Attempts">
                      <IconButton size="small" onClick={() => resetAttemptsMutation.mutate(user.id)} color="primary" aria-label="Reset Login Attempts">
                        <RestartAltIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Unlock Account">
                      <IconButton size="small" onClick={() => setUnlockTarget(user.id)} color="success" aria-label="Unlock Account">
                        <LockOpenIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </ResponsiveTable>
      </Card>

      <PasswordResetRequests hospitalId={id} />

      {/* Unlock Individual User Dialog */}
      <ResponsiveDialog open={!!unlockTarget} onClose={() => setUnlockTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Unlock User Account</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            You are about to unlock this user account. Please provide a reason for the audit log.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Reason for unlocking"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnlockTarget(null)}>Cancel</Button>
          <Button 
            onClick={() => unlockTarget && unlockMutation.mutate(unlockTarget)} 
            variant="contained" 
            color="primary"
            disabled={!reason.trim() || unlockMutation.isPending}
          >
            {unlockMutation.isPending ? <CircularProgress size={24} /> : 'Unlock User'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* Bulk Unlock Dialog */}
      <ResponsiveDialog open={bulkUnlockOpen} onClose={() => setBulkUnlockOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Bulk Unlock {selectedUsers.size} Users</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Please provide a reason for unlocking these {selectedUsers.size} accounts. This will be recorded in the audit log.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Reason for bulk unlock"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkUnlockOpen(false)}>Cancel</Button>
          <Button 
            onClick={() => bulkUnlockMutation.mutate()} 
            variant="contained" 
            color="primary"
            disabled={!reason.trim() || bulkUnlockMutation.isPending}
          >
            {bulkUnlockMutation.isPending ? <CircularProgress size={24} /> : 'Unlock Users'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
