import React, { useState } from 'react';
import {
  DialogTitle, DialogContent, DialogActions, Button, Stepper, Step, StepLabel,
  Box, Typography, RadioGroup, FormControlLabel, Radio, Checkbox, FormGroup, TextField,
  Switch, Alert, Chip, Divider, CircularProgress,
} from '@mui/material';
import ResponsiveDialog from '../ResponsiveDialog';
import { useCreateBackup } from '../../hooks/backup/use-backup';
import { useBackupStorageDrivers } from '../../hooks/backup/use-backup-storage';
import { BACKUP_MODULES, BACKUP_TYPES_FOR_CREATE, BackupModuleName, BackupType } from '../../types/backup.types';
import { getBackupTypeLabel, getModuleLabel } from '../../lib/utils/backup-formatters';

interface BackupWizardDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const STEPS = ['Backup Type', 'Modules', 'Destination', 'Compression', 'Encryption', 'Review'];

export const BackupWizardDialog: React.FC<BackupWizardDialogProps> = ({ open, onClose, onCreated }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [type, setType] = useState<BackupType>('full');
  const [modules, setModules] = useState<BackupModuleName[]>([...BACKUP_MODULES]);
  const [storageConfigId, setStorageConfigId] = useState<string>('');
  const [compress, setCompress] = useState(true);
  const [encrypt, setEncrypt] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: drivers } = useBackupStorageDrivers();
  const createMutation = useCreateBackup();

  const reset = () => {
    setActiveStep(0); setType('full'); setModules([...BACKUP_MODULES]);
    setStorageConfigId(''); setCompress(true); setEncrypt(false); setPassphrase(''); setError(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const toggleModule = (mod: BackupModuleName) => {
    setModules((prev) => prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]);
  };

  const canProceed = (): boolean => {
    if (activeStep === 1) return modules.length > 0;
    if (activeStep === 4 && encrypt) return passphrase.trim().length >= 8;
    return true;
  };

  const handleNext = () => setActiveStep((s) => Math.min(s + 1, STEPS.length - 1));
  const handleBack = () => setActiveStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    setError(null);
    try {
      await createMutation.mutateAsync({
        type,
        modules,
        storageConfigId: storageConfigId || undefined,
        encrypt,
        passphrase: encrypt ? passphrase : undefined,
      });
      onCreated?.();
      handleClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to start backup.');
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create Backup</DialogTitle>
      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ my: 2 }} alternativeLabel>
          {STEPS.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
        </Stepper>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {activeStep === 0 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>Select backup type</Typography>
            <RadioGroup value={type} onChange={(e) => setType(e.target.value as BackupType)}>
              {BACKUP_TYPES_FOR_CREATE.map((t) => (
                <FormControlLabel key={t} value={t} control={<Radio />} label={getBackupTypeLabel(t)} />
              ))}
            </RadioGroup>
          </Box>
        )}

        {activeStep === 1 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>Choose modules to include</Typography>
            <FormGroup>
              {BACKUP_MODULES.map((mod) => (
                <FormControlLabel
                  key={mod}
                  control={<Checkbox checked={modules.includes(mod)} onChange={() => toggleModule(mod)} />}
                  label={getModuleLabel(mod)}
                />
              ))}
            </FormGroup>
            {modules.length === 0 && <Alert severity="warning" sx={{ mt: 1 }}>Select at least one module.</Alert>}
          </Box>
        )}

        {activeStep === 2 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>Choose storage destination</Typography>
            <RadioGroup value={storageConfigId} onChange={(e) => setStorageConfigId(e.target.value)}>
              <FormControlLabel value="" control={<Radio />} label="Default (Local disk)" />
              {(drivers || []).filter((d) => d.driver !== 'local').map((d) => (
                <FormControlLabel
                  key={d.driver}
                  value=""
                  disabled
                  control={<Radio disabled />}
                  label={`${d.displayName} ${!d.implemented ? '(configure under Storage first — coming soon)' : ''}`}
                />
              ))}
            </RadioGroup>
            <Typography variant="caption" color="text.secondary">
              Additional configured destinations can be selected once created under Backup &amp; Restore → Storage.
            </Typography>
          </Box>
        )}

        {activeStep === 3 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>Compression</Typography>
            <FormControlLabel
              control={<Switch checked={compress} onChange={(e) => setCompress(e.target.checked)} />}
              label="Compress archive (gzip)"
            />
            <Typography variant="caption" display="block" color="text.secondary">
              Recommended. Reduces archive size before upload to the storage destination.
            </Typography>
          </Box>
        )}

        {activeStep === 4 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>Encryption</Typography>
            <FormControlLabel
              control={<Switch checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />}
              label="Encrypt archive at rest (AES-256)"
            />
            {encrypt && (
              <TextField
                fullWidth
                sx={{ mt: 2 }}
                type="password"
                label="Passphrase"
                helperText="Minimum 8 characters. You will need this passphrase to restore or verify this backup."
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                error={passphrase.length > 0 && passphrase.length < 8}
              />
            )}
          </Box>
        )}

        {activeStep === 5 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>Review</Typography>
            <Divider sx={{ mb: 1.5 }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Row label="Type" value={getBackupTypeLabel(type)} />
              <Row label="Modules" value={
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {modules.map((m) => <Chip key={m} label={getModuleLabel(m)} size="small" />)}
                </Box>
              } />
              <Row label="Destination" value={storageConfigId || 'Default (Local disk)'} />
              <Row label="Compression" value={compress ? 'Enabled' : 'Disabled'} />
              <Row label="Encryption" value={encrypt ? 'Enabled (AES-256)' : 'Disabled'} />
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose}>Cancel</Button>
        <Box sx={{ flex: 1 }} />
        {activeStep > 0 && <Button onClick={handleBack}>Back</Button>}
        {activeStep < STEPS.length - 1 ? (
          <Button variant="contained" onClick={handleNext} disabled={!canProceed()}>Next</Button>
        ) : (
          <Button
            variant="contained"
            color="primary"
            onClick={handleSubmit}
            disabled={createMutation.isPending || !canProceed()}
            startIcon={createMutation.isPending ? <CircularProgress size={16} /> : undefined}
          >
            Start Backup
          </Button>
        )}
      </DialogActions>
    </ResponsiveDialog>
  );
};

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
    <Typography variant="body2" color="text.secondary" sx={{ width: 120, flexShrink: 0 }}>{label}</Typography>
    <Box sx={{ flex: 1 }}>{typeof value === 'string' ? <Typography variant="body2" fontWeight={600}>{value}</Typography> : value}</Box>
  </Box>
);
