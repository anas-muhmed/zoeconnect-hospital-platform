'use client';

import React, { useState } from 'react';
import {
  Box, Alert, Button, Card, CardContent, Typography, Chip, Grid, CircularProgress,
  DialogTitle, DialogContent, DialogActions, TextField,
} from '@mui/material';
import ResponsiveDialog from '../../../../components/ResponsiveDialog';
import AddIcon from '@mui/icons-material/Add';
import StorageIcon from '@mui/icons-material/Storage';
import CloudIcon from '@mui/icons-material/Cloud';
import DnsIcon from '@mui/icons-material/Dns';
import PageHeader from '../../../../components/PageHeader';
import { useAuthStore } from '../../../../lib/store/auth.store';
import { BACKUP_PERMISSIONS } from '../../../../lib/constants/backup-permissions';
import { useBackupStorageDrivers, useCreateBackupStorageProvider } from '../../../../hooks/backup/use-backup-storage';
import { BackupStorageDriver, BackupStorageConfig } from '../../../../types/backup.types';

/** S3 is the only implemented remote driver today; its config fields are
 * collected inline. Non-implemented drivers show a disabled "Coming soon"
 * card per the backend's BackupStorageProviderFactory.listAvailableDrivers()
 * (azure/gcs/sftp/network_share are stub providers there). */
export default function BackupStoragePage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(BACKUP_PERMISSIONS.SETTINGS);

  const { data: drivers, isLoading } = useBackupStorageDrivers();
  const createMutation = useCreateBackupStorageProvider();

  // No GET list-destinations endpoint exists on the backend today (only
  // POST to create) — configured destinations created in this session are
  // tracked here so the page reflects what was just added.
  const [configured, setConfigured] = useState<BackupStorageConfig[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<BackupStorageDriver>('local');
  const [name, setName] = useState('');
  const [s3Config, setS3Config] = useState({ bucket: '', region: '', accessKeyId: '', secretAccessKey: '', endpoint: '' });
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hasPermission(BACKUP_PERMISSIONS.READ)) {
    return <Alert severity="warning" sx={{ m: 3 }}>You don't have permission to view storage providers.</Alert>;
  }

  const openAdd = (driver: BackupStorageDriver) => {
    setSelectedDriver(driver);
    setName('');
    setS3Config({ bucket: '', region: '', accessKeyId: '', secretAccessKey: '', endpoint: '' });
    setIsDefault(false);
    setError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setError(null);
    try {
      const config = selectedDriver === 's3'
        ? { bucket: s3Config.bucket, region: s3Config.region, accessKeyId: s3Config.accessKeyId, secretAccessKey: s3Config.secretAccessKey, endpoint: s3Config.endpoint || undefined }
        : {};
      const created = await createMutation.mutateAsync({ name, driver: selectedDriver, config, isDefault });
      setConfigured((prev) => [...prev, created]);
      setDialogOpen(false);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create storage destination.');
    }
  };

  const iconFor = (driver: string) => driver === 'local' ? <DnsIcon /> : <CloudIcon />;

  return (
    <Box>
      <PageHeader title="Storage Providers" subtitle="Backup destinations — local disk, S3, and other targets" icon={<StorageIcon />} />

      {isLoading ? <CircularProgress size={24} /> : (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {(drivers || []).map((d) => (
            <Grid item xs={12} sm={6} md={4} key={d.driver}>
              <Card variant="outlined" sx={{ borderRadius: 3, height: '100%', opacity: d.implemented ? 1 : 0.7 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      {iconFor(d.driver)}
                      <Typography variant="subtitle1" fontWeight={700}>{d.displayName}</Typography>
                    </Box>
                    {!d.implemented && <Chip label="Coming soon" size="small" />}
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {d.driver === 'local' && 'Backups are written to local disk on this server.'}
                    {d.driver === 's3' && 'Amazon S3 or S3-compatible object storage.'}
                    {d.driver === 'azure' && 'Azure Blob Storage — driver stub only.'}
                    {d.driver === 'gcs' && 'Google Cloud Storage — driver stub only.'}
                    {d.driver === 'sftp' && 'SFTP remote server — driver stub only.'}
                    {d.driver === 'network_share' && 'SMB/NFS network share — driver stub only.'}
                  </Typography>
                  <Button
                    sx={{ mt: 2 }}
                    variant="outlined"
                    size="small"
                    disabled={!d.implemented || !canManage}
                    onClick={() => openAdd(d.driver as BackupStorageDriver)}
                    startIcon={<AddIcon />}
                  >
                    {d.driver === 'local' ? 'Configure' : 'Add Destination'}
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Typography variant="subtitle1" fontWeight={700} gutterBottom>Configured Destinations (this session)</Typography>
      <Grid container spacing={2}>
        {configured.length === 0 && <Grid item xs={12}><Alert severity="info">No destinations added yet in this session.</Alert></Grid>}
        {configured.map((c) => (
          <Grid item xs={12} sm={6} md={4} key={c.id}>
            <Card variant="outlined" sx={{ borderRadius: 3 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700}>{c.name}</Typography>
                <Chip label={c.driver} size="small" sx={{ mt: 0.5 }} />
                {c.isDefault && <Chip label="Default" size="small" color="primary" sx={{ mt: 0.5, ml: 0.5 }} />}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <ResponsiveDialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add {selectedDriver === 's3' ? 'S3' : 'Local'} Destination</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
          {selectedDriver === 's3' && (
            <>
              <TextField label="Bucket" value={s3Config.bucket} onChange={(e) => setS3Config({ ...s3Config, bucket: e.target.value })} fullWidth />
              <TextField label="Region" value={s3Config.region} onChange={(e) => setS3Config({ ...s3Config, region: e.target.value })} fullWidth />
              <TextField label="Access Key ID" value={s3Config.accessKeyId} onChange={(e) => setS3Config({ ...s3Config, accessKeyId: e.target.value })} fullWidth />
              <TextField label="Secret Access Key" type="password" value={s3Config.secretAccessKey} onChange={(e) => setS3Config({ ...s3Config, secretAccessKey: e.target.value })} fullWidth />
              <TextField label="Endpoint (optional, for S3-compatible)" value={s3Config.endpoint} onChange={(e) => setS3Config({ ...s3Config, endpoint: e.target.value })} fullWidth />
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={createMutation.isPending || !name || (selectedDriver === 's3' && (!s3Config.bucket || !s3Config.region || !s3Config.accessKeyId || !s3Config.secretAccessKey))}
          >
            Save
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
