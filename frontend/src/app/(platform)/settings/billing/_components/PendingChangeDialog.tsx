'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha, useTheme } from '@mui/material/styles';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import RemoveCircleOutlineRoundedIcon from '@mui/icons-material/RemoveCircleOutlineRounded';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import type { ModuleCatalogEntry } from '@/lib/api/billing.api';

export interface PendingChangeDialogProps {
  open: boolean;
  module: ModuleCatalogEntry | null;
  onClose: () => void;
  onUndo: () => void;
  loading: boolean;
}

const dateLabel = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** Opens for PENDING_ADD/PENDING_REMOVAL module cards. The only action is Undo (DELETE /billing/subscription/changes/:id) -- nothing here charges or activates anything. */
export default function PendingChangeDialog({ open, module, onClose, onUndo, loading }: PendingChangeDialogProps) {
  const theme = useTheme();
  if (!module) return null;

  const isAdd = module.licenseState === 'PENDING_ADD';
  const color = isAdd ? theme.palette.info : theme.palette.warning;

  return (
    <ResponsiveDialog open={open} onClose={loading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>{module.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} alignItems="center" textAlign="center" sx={{ py: 1 }}>
          <Box
            sx={{
              width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: alpha(color.main, 0.12), color: color.dark,
            }}
          >
            {isAdd ? <ScheduleRoundedIcon sx={{ fontSize: 28 }} /> : <RemoveCircleOutlineRoundedIcon sx={{ fontSize: 28 }} />}
          </Box>
          <Typography variant="subtitle1" fontWeight={800}>
            {isAdd ? 'Scheduled to be added' : 'Scheduled for removal'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isAdd
              ? `${module.name} will start on ${dateLabel(module.pendingEffectiveDate)}, your next renewal date. No payment is due today -- it will be billed as part of that renewal.`
              : `${module.name} will remain active until ${dateLabel(module.pendingEffectiveDate)}, then be removed from your subscription.`}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Stack direction="row" spacing={1.5} sx={{ width: '100%' }}>
          <Button fullWidth variant="outlined" onClick={onClose} disabled={loading}>Close</Button>
          <Button
            fullWidth
            variant="contained"
            color="inherit"
            onClick={onUndo}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ fontWeight: 700 }}
          >
            Undo
          </Button>
        </Stack>
      </DialogActions>
    </ResponsiveDialog>
  );
}
