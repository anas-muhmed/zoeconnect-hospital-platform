import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import type { FieldAvailabilityStatus } from '@/lib/hooks/useFieldAvailability';
import type { AvailabilityReason } from '@/lib/validation/availability.types';

const REASON_LABEL: Record<AvailabilityReason, string> = {
  already_exists: 'Already in use',
  reserved: 'Not available',
  invalid_format: 'Invalid format',
};

/**
 * Reusable inline status line for a field wired up to `useFieldAvailability`
 * — "Checking…", "Available", or "Already in use" beneath a text field,
 * instead of a generic toast. Intended to be dropped under any field on any
 * form using the shared availability-check infrastructure, not just Users.
 */
export default function FieldAvailabilityHint({ status, reason, label }: {
  status?: FieldAvailabilityStatus;
  reason?: AvailabilityReason;
  /** Human label for the field, e.g. "Username", "Email" — used in the "available" message. */
  label: string;
}) {
  if (!status || status === 'idle' || status === 'invalid') return null;

  if (status === 'checking') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, ml: 1.5 }}>
        <CircularProgress size={12} />
        <Typography variant="caption" color="text.secondary">Checking availability…</Typography>
      </Box>
    );
  }

  if (status === 'available') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, ml: 1.5 }}>
        <CheckCircleIcon sx={{ fontSize: 14 }} color="success" />
        <Typography variant="caption" color="success.main">{label} is available</Typography>
      </Box>
    );
  }

  // status === 'taken'
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, ml: 1.5 }}>
      <ErrorIcon sx={{ fontSize: 14 }} color="error" />
      <Typography variant="caption" color="error.main">
        {reason ? REASON_LABEL[reason] : `${label} already in use`}
      </Typography>
    </Box>
  );
}
