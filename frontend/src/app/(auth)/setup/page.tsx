'use client';

import {
  Box, Card, CardContent, TextField, Button,
  Typography, Alert, CircularProgress, InputAdornment, IconButton, Stepper, Step, StepLabel,
} from '@mui/material';
import { Visibility, VisibilityOff, AdminPanelSettings, CheckCircle } from '@mui/icons-material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api/auth.api';

const setupSchema = z.object({
  username:  z.string().min(3,  'Username must be at least 3 characters'),
  email:     z.string().email('Enter a valid email address'),
  fullName:  z.string().optional(),
  password:  z.string().min(8,  'Password must be at least 8 characters'),
  confirm:   z.string(),
}).refine(d => d.password === d.confirm, {
  message: 'Passwords do not match',
  path:    ['confirm'],
});
type SetupForm = z.infer<typeof setupSchema>;

export default function SetupPage() {
  const router = useRouter();
  const [showPassword, setShowPassword]   = useState(false);
  const [showConfirm,  setShowConfirm]    = useState(false);
  const [error,        setError]          = useState<string | null>(null);
  const [done,         setDone]           = useState(false);
  const [countdown,    setCountdown]      = useState(5);

  // Guard: redirect to login if setup is no longer required
  useEffect(() => {
    authApi.setupRequired().then(({ required }) => {
      if (!required) router.replace('/login');
    }).catch(() => {});
  }, [router]);

  // Countdown after successful setup
  useEffect(() => {
    if (!done) return;
    if (countdown <= 0) { router.replace('/login'); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [done, countdown, router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetupForm>({ resolver: zodResolver(setupSchema) });

  const onSubmit = async (data: SetupForm) => {
    setError(null);
    try {
      await authApi.setupSuperAdmin({
        username: data.username.trim(),
        email:    data.email.trim(),
        fullName: data.fullName?.trim() || undefined,
        password: data.password,
      });
      setDone(true);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        'Setup failed. The super admin account may already exist.';
      setError(Array.isArray(msg) ? msg.join(' ') : msg);
    }
  };

  return (
    <Box sx={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1B3A6B 0%, #2E5FA3 100%)',
      p: 2,
    }}>
      <Card sx={{ maxWidth: 460, width: '100%', borderRadius: 3 }}>
        <CardContent sx={{ p: 4 }}>

          {/* Header */}
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <AdminPanelSettings sx={{ fontSize: 48, color: 'warning.main', mb: 1 }} />
            <Typography variant="h5" fontWeight={700} color="primary.dark">
              First-Time Setup
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Create the Super Admin account for ZoeConnect
            </Typography>
          </Box>

          <Stepper activeStep={done ? 1 : 0} sx={{ mb: 3 }}>
            <Step><StepLabel>Create Super Admin</StepLabel></Step>
            <Step><StepLabel>Done</StepLabel></Step>
          </Stepper>

          {/* Success state */}
          {done ? (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
              <Typography variant="h6" fontWeight={700} gutterBottom>
                Super Admin Created!
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 3 }}>
                Your administrator account is ready. Redirecting to login in {countdown}s…
              </Typography>
              <Button component={Link} href="/login" variant="contained" size="large" fullWidth>
                Go to Login Now
              </Button>
            </Box>
          ) : (
            <>
              <Alert severity="warning" sx={{ mb: 2.5, fontSize: 13 }}>
                This page is only accessible when no super admin exists. It will be disabled after setup.
              </Alert>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}

              <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
                <TextField
                  {...register('username')}
                  label="Username"
                  fullWidth
                  autoFocus
                  autoComplete="username"
                  error={!!errors.username}
                  helperText={errors.username?.message}
                  sx={{ mb: 2 }}
                />

                <TextField
                  {...register('email')}
                  label="Email"
                  type="email"
                  fullWidth
                  autoComplete="email"
                  error={!!errors.email}
                  helperText={errors.email?.message}
                  sx={{ mb: 2 }}
                />

                <TextField
                  {...register('fullName')}
                  label="Full name (optional)"
                  fullWidth
                  sx={{ mb: 2 }}
                />

                <TextField
                  {...register('password')}
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  fullWidth
                  autoComplete="new-password"
                  error={!!errors.password}
                  helperText={errors.password?.message ?? 'Min 8 characters'}
                  sx={{ mb: 2 }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword(s => !s)} edge="end">
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />

                <TextField
                  {...register('confirm')}
                  label="Confirm password"
                  type={showConfirm ? 'text' : 'password'}
                  fullWidth
                  autoComplete="new-password"
                  error={!!errors.confirm}
                  helperText={errors.confirm?.message}
                  sx={{ mb: 3 }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowConfirm(s => !s)} edge="end">
                          {showConfirm ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  color="warning"
                  size="large"
                  disabled={isSubmitting}
                  sx={{ py: 1.5, fontSize: '1rem', fontWeight: 700 }}
                >
                  {isSubmitting
                    ? <CircularProgress size={24} color="inherit" />
                    : 'Create Super Admin'}
                </Button>
              </Box>

              <Box sx={{ textAlign: 'center', mt: 2 }}>
                <Button component={Link} href="/login" size="small" color="inherit">
                  ← Back to Login
                </Button>
              </Box>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
