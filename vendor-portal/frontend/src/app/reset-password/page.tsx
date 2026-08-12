'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import LockResetIcon from '@mui/icons-material/LockReset';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { vendorApi } from '@/lib/api/vendor.api';

function ResetPasswordForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword]     = useState('');
  const [confirmPassword, setConfirm]     = useState('');
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [done, setDone]                   = useState(false);

  useEffect(() => {
    if (!token) setError('No reset token found in the URL. Please request a new reset link.');
  }, [token]);

  const passwordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const isValid = token && newPassword.length >= 8 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setLoading(true);
    setError('');
    try {
      await vendorApi.resetPassword(token, newPassword);
      setDone(true);
      setTimeout(() => router.replace('/login'), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Reset failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      bgcolor: 'background.default',
    }}>
      <Card elevation={0} sx={{ width: 440, border: 1, borderColor: 'divider' }}>
        <CardContent sx={{ p: 4 }}>

          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
            <Box sx={{
              width: 48, height: 48,
              bgcolor: done ? 'success.main' : 'primary.main',
              borderRadius: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2,
              transition: 'background-color 0.3s',
            }}>
              {done
                ? <CheckCircleIcon sx={{ color: 'white' }} />
                : <LockResetIcon sx={{ color: 'white' }} />
              }
            </Box>
            <Typography variant="h5" fontWeight={700}>
              {done ? 'Password Updated' : 'Set New Password'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 0.5 }}>
              {done
                ? 'Redirecting you to sign in...'
                : 'Choose a new password for your vendor portal account.'}
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {done ? (
            <Alert severity="success">
              Password changed successfully. Redirecting to login in 3 seconds...
            </Alert>
          ) : (
            <form onSubmit={handleSubmit}>
              <TextField
                label="New password" type="password" fullWidth size="small" sx={{ mb: 2 }}
                value={newPassword} onChange={e => setNewPassword(e.target.value)}
                autoFocus disabled={!token}
                helperText="Minimum 8 characters"
                error={newPassword.length > 0 && newPassword.length < 8}
              />
              <TextField
                label="Confirm new password" type="password" fullWidth size="small" sx={{ mb: 3 }}
                value={confirmPassword} onChange={e => setConfirm(e.target.value)}
                disabled={!token}
                error={passwordMismatch}
                helperText={passwordMismatch ? 'Passwords do not match' : ''}
              />
              <Button
                type="submit" variant="contained" fullWidth size="large"
                disabled={!isValid || loading}
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                {loading ? 'Updating...' : 'Set New Password'}
              </Button>
            </form>
          )}

          {!done && (
            <Box sx={{ mt: 2.5, textAlign: 'center' }}>
              <Link href="/login" style={{ fontSize: 13, color: 'inherit', opacity: 0.6 }}>
                Back to sign in
              </Link>
            </Box>
          )}

        </CardContent>
      </Card>
    </Box>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
