'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { alpha, useTheme } from '@mui/material/styles';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RemoveCircleOutlineRoundedIcon from '@mui/icons-material/RemoveCircleOutlineRounded';
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import type { ModuleCatalogEntry, BillingCycle } from '@/lib/api/billing.api';

export interface ModuleManagementDialogProps {
  open: boolean;
  module: ModuleCatalogEntry | null;
  billingCycle: BillingCycle;
  renewalDateLabel: string | null;
  onClose: () => void;
  onScheduleRemoval: () => void;
  loading: boolean;
  /** Queues "buy N more months" for this module into the main cart (subscribe page's checkout sidebar) instead of purchasing inline here -- reuses the exact same quote/checkout/Razorpay pipeline as any other purchase. */
  onAddMonthsToCart: (code: string, months: number) => void;
  /** True once this module is already sitting in the cart as a pending extension -- disables the button so it can't be queued twice. */
  alreadyInCart: boolean;
}

const dateLabel = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/**
 * Opens when a LICENSED module card is clicked. Two mutating actions live
 * here: "Schedule Removal" (POST /billing/subscription/changes, deferred
 * to the next renewal, unchanged) and "Buy More Months" (per-module
 * prepayment -- queues an extension into the main checkout cart rather
 * than charging inline, so it goes through the exact same quote/checkout/
 * Razorpay flow as any other purchase).
 */
export default function ModuleManagementDialog({
  open, module, billingCycle, renewalDateLabel, onClose, onScheduleRemoval, loading, onAddMonthsToCart, alreadyInCart,
}: ModuleManagementDialogProps) {
  const theme = useTheme();
  const [months, setMonths] = useState(1);

  useEffect(() => {
    if (module) setMonths(1);
  }, [module?.code]);

  if (!module) return null;
  const unit = billingCycle === 'MONTHLY' ? 'month' : 'year';

  return (
    <ResponsiveDialog open={open} onClose={loading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>{module.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="text.secondary">Status</Typography>
            <Chip
              size="small"
              icon={<CheckCircleRoundedIcon sx={{ fontSize: 14 }} />}
              label="Licensed"
              sx={{ fontWeight: 700, bgcolor: alpha(theme.palette.success.main, 0.12), color: theme.palette.success.dark }}
            />
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="text.secondary">Billing Cycle</Typography>
            <Typography variant="body2" fontWeight={700}>{billingCycle === 'MONTHLY' ? 'Monthly' : 'Yearly'}</Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="text.secondary">Licensed Until</Typography>
            <Typography variant="body2" fontWeight={700}>{dateLabel(module.licensedUntil)}</Typography>
          </Stack>

          <Divider />

          <Typography variant="caption" fontWeight={700} color="text.secondary" letterSpacing={0.5}>BUY MORE MONTHS</Typography>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Duration</Typography>
            <Stack direction="row" alignItems="center" sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
              <IconButton size="small" onClick={() => setMonths((m) => Math.max(1, m - 1))} disabled={months <= 1} aria-label="Decrease duration" sx={{ p: 0.5 }}>
                <RemoveRoundedIcon sx={{ fontSize: 14 }} />
              </IconButton>
              <Typography variant="body2" fontWeight={700} sx={{ minWidth: 64, textAlign: 'center' }}>
                {months} {unit}{months === 1 ? '' : 's'}
              </Typography>
              <IconButton size="small" onClick={() => setMonths((m) => Math.min(24, m + 1))} disabled={months >= 24} aria-label="Increase duration" sx={{ p: 0.5 }}>
                <AddRoundedIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Stack>
          </Stack>
          <Button
            fullWidth
            variant="contained"
            startIcon={<AddShoppingCartRoundedIcon />}
            onClick={() => onAddMonthsToCart(module.code, months)}
            disabled={alreadyInCart}
            sx={{ borderRadius: 2.5, fontWeight: 700 }}
          >
            {alreadyInCart ? 'Already in Cart' : 'Add to Cart'}
          </Button>
          <Typography variant="caption" color="text.secondary">
            Extends {module.name}'s license by {months} {unit}{months === 1 ? '' : 's'} from {module.licensedUntil ? 'its current expiry' : 'today'}. Charged in full at checkout -- no proration.
          </Typography>

          <Divider />

          <Typography variant="caption" fontWeight={700} color="text.secondary" letterSpacing={0.5}>ACTIONS</Typography>
          <Stack spacing={1}>
            <Button
              fullWidth
              variant="outlined"
              color="warning"
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RemoveCircleOutlineRoundedIcon />}
              onClick={onScheduleRemoval}
              disabled={loading}
              sx={{ justifyContent: 'flex-start', borderRadius: 2.5, fontWeight: 700 }}
            >
              Schedule Removal
            </Button>
            <Tooltip title="Coming soon">
              <span>
                <Button
                  fullWidth
                  variant="outlined"
                  disabled
                  startIcon={<BarChartRoundedIcon />}
                  sx={{ justifyContent: 'flex-start', borderRadius: 2.5, fontWeight: 700 }}
                >
                  View Usage
                </Button>
              </span>
            </Tooltip>
          </Stack>

          {renewalDateLabel && (
            <Typography variant="caption" color="text.secondary">
              Scheduling removal keeps {module.name} active until {renewalDateLabel} -- it won't be renewed after that.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button fullWidth variant="text" onClick={onClose} disabled={loading}>Close</Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}
