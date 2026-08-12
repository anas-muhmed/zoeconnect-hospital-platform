'use client';

import { useState } from 'react';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha, useTheme } from '@mui/material/styles';
import ResponsiveDialog from '@/components/ResponsiveDialog';

export interface CancelSubscriptionDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (atPeriodEnd: boolean) => void;
  loading: boolean;
  currentPeriodEndLabel: string | null;
}

export default function CancelSubscriptionDialog({ open, onClose, onConfirm, loading, currentPeriodEndLabel }: CancelSubscriptionDialogProps) {
  const theme = useTheme();
  const [atPeriodEnd, setAtPeriodEnd] = useState(true);

  return (
    <ResponsiveDialog open={open} onClose={loading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Cancel Subscription</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          You can keep access until the end of your current billing period, or cancel right away.
        </Typography>
        <RadioGroup value={atPeriodEnd ? 'period_end' : 'now'} onChange={(e) => setAtPeriodEnd(e.target.value === 'period_end')}>
          <Box sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${theme.palette.divider}`, mb: 1 }}>
            <FormControlLabel
              value="period_end"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body2" fontWeight={700}>Cancel at period end</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {currentPeriodEndLabel ? `Keep full access until ${currentPeriodEndLabel}.` : 'Keep access until your current period ends.'}
                  </Typography>
                </Box>
              }
            />
          </Box>
          <Box sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${alpha(theme.palette.error.main, 0.3)}`, bgcolor: alpha(theme.palette.error.main, 0.03) }}>
            <FormControlLabel
              value="now"
              control={<Radio color="error" />}
              label={
                <Box>
                  <Typography variant="body2" fontWeight={700} color="error.main">Cancel immediately</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Access to your workspace modules ends right away.
                  </Typography>
                </Box>
              }
            />
          </Box>
        </RadioGroup>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Stack direction="row" spacing={1.5} sx={{ width: '100%' }}>
          <Button fullWidth variant="outlined" onClick={onClose} disabled={loading}>
            Keep Subscription
          </Button>
          <Button
            fullWidth
            variant="contained"
            color="error"
            onClick={() => onConfirm(atPeriodEnd)}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Confirm Cancel
          </Button>
        </Stack>
      </DialogActions>
    </ResponsiveDialog>
  );
}
