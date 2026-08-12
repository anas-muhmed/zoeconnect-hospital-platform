'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import { alpha } from '@mui/material/styles';

import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PasswordIcon from '@mui/icons-material/Password';
import RefreshIcon from '@mui/icons-material/Refresh';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { authApi, type PasswordResetRequestItem } from '@/lib/api/auth.api';
import { useAuthStore } from '@/lib/store/auth.store';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function timeRemaining(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`;
}

function isExpiringSoon(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return ms > 0 && ms < 4 * 3_600_000; // < 4 hours
}

const STATUS_COLORS: Record<string, 'warning' | 'success' | 'error' | 'default' | 'info'> = {
  REQUESTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  EXPIRED: 'default',
  COMPLETED: 'info',
};

const TYPE_LABEL: Record<string, string> = {
  EMPLOYEE_TO_SUPERADMIN: 'Employee',
  SUPERADMIN_TO_VENDOR:   'Super Admin',
};

// ── One-Time Password Reveal ──────────────────────────────────────────────────

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
        Temporary Password
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 1.5, fontSize: '0.8125rem' }}>
          This password will <strong>not</strong> be shown again. Copy and securely communicate it to the user.
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
            <IconButton size="small" onClick={copy} sx={{ color: copied ? '#22C55E' : '#64748B' }} aria-label={copied ? 'Copied!' : 'Copy'}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" sx={{ color: '#64748B' }}>
            The user will be required to change this password on first login. It expires in 24 hours.
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
            I have recorded this password and will communicate it securely
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

// ── Review Dialog ─────────────────────────────────────────────────────────────

function ReviewDialog({
  request,
  onClose,
  onResult,
}: {
  request: PasswordResetRequestItem;
  onClose: () => void;
  onResult: (tempPassword?: string) => void;
}) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [action, setAction] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [note, setNote]     = useState('');

  const mutation = useMutation({
    mutationFn: (dto: { action: 'APPROVE' | 'REJECT'; note: string }) =>
      authApi.reviewPasswordResetRequest(request.id, dto),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['password-reset-requests'] });
      enqueueSnackbar(
        result.status === 'APPROVED' ? 'Request approved. Temporary password generated.' : 'Request rejected.',
        { variant: result.status === 'APPROVED' ? 'success' : 'info' },
      );
      onResult(result.temporaryPassword);
    },
    onError: (err: any) => {
      enqueueSnackbar(err?.response?.data?.message ?? 'Action failed.', { variant: 'error' });
    },
  });

  const submit = () => {
    if (!action || !note.trim()) return;
    mutation.mutate({ action, note: note.trim() });
  };

  return (
    <ResponsiveDialog open onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2.5 } }}>
      <DialogTitle sx={{ fontWeight: 700, color: '#0D2744', pt: 2.5 }}>
        Review Reset Request
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Details */}
          <Paper variant="outlined" sx={{ borderRadius: 1.5, p: 2, bgcolor: '#F8FAFC' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, fontSize: '0.8125rem' }}>
              {[
                ['Username', request.username],
                ['Type', TYPE_LABEL[request.requestType] ?? request.requestType],
                ['Requested At', formatDate(request.requestedAt)],
                ['IP Address', request.requestedByIp || '—'],
                ['Expires At', formatDate(request.expiresAt)],
                ['Attempts (today)', String(request.attemptCount)],
                ['Reason', request.reason || '—'],
              ].map(([label, value]) => (
                <Box key={label}>
                  <Typography sx={{ fontSize: '0.72rem', color: '#94A3B8', mb: 0.25, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</Typography>
                  <Typography sx={{ fontSize: '0.8125rem', color: '#1E293B', fontWeight: 500 }}>{value}</Typography>
                </Box>
              ))}
            </Box>
          </Paper>

          {/* Action chooser */}
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button
              variant={action === 'APPROVE' ? 'contained' : 'outlined'}
              startIcon={<CheckCircleOutlineIcon />}
              onClick={() => setAction('APPROVE')}
              sx={{
                flex: 1, borderRadius: 1.5, textTransform: 'none', fontWeight: 600,
                ...(action === 'APPROVE'
                  ? { bgcolor: '#16A34A', '&:hover': { bgcolor: '#15803D' }, border: 'none' }
                  : { borderColor: '#CBD5E1', color: '#334155', '&:hover': { borderColor: '#16A34A', color: '#16A34A', bgcolor: alpha('#16A34A', 0.04) } }),
              }}
            >
              Approve
            </Button>
            <Button
              variant={action === 'REJECT' ? 'contained' : 'outlined'}
              startIcon={<CancelOutlinedIcon />}
              onClick={() => setAction('REJECT')}
              sx={{
                flex: 1, borderRadius: 1.5, textTransform: 'none', fontWeight: 600,
                ...(action === 'REJECT'
                  ? { bgcolor: '#DC2626', '&:hover': { bgcolor: '#B91C1C' }, border: 'none' }
                  : { borderColor: '#CBD5E1', color: '#334155', '&:hover': { borderColor: '#DC2626', color: '#DC2626', bgcolor: alpha('#DC2626', 0.04) } }),
              }}
            >
              Reject
            </Button>
          </Box>

          {/* Note — required for both actions */}
          {action && (
            <TextField
              label={action === 'APPROVE' ? 'Approval note (required)' : 'Rejection reason (required)'}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              fullWidth
              multiline
              rows={3}
              autoFocus
              placeholder={
                action === 'APPROVE'
                  ? 'e.g. Identity verified by HR. Approved per IT ticket #234.'
                  : 'e.g. Could not verify identity. User should contact IT helpdesk.'
              }
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 1.5,
                  '& fieldset': { borderColor: '#CBD5E1' },
                  '&.Mui-focused fieldset': { borderColor: '#0D3B72', borderWidth: 1.5 },
                },
                '& .MuiInputLabel-root.Mui-focused': { color: '#0D3B72' },
              }}
            />
          )}

          {action === 'APPROVE' && (
            <Alert severity="info" sx={{ borderRadius: 1.5, fontSize: '0.8125rem' }}>
              On approval, a secure temporary password will be generated. It will be displayed <strong>once</strong> and must be communicated to the user securely. The user will be required to change it on first login.
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 2.5, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} sx={{ color: '#64748B', borderRadius: 1.5, textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          disabled={!action || !note.trim() || mutation.isPending}
          variant="contained"
          startIcon={mutation.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
          sx={{
            bgcolor: action === 'REJECT' ? '#DC2626' : '#0D3B72',
            borderRadius: 1.5, textTransform: 'none', fontWeight: 600, px: 3,
            '&:hover': { bgcolor: action === 'REJECT' ? '#B91C1C' : '#0A2F5C' },
            '&.Mui-disabled': { bgcolor: '#94A3B8', color: '#fff' },
          }}
        >
          {mutation.isPending ? 'Processing…' : action === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PasswordResetRequestsPage() {
  const user = useAuthStore((s) => s.user);
  const { enqueueSnackbar } = useSnackbar();
  const [reviewing, setReviewing]   = useState<PasswordResetRequestItem | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const { data: requests, isLoading, refetch } = useQuery({
    queryKey: ['password-reset-requests'],
    queryFn: () => authApi.listPasswordResetRequests(),
    refetchInterval: 30_000,
  });

  const handleReviewResult = useCallback((password?: string) => {
    setReviewing(null);
    if (password) {
      setTempPassword(password);
    }
  }, []);

  if (!user?.roles?.some((r: any) => r.name === 'SUPER_ADMIN')) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">You do not have permission to view this page.</Alert>
      </Box>
    );
  }

  const pendingCount = requests?.filter((r) => r.status === 'REQUESTED').length ?? 0;

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <PasswordIcon sx={{ color: '#0D3B72', fontSize: 28 }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#0D2744', lineHeight: 1.2 }}>
              Password Reset Requests
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748B' }}>
              Review and approve password reset requests from users
            </Typography>
          </Box>
          {pendingCount > 0 && (
            <Chip
              label={`${pendingCount} pending`}
              color="warning"
              size="small"
              sx={{ fontWeight: 600, ml: 1 }}
            />
          )}
        </Box>
        <Button
          startIcon={<RefreshIcon />}
          onClick={() => refetch()}
          variant="outlined"
          size="small"
          sx={{ borderRadius: 1.5, textTransform: 'none', borderColor: '#CBD5E1', color: '#475569' }}
        >
          Refresh
        </Button>
      </Box>

      {/* Table */}
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                {['Username', 'Type', 'Status', 'Requested At', 'Expires In', 'Reason', 'Action'].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 600, fontSize: '0.78rem', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', py: 1.5 }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <TableCell key={j}><Skeleton height={24} /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : requests?.length === 0
                ? (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ textAlign: 'center', py: 6, color: '#94A3B8' }}>
                        No password reset requests found.
                      </TableCell>
                    </TableRow>
                  )
                : requests?.map((req) => (
                    <TableRow
                      key={req.id}
                      hover
                      sx={{
                        bgcolor: req.status === 'REQUESTED' && isExpiringSoon(req.expiresAt)
                          ? alpha('#F59E0B', 0.06)
                          : 'inherit',
                      }}
                    >
                      <TableCell sx={{ fontWeight: 600, color: '#1E293B' }}>{req.username}</TableCell>
                      <TableCell>
                        <Chip label={TYPE_LABEL[req.requestType]} size="small" variant="outlined" sx={{ fontSize: '0.72rem' }} />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={req.status}
                          size="small"
                          color={STATUS_COLORS[req.status] ?? 'default'}
                          sx={{ fontSize: '0.72rem', fontWeight: 600 }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem', color: '#475569' }}>{formatDate(req.requestedAt)}</TableCell>
                      <TableCell>
                        {req.status === 'REQUESTED' ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {isExpiringSoon(req.expiresAt)
                              ? <WarningAmberIcon sx={{ fontSize: 14, color: '#F59E0B' }} />
                              : <AccessTimeIcon sx={{ fontSize: 14, color: '#94A3B8' }} />}
                            <Typography sx={{ fontSize: '0.8rem', color: isExpiringSoon(req.expiresAt) ? '#92400E' : '#64748B' }}>
                              {timeRemaining(req.expiresAt)}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography sx={{ fontSize: '0.8rem', color: '#94A3B8' }}>—</Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem', color: '#475569', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Tooltip title={req.reason ?? ''}>
                          <span>{req.reason ?? '—'}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {req.status === 'REQUESTED' ? (
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => setReviewing(req)}
                            sx={{
                              bgcolor: '#0D3B72', borderRadius: 1.5, textTransform: 'none',
                              fontWeight: 600, fontSize: '0.75rem', px: 2,
                              '&:hover': { bgcolor: '#0A2F5C' },
                            }}
                          >
                            Review
                          </Button>
                        ) : (
                          <Tooltip title={req.approvalNote ?? req.rejectionReason ?? ''}>
                            <Typography sx={{ fontSize: '0.75rem', color: '#94A3B8', fontStyle: 'italic' }}>
                              {req.reviewedAt ? `Reviewed ${formatDate(req.reviewedAt)}` : '—'}
                            </Typography>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Review Dialog */}
      {reviewing && (
        <ReviewDialog
          request={reviewing}
          onClose={() => setReviewing(null)}
          onResult={handleReviewResult}
        />
      )}

      {/* One-time password reveal */}
      {tempPassword && (
        <TempPasswordReveal
          password={tempPassword}
          onClose={() => setTempPassword(null)}
        />
      )}
    </Box>
  );
}
