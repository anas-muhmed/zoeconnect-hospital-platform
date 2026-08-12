'use client';

import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { licenseApi, ALL_MODULES } from '@/lib/api/license.api';
import { useAuthStore } from '@/lib/store/auth.store';

const MODULE_LABEL: Record<string, string> = Object.fromEntries(
  ALL_MODULES.map(m => [m.code, m.label])
);

const WARN_DAYS = 30;

/**
 * Top-of-page banner showing:
 *  - Expired: single error banner
 *  - Trial: warning with days remaining
 *  - Per-module expiry: one entry per module expiring within WARN_DAYS
 *    (e.g. "Patient Loyalty expires in 3 days  |  EIC expires in 8 days")
 */
export default function LicenseBanner() {
  const router = useRouter();
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('PLATFORM:SETTINGS:READ');

  const { data: status } = useQuery({
    queryKey: ['license-status'],
    queryFn: licenseApi.getStatus,
    refetchInterval: 5 * 60_000,
  });

  if (!status) return null;

  // Collect modules expiring within WARN_DAYS
  const now = Date.now();
  const expiringModules: Array<{ label: string; days: number }> = [];

  if (status.moduleExpiries) {
    for (const [code, expiryStr] of Object.entries(status.moduleExpiries)) {
      if (!expiryStr) continue; // perpetual — no warning
      const days = Math.ceil((new Date(expiryStr).getTime() - now) / 86_400_000);
      if (days <= WARN_DAYS) {
        expiringModules.push({ label: MODULE_LABEL[code] ?? code, days });
      }
    }
    expiringModules.sort((a, b) => a.days - b.days);
  }

  const isExpired  = !status.isValid;
  const hasWarning = expiringModules.length > 0 || status.isTrial;

  if (!isExpired && !hasWarning) return null;

  const manageButton = canManage ? (
    <Button size="small" color="inherit" onClick={() => router.push('/settings/license')}>
      Manage License
    </Button>
  ) : undefined;

  if (isExpired) {
    return (
      <Alert severity="error" sx={{ borderRadius: 0, py: 0.5 }} action={manageButton}>
        Platform license has expired. Features are restricted.
      </Alert>
    );
  }

  if (status.isTrial) {
    // ZoeConnect Identity Architecture Migration -- real incident
    // (2026-07-30): the license-status endpoint used to always resolve to
    // the seeded 'default' tenant's own trial (see license.controller.ts's
    // getStatus() doc comment for the full root cause), so hospitalName was
    // never worth showing here. Now that the endpoint is tenant-aware, show
    // it alongside the existing countdown when the backend actually has one
    // (self-hosted's own boot-time trial still reports the generic 'Trial
    // Installation' placeholder -- deliberately not shown as if it were a
    // real hospital name).
    const showHospitalName = status.hospitalName && status.hospitalName !== 'Trial Installation';
    return (
      <Alert severity="warning" sx={{ borderRadius: 0, py: 0.5 }} action={manageButton}>
        {showHospitalName ? `${status.hospitalName} — ` : ''}Trial license, {status.daysRemaining} day(s) remaining.
      </Alert>
    );
  }

  return (
    <Alert severity="warning" sx={{ borderRadius: 0, py: 0.5 }} action={manageButton}>
      <Stack direction="row" flexWrap="wrap" gap={2} alignItems="center">
        {expiringModules.map(({ label, days }) => (
          <Typography key={label} variant="body2" component="span">
            <b>{label}</b> expires in {days} day{days !== 1 ? 's' : ''}
          </Typography>
        ))}
      </Stack>
    </Alert>
  );
}
