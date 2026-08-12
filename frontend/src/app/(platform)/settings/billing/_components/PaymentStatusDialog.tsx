'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DialogContent from '@mui/material/DialogContent';
import { alpha, useTheme } from '@mui/material/styles';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import HourglassTopRoundedIcon from '@mui/icons-material/HourglassTopRounded';
import ResponsiveDialog from '@/components/ResponsiveDialog';

export type PaymentStage =
  | 'idle' | 'opening_checkout' | 'verifying' | 'activating' | 'pending' | 'success' | 'failed';

export interface PaymentStatusDialogProps {
  stage: PaymentStage;
  onClose: () => void;
  onRetry: () => void;
  onRefreshStatus: () => void;
  onEnter: () => void;
  errorMessage?: string | null;
}

const STAGE_COPY: Partial<Record<PaymentStage, string>> = {
  opening_checkout: 'Preparing secure checkout...',
  verifying: 'Verifying payment...',
  activating: 'Activating your workspace...',
};

export default function PaymentStatusDialog({ stage, onClose, onRetry, onRefreshStatus, onEnter, errorMessage }: PaymentStatusDialogProps) {
  const theme = useTheme();
  const open = stage !== 'idle';
  const isBusy = stage === 'opening_checkout' || stage === 'verifying' || stage === 'activating';

  return (
    <ResponsiveDialog
      open={open}
      onClose={isBusy ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="payment-status-heading"
    >
      <DialogContent sx={{ py: 6, textAlign: 'center' }} role="status" aria-live="polite">
        {isBusy && (
          <Stack spacing={3} alignItems="center">
            <CircularProgress size={48} thickness={3} />
            <Typography variant="h6" fontWeight={700}>{STAGE_COPY[stage]}</Typography>
          </Stack>
        )}

        {stage === 'pending' && (
          <Stack spacing={2.5} alignItems="center">
            <HourglassTopRoundedIcon sx={{ fontSize: 56, color: 'warning.main' }} />
            <Typography variant="h6" fontWeight={700}>Payment received</Typography>
            <Typography variant="body2" color="text.secondary">
              We're confirming your subscription. This usually takes only a moment.
            </Typography>
            <Button variant="outlined" onClick={onRefreshStatus}>Refresh status</Button>
          </Stack>
        )}

        {stage === 'success' && (
          <Stack spacing={2.5} alignItems="center">
            <Box
              sx={{
                width: 72, height: 72, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(135deg, ${theme.palette.success.main} 0%, ${theme.palette.primary.main} 100%)`,
              }}
            >
              <CheckCircleRoundedIcon sx={{ fontSize: 40, color: '#fff' }} />
            </Box>
            <Typography variant="h6" fontWeight={800}>Payment successful</Typography>
            <Typography variant="body2" color="text.secondary">
              Your ZoeConnect workspace is ready.
            </Typography>
            <Stack spacing={0.75} sx={{ width: '100%', textAlign: 'left', bgcolor: alpha(theme.palette.success.main, 0.06), borderRadius: 2, p: 2 }}>
              {['Subscription activated', 'Modules enabled', 'Billing configured'].map((t) => (
                <Stack key={t} direction="row" spacing={1} alignItems="center">
                  <CheckCircleRoundedIcon sx={{ fontSize: 16, color: 'success.main' }} />
                  <Typography variant="body2">{t}</Typography>
                </Stack>
              ))}
            </Stack>
            <Button fullWidth size="large" variant="contained" onClick={onEnter} sx={{ borderRadius: 2.5, fontWeight: 700 }}>
              Enter ZoeConnect
            </Button>
          </Stack>
        )}

        {stage === 'failed' && (
          <Stack spacing={2.5} alignItems="center">
            <ErrorRoundedIcon sx={{ fontSize: 56, color: 'error.main' }} />
            <Typography variant="h6" fontWeight={700}>Payment wasn't completed</Typography>
            <Typography variant="body2" color="text.secondary">
              {errorMessage || 'Your subscription has not been changed. Your account has not been charged or activated.'}
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ width: '100%' }}>
              <Button fullWidth variant="outlined" onClick={onClose}>Review Subscription</Button>
              <Button fullWidth variant="contained" onClick={onRetry}>Try Again</Button>
            </Stack>
          </Stack>
        )}
      </DialogContent>
    </ResponsiveDialog>
  );
}
