'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
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
import Chip from '@mui/material/Chip';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { alpha } from '@mui/material/styles';
import { vendorApi } from '@/lib/api/vendor.api';

const STATUS_COLORS: Record<string, 'warning' | 'success' | 'error' | 'default' | 'info'> = {
  REQUESTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  EXPIRED: 'default',
  COMPLETED: 'info',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function TempPasswordReveal({ password, onClose }: { password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(password);
    setCopied(true);
  };

  return (
    <ResponsiveDialog open maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2.5 } }}>
      <DialogTitle sx={{ fontWeight: 700, color: '#0D2744', pt: 2.5 }}>
        Temporary Password Generated
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 1.5, fontSize: '0.8125rem' }}>
          This password will <strong>not</strong> be shown again. Copy and communicate it securely to the ZoeConnect Super Admin.
        </Alert>
        <Box
          sx={{
            bgcolor: '#F8FAFC',
            border: '1.5px solid #CBD5E1',
            borderRadius: 1.5,
            p: 2,
            fontFamily: 'monospace',
            fontSize: '1.05rem',
            letterSpacing: '0.06em',
            fontWeight: 700,
            color: '#0D2744',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          {password}
          <Tooltip title={copied ? 'Copied!' : 'Copy'}>
            <IconButton size="small" onClick={copy} sx={{ color: copied ? '#22C55E' : '#64748B' }} aria-label="Copy">
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" sx={{ color: '#64748B' }}>
            The Super Admin will be required to change this password on first login.
          </Typography>
        </Box>
        <Box
          component="label"
          sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: '#0D3B72', cursor: 'pointer' }}
          />
          <Typography variant="body2" sx={{ color: '#334155', userSelect: 'none' }}>
            I have recorded this password
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 2.5, pb: 2.5 }}>
        <Button
          onClick={onClose}
          disabled={!confirmed}
          variant="contained"
          sx={{
            bgcolor: '#0D3B72', borderRadius: 1.5, textTransform: 'none', fontWeight: 600, px: 3,
            '&:hover': { bgcolor: '#0A2F5C' },
            '&.Mui-disabled': { bgcolor: '#94A3B8', color: '#fff' },
          }}
        >
          Done — Close
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

export function PasswordResetRequests({ hospitalId }: { hospitalId: string }) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  
  const [reviewing, setReviewing] = useState<any>(null);
  const [action, setAction] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [note, setNote] = useState('');
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const { data: requests, isLoading } = useQuery({
    queryKey: ['password-reset-requests', hospitalId],
    queryFn: () => vendorApi.getPasswordResetRequests(hospitalId),
    refetchInterval: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: (reqId: string) => vendorApi.approvePasswordResetRequest(hospitalId, reqId, { note }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['password-reset-requests', hospitalId] });
      setReviewing(null);
      setAction(null);
      setNote('');
      if (data.temporaryPassword) {
        setTempPassword(data.temporaryPassword);
      } else {
        enqueueSnackbar('Request approved successfully', { variant: 'success' });
      }
    },
    onError: (err: any) => enqueueSnackbar(err?.response?.data?.message ?? 'Approval failed', { variant: 'error' }),
  });

  const rejectMutation = useMutation({
    mutationFn: (reqId: string) => vendorApi.rejectPasswordResetRequest(hospitalId, reqId, { reason: note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['password-reset-requests', hospitalId] });
      enqueueSnackbar('Request rejected', { variant: 'success' });
      setReviewing(null);
      setAction(null);
      setNote('');
    },
    onError: (err: any) => enqueueSnackbar(err?.response?.data?.message ?? 'Rejection failed', { variant: 'error' }),
  });

  const unlockMutation = useMutation({
    mutationFn: (userId: string) => vendorApi.remoteUnlockUser(hospitalId, userId, { reason: 'Emergency unlock based on reset request' }),
    onSuccess: () => {
      enqueueSnackbar('User unlocked successfully', { variant: 'success' });
      qc.invalidateQueries({ queryKey: ['locked-users', hospitalId] });
    },
    onError: (err: any) => enqueueSnackbar(err?.response?.data?.message ?? 'Unlock failed', { variant: 'error' }),
  });

  const handleSubmit = () => {
    if (!action || !note.trim() || !reviewing) return;
    if (action === 'APPROVE') approveMutation.mutate(reviewing.id);
    else rejectMutation.mutate(reviewing.id);
  };

  const pendingCount = requests?.filter((r: any) => r.status === 'REQUESTED').length || 0;

  return (
    <Box sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h6">Super Admin Reset Requests</Typography>
          {pendingCount > 0 && (
            <Chip label={`${pendingCount} pending`} color="warning" size="small" sx={{ fontWeight: 600 }} />
          )}
        </Box>
      </Box>

      <Card sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }} elevation={0}>
        <ResponsiveTable minWidth={800}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell sx={{ fontWeight: 700 }}>Requested At</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Username</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Reason</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : requests?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No password reset requests.
                </TableCell>
              </TableRow>
            ) : (
              requests?.map((req: any) => (
                <TableRow key={req.id} hover>
                  <TableCell>{formatDate(req.createdAt)}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{req.username}</TableCell>
                  <TableCell>
                    <Chip
                      label={req.status}
                      size="small"
                      color={STATUS_COLORS[req.status] ?? 'default'}
                      sx={{ fontSize: '0.72rem', fontWeight: 600 }}
                    />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 200 }}>
                    <Tooltip title={req.reason || ''}>
                      <Typography noWrap variant="body2">{req.reason || '—'}</Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    {req.status === 'REQUESTED' ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                        {req.reason?.toLowerCase().includes('lock') && (
                          <Tooltip title="Emergency Unlock (does not reset password)">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => unlockMutation.mutate(req.username)}
                              disabled={unlockMutation.isPending}
                              aria-label="Emergency Unlock (does not reset password)"
                            >
                              <LockOpenIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => { setReviewing(req); setAction(null); setNote(''); }}
                          sx={{ borderRadius: 1.5, textTransform: 'none', fontWeight: 600 }}
                        >
                          Review
                        </Button>
                      </Box>
                    ) : (
                      <Tooltip title={req.approvalNote || req.rejectionReason || ''}>
                        <Typography sx={{ fontSize: '0.75rem', color: '#94A3B8', fontStyle: 'italic' }}>
                          {req.approvedAt ? `Reviewed ${formatDate(req.approvedAt)}` : '—'}
                        </Typography>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </ResponsiveTable>
      </Card>

      {/* Review Dialog */}
      <ResponsiveDialog open={!!reviewing} onClose={() => setReviewing(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Review Reset Request</DialogTitle>
        <DialogContent>
          {reviewing && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Button
                  variant={action === 'APPROVE' ? 'contained' : 'outlined'}
                  startIcon={<CheckCircleOutlineIcon />}
                  onClick={() => setAction('APPROVE')}
                  sx={{ flex: 1, borderRadius: 1.5, ...(action === 'APPROVE' ? { bgcolor: '#16A34A', '&:hover': { bgcolor: '#15803D' } } : {}) }}
                >
                  Approve
                </Button>
                <Button
                  variant={action === 'REJECT' ? 'contained' : 'outlined'}
                  startIcon={<CancelOutlinedIcon />}
                  onClick={() => setAction('REJECT')}
                  sx={{ flex: 1, borderRadius: 1.5, ...(action === 'REJECT' ? { bgcolor: '#DC2626', '&:hover': { bgcolor: '#B91C1C' } } : {}) }}
                >
                  Reject
                </Button>
              </Box>

              {action && (
                <TextField
                  label={action === 'APPROVE' ? 'Approval note (required)' : 'Rejection reason (required)'}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  fullWidth
                  multiline
                  rows={3}
                  autoFocus
                />
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setReviewing(null)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!action || !note.trim() || approveMutation.isPending || rejectMutation.isPending}
            variant="contained"
            sx={{ borderRadius: 1.5 }}
          >
            {approveMutation.isPending || rejectMutation.isPending ? <CircularProgress size={20} /> : 'Confirm'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* Temp Password Reveal -- shown once after a successful approve, per
          the "not shown again" copy inside TempPasswordReveal itself. This
          was previously defined but never mounted, so approvePasswordResetRequest()
          succeeding server-side had no visible effect for the vendor admin. */}
      {tempPassword && (
        <TempPasswordReveal password={tempPassword} onClose={() => setTempPassword(null)} />
      )}
    </Box>
  );
}
