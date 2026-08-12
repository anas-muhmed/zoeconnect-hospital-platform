'use client';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha, useTheme } from '@mui/material/styles';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import RemoveCircleOutlineRoundedIcon from '@mui/icons-material/RemoveCircleOutlineRounded';
import type { SubscriptionChange } from '@/lib/api/billing.api';

export interface PendingChangesListProps {
  changes: SubscriptionChange[];
  onCancelChange: (changeId: string) => void;
  cancellingId: string | null;
}

const dateLabel = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** "Pending Changes" section on My Subscription. Only ever shows PENDING rows -- APPLIED/CANCELLED history lives in Billing History, not here. */
export default function PendingChangesList({ changes, onCancelChange, cancellingId }: PendingChangesListProps) {
  const theme = useTheme();
  const pending = changes.filter((c) => c.status === 'PENDING');

  if (pending.length === 0) {
    return <Typography variant="body2" color="text.secondary">No changes scheduled.</Typography>;
  }

  return (
    <Stack spacing={1}>
      {pending.map((change) => {
        const isAdd = change.action === 'ADD';
        const color = isAdd ? theme.palette.info : theme.palette.warning;
        const isCancelling = cancellingId === change.id;
        return (
          <Stack
            key={change.id}
            direction={{ xs: 'column', sm: 'row' }}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            justifyContent="space-between"
            spacing={1}
            sx={{ py: 1.25, px: 1.5, borderRadius: 2, bgcolor: alpha(color.main, 0.04), border: `1px solid ${alpha(color.main, 0.2)}` }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Chip
                size="small"
                icon={isAdd ? <ScheduleRoundedIcon sx={{ fontSize: 14 }} /> : <RemoveCircleOutlineRoundedIcon sx={{ fontSize: 14 }} />}
                label={isAdd ? 'Will be added' : 'Will be removed'}
                sx={{ fontWeight: 700, height: 22, fontSize: 11, bgcolor: alpha(color.main, 0.14), color: color.dark }}
              />
              <Typography variant="body2" fontWeight={700}>{change.moduleName ?? change.moduleCode}</Typography>
            </Stack>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography variant="caption" color="text.secondary">{dateLabel(change.effectiveDate)}</Typography>
              <Button
                size="small"
                variant="text"
                onClick={() => onCancelChange(change.id)}
                disabled={isCancelling}
                startIcon={isCancelling ? <CircularProgress size={14} color="inherit" /> : undefined}
                sx={{ fontWeight: 700 }}
              >
                Cancel Change
              </Button>
            </Stack>
          </Stack>
        );
      })}
    </Stack>
  );
}
