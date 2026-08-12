'use client';

import React, { useState } from 'react';
import { Box, Button, Alert } from '@mui/material';
import { useRouter } from 'next/navigation';
import AddIcon from '@mui/icons-material/Add';
import BackupIcon from '@mui/icons-material/Backup';
import PageHeader from '../../../../components/PageHeader';
import { BackupTable } from '../../../../components/backup/BackupTable';
import { BackupWizardDialog } from '../../../../components/backup/BackupWizardDialog';
import { BackupDetailsDialog } from '../../../../components/backup/BackupDetailsDialog';
import { BackupJob } from '../../../../types/backup.types';
import { useAuthStore } from '../../../../lib/store/auth.store';
import { BACKUP_PERMISSIONS } from '../../../../lib/constants/backup-permissions';
import { BACKUP_ROUTES } from '../../../../lib/constants/backup-routes';

export default function BackupHistoryPage() {
  const router = useRouter();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission(BACKUP_PERMISSIONS.CREATE);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  if (!hasPermission(BACKUP_PERMISSIONS.READ)) {
    return <Alert severity="warning" sx={{ m: 3 }}>You don't have permission to view backups.</Alert>;
  }

  return (
    <Box>
      <PageHeader
        title="Backup History"
        subtitle="All manual and scheduled backup runs"
        icon={<BackupIcon />}
        actions={canCreate && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setWizardOpen(true)}>
            Create Backup
          </Button>
        )}
      />

      <BackupTable
        onViewDetails={(job: BackupJob) => setDetailsId(job.id)}
        onRestore={(job: BackupJob) => router.push(`${BACKUP_ROUTES.RESTORE}?backupId=${job.id}`)}
      />

      <BackupWizardDialog open={wizardOpen} onClose={() => setWizardOpen(false)} />
      <BackupDetailsDialog jobId={detailsId} onClose={() => setDetailsId(null)} />
    </Box>
  );
}
