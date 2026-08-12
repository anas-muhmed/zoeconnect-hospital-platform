'use client';

import React, { useState } from 'react';
import { Box, Alert } from '@mui/material';
import { useRouter } from 'next/navigation';
import BackupIcon from '@mui/icons-material/Backup';
import PageHeader from '../../../../components/PageHeader';
import { BackupWizardDialog } from '../../../../components/backup/BackupWizardDialog';
import { useAuthStore } from '../../../../lib/store/auth.store';
import { BACKUP_PERMISSIONS } from '../../../../lib/constants/backup-permissions';
import { BACKUP_ROUTES } from '../../../../lib/constants/backup-routes';

/**
 * Dedicated route for the backup creation wizard (spec calls for `/backup/wizard`
 * as an addressable route in addition to being launchable as a modal from the
 * Backups page "Create Backup" button — this page reuses the same dialog
 * component, opened immediately, and returns to the Backups list on
 * close/completion).
 */
export default function BackupWizardPage() {
  const router = useRouter();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [open, setOpen] = useState(true);

  const canCreate = hasPermission(BACKUP_PERMISSIONS.CREATE);

  const goToBackups = () => router.push(BACKUP_ROUTES.BACKUPS);

  if (!canCreate) {
    return <Alert severity="warning" sx={{ m: 3 }}>You don't have permission to create backups.</Alert>;
  }

  return (
    <Box>
      <PageHeader title="Create Backup" subtitle="Guided backup wizard" icon={<BackupIcon />} back={BACKUP_ROUTES.BACKUPS} />
      <BackupWizardDialog
        open={open}
        onClose={() => { setOpen(false); goToBackups(); }}
        onCreated={goToBackups}
      />
    </Box>
  );
}
