'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

import { authApi } from '@/lib/api/auth.api';
import { useAuthStore } from '@/lib/store/auth.store';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z
      .string()
      .min(8)
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, 'Need uppercase, lowercase, number, special char'),
    confirmPassword: z.string().min(1, 'Required'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type Form = z.infer<typeof schema>;

export default function ChangePasswordPage() {
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuthStore();
  const [showFields, setShowFields] = useState({ current: false, new: false, confirm: false });

  const toggle = (field: keyof typeof showFields) =>
    setShowFields((s) => ({ ...s, [field]: !s[field] }));

  const { control, handleSubmit } = useForm<Form>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (data: Form) =>
      authApi.changePassword({ currentPassword: data.currentPassword, newPassword: data.newPassword }),
    onSuccess: () => {
      enqueueSnackbar('Password changed successfully', { variant: 'success' });
      router.push('/dashboard');
    },
    onError: (err: any) => {
      enqueueSnackbar(err?.response?.data?.message ?? 'Failed to change password', { variant: 'error' });
    },
  });

  return (
    <Box
      sx={{
        minHeight: '100dvh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        bgcolor: 'grey.50',
      }}
    >
      <Card elevation={0} sx={{ width: 400, border: 1, borderColor: 'divider' }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h6" fontWeight={700} mb={0.5}>
            Change Password
          </Typography>
          {user?.mustChangePassword && (
            <Typography variant="body2" color="warning.main" mb={2}>
              You must change your password before continuing.
            </Typography>
          )}

          <Box
            component="form"
            onSubmit={handleSubmit((d) => mutation.mutate(d))}
            sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 2 }}
          >
            <Controller
              name="currentPassword"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Current Password"
                  type={showFields.current ? 'text' : 'password'}
                  size="small"
                  fullWidth
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => toggle('current')}>
                          {showFields.current ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              )}
            />

            <Controller
              name="newPassword"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="New Password"
                  type={showFields.new ? 'text' : 'password'}
                  size="small"
                  fullWidth
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message ?? 'Min 8 chars, upper/lower/number/special'}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => toggle('new')}>
                          {showFields.new ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              )}
            />

            <Controller
              name="confirmPassword"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="Confirm New Password"
                  type={showFields.confirm ? 'text' : 'password'}
                  size="small"
                  fullWidth
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => toggle('confirm')}>
                          {showFields.confirm ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              )}
            />

            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={mutation.isPending}
              startIcon={mutation.isPending ? <CircularProgress size={16} /> : undefined}
            >
              Update Password
            </Button>

            {!user?.mustChangePassword && (
              <Button variant="text" onClick={() => router.back()}>
                Cancel
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
