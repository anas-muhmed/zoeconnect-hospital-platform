'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useRouter } from 'next/navigation';
import EmptyState from './EmptyState';
import { useAuthStore } from '@/lib/store/auth.store';

interface ModuleNotLicensedProps {
  /** Human-readable module name, e.g. "Incident Management" */
  moduleLabel: string;
  /**
   * 'not-licensed' — this specific module isn't in the tenant's license (403).
   * 'expired'      — the platform license itself is expired/invalid (503),
   *                   which blocks every license-gated module, not just this one.
   */
  reason?: 'not-licensed' | 'expired';
}

/**
 * Shown in place of a module's page content when the tenant's license
 * doesn't cover that module (or has expired), instead of letting the API's
 * 403/503 surface as a raw error. Mirrors the message the backend's
 * LicenseGuard already throws (license.guard.ts), just presented as a
 * proper panel rather than a failed network call.
 */
export default function ModuleNotLicensed({ moduleLabel, reason = 'not-licensed' }: ModuleNotLicensedProps) {
  const router = useRouter();
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('PLATFORM:SETTINGS:READ');

  const title = reason === 'expired' ? 'License Expired' : 'Module Not Licensed';
  const description = reason === 'expired'
    ? 'Your platform license has expired or is invalid. Contact your system administrator to renew it.'
    : `${moduleLabel} is not included in your current license. Contact your system administrator to request access.`;

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
      <Box sx={{ maxWidth: 480, width: '100%' }}>
        <EmptyState
          icon={<LockOutlinedIcon sx={{ fontSize: 32 }} />}
          title={title}
          description={description}
          action={canManage ? (
            <Button variant="contained" onClick={() => router.push('/settings/license')}>
              Manage License
            </Button>
          ) : undefined}
        />
      </Box>
    </Box>
  );
}
