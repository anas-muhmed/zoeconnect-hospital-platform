'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import PageHeader from '@/components/PageHeader';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import SaveIcon from '@mui/icons-material/Save';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import Grid from '@mui/material/Grid';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import StorageIcon from '@mui/icons-material/Storage';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import { vendorApi } from '@/lib/api/vendor.api';

export default function SystemSettingsPage() {
  const { id } = useParams() as { id: string };
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const [idleTimeout, setIdleTimeout] = useState('15');

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['system-settings', id],
    queryFn: () => vendorApi.getSystemSettings(id),
  });

  useEffect(() => {
    if (settings) {
      const timeoutSetting = settings.find((s) => s.settingKey === 'security.idleTimeoutMinutes');
      if (timeoutSetting) {
        setIdleTimeout(timeoutSetting.settingValue);
      }
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (updates: Array<{ settingKey: string; settingValue: string; label: string; description?: string }>) =>
      vendorApi.updateSystemSettings(id, updates),
    onSuccess: (data) => {
      enqueueSnackbar(data.message, { variant: 'success' });
      qc.invalidateQueries({ queryKey: ['system-settings', id] });
    },
    onError: (err: any) => {
      enqueueSnackbar(err.response?.data?.message || err.message || 'Failed to save settings', { variant: 'error' });
    },
  });

  const pushMutation = useMutation({
    mutationFn: () => vendorApi.pushSystemSettings(id),
    onSuccess: (data) => {
      enqueueSnackbar(data.message, { variant: 'success' });
    },
    onError: (err: any) => {
      enqueueSnackbar(err.response?.data?.message || err.message || 'Failed to push settings', { variant: 'error' });
    },
  });

  const handleSave = () => {
    saveMutation.mutate([
      {
        settingKey: 'security.idleTimeoutMinutes',
        settingValue: idleTimeout,
        label: 'Global Session Idle Timeout (Minutes)',
        description: 'Number of minutes of inactivity before a user is automatically logged out across the ZoeConnect platform. Enter 0 to disable.',
      },
    ]);
  };

  const handlePush = () => {
    pushMutation.mutate();
  };

  // ── Children's Village: standalone vs HIS-connected ──────────────────────
  // See backend/src/modules/childrens-village/adr/0001 and 0002 -- this is
  // the Vendor Portal control those ADRs describe. Unlike the settings above,
  // this applies immediately on save (a live Remote Admin command / Cloud
  // Modules Config call), not a separate "push" step.
  const { data: cvProvider, isLoading: cvLoading, error: cvError } = useQuery({
    queryKey: ['cv-provider', id],
    queryFn: () => vendorApi.getChildrensVillageProvider(id),
  });

  // Local staged selection -- the toggle no longer applies on click. It only
  // updates this pending value; the actual command fires when "Save" is
  // clicked (handleCvSave), same two-step pattern as the Security card above.
  const [cvPendingMode, setCvPendingMode] = useState<'internal' | 'oracle_his' | null>(null);

  useEffect(() => {
    if (cvProvider) {
      setCvPendingMode(cvProvider.mode);
    }
  }, [cvProvider]);

  const cvMutation = useMutation({
    mutationFn: (mode: 'internal' | 'oracle_his') => vendorApi.setChildrensVillageProvider(id, mode),
    onSuccess: (data) => {
      enqueueSnackbar(
        `Children's Village now sources students ${data.mode === 'internal' ? 'from its own standalone database' : 'from Oracle HIS'}.`,
        { variant: 'success' },
      );
      qc.invalidateQueries({ queryKey: ['cv-provider', id] });
    },
    onError: (err: any) => {
      enqueueSnackbar(err.response?.data?.message || err.message || 'Failed to update Children\'s Village data source', { variant: 'error' });
    },
  });

  const handleCvModeChange = (_: React.MouseEvent, mode: 'internal' | 'oracle_his' | null) => {
    if (mode) {
      setCvPendingMode(mode);
    }
  };

  const cvIsDirty = cvPendingMode !== null && cvPendingMode !== cvProvider?.mode;

  const handleCvSave = () => {
    if (cvPendingMode && cvIsDirty) {
      cvMutation.mutate(cvPendingMode);
    }
  };

  return (
    <Box sx={{ p: 4, maxWidth: 900, mx: 'auto' }}>
      <PageHeader
        title="System Settings"
        subtitle="Manage operational configurations for this ZoeConnect instance. Changes must be pushed to take effect."
        back={`/hospitals/${id}`}
      />

      {error ? (
        <Alert severity="error" sx={{ mb: 3 }}>
          Failed to load settings.
        </Alert>
      ) : isLoading ? (
        <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2 }} />
      ) : (
        <Card sx={{ p: 3, borderRadius: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Security & Authentication
          </Typography>
          
          <Box sx={{ mt: 3, mb: 4 }}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Global Session Idle Timeout (Minutes)"
                  type="number"
                  value={idleTimeout}
                  onChange={(e) => setIdleTimeout(e.target.value)}
                  helperText="Number of minutes of inactivity before automatic logout. (0 = disabled)"
                  InputProps={{ inputProps: { min: 0 } }}
                />
              </Grid>
            </Grid>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', borderTop: '1px solid', borderColor: 'divider', pt: 3 }}>
            <Button
              variant="outlined"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button
              variant="contained"
              startIcon={pushMutation.isPending ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}
              onClick={handlePush}
              disabled={pushMutation.isPending}
            >
              Push to ZoeConnect Instance
            </Button>
          </Box>
        </Card>
      )}

      {/* ── Modules: Children's Village provider ─────────────────────────── */}
      <Card sx={{ p: 3, borderRadius: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', mt: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <ChildCareIcon color="primary" />
          <Typography variant="h6" fontWeight={600}>
            Children's Village
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Choose where Children's Village reads and writes student demographics for this hospital.
          Standalone keeps its own student database, independent of any HIS. HIS-Connected reads
          student demographics directly from the hospital's Oracle HIS patient records instead.
        </Typography>

        {cvError ? (
          <Alert severity="error">Failed to load the current data source.</Alert>
        ) : cvLoading ? (
          <Skeleton variant="rectangular" height={72} sx={{ borderRadius: 2 }} />
        ) : (
          <Box>
            <ToggleButtonGroup
              exclusive
              value={cvPendingMode ?? cvProvider?.mode ?? 'oracle_his'}
              onChange={handleCvModeChange}
              disabled={cvMutation.isPending}
              sx={{ mb: 1.5 }}
            >
              <ToggleButton value="oracle_his" sx={{ px: 2.5, py: 1.5, gap: 1 }}>
                <LocalHospitalIcon fontSize="small" />
                <Box sx={{ textAlign: 'left' }}>
                  <Typography variant="body2" fontWeight={700}>HIS-Connected</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Reads students from Oracle HIS
                  </Typography>
                </Box>
              </ToggleButton>
              <ToggleButton value="internal" sx={{ px: 2.5, py: 1.5, gap: 1 }}>
                <StorageIcon fontSize="small" />
                <Box sx={{ textAlign: 'left' }}>
                  <Typography variant="body2" fontWeight={700}>Standalone</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Own internal student database
                  </Typography>
                </Box>
              </ToggleButton>
            </ToggleButtonGroup>

            {cvIsDirty && !cvMutation.isPending && (
              <Alert severity="warning" sx={{ mt: 1.5, mb: 1.5, fontSize: 13 }}>
                Unsaved change — click Save to apply.
              </Alert>
            )}

            <Alert severity="info" sx={{ mt: 1.5, mb: 2, fontSize: 13 }}>
              Saving takes effect immediately — there's no separate "push" step beyond this Save button.
              Switching modes does not migrate existing student records between the two data sources.
            </Alert>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
              <Button
                variant="contained"
                startIcon={cvMutation.isPending ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                onClick={handleCvSave}
                disabled={!cvIsDirty || cvMutation.isPending}
              >
                {cvMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </Box>
          </Box>
        )}
      </Card>
    </Box>
  );
}
