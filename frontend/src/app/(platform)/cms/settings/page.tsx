'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface CMSSettings {
  id: string;
  playerPollIntervalMs: number;
  heartbeatIntervalMs: number;
  retryCount: number;
  retryDelayMs: number;
  offlineTimeoutMs: number;
  maxCacheSizeMb: number;
  logRetentionDays: number;
  autoCleanupEnabled: boolean;
  defaultImageDurationSeconds: number;
}

const FIELDS: { key: keyof CMSSettings; label: string; help: string }[] = [
  { key: 'playerPollIntervalMs', label: 'Player Poll Interval (ms)', help: 'How often players re-check for new published content' },
  { key: 'heartbeatIntervalMs', label: 'Heartbeat Interval (ms)', help: 'How often players report health/telemetry' },
  { key: 'retryCount', label: 'Retry Count', help: 'Max download retry attempts per asset' },
  { key: 'retryDelayMs', label: 'Retry Delay (ms)', help: 'Base delay before exponential backoff retries' },
  { key: 'offlineTimeoutMs', label: 'Offline Timeout (ms)', help: 'Missed heartbeats before a display is considered offline' },
  { key: 'maxCacheSizeMb', label: 'Maximum Cache Size (MB)', help: 'Soft cap on a player\'s local asset cache' },
  { key: 'logRetentionDays', label: 'Log Retention (days)', help: 'How long player logs are kept before purging' },
  { key: 'defaultImageDurationSeconds', label: 'Default Image Duration (s)', help: 'Fallback duration for image items with no explicit duration' },
];

export default function CmsSettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CMSSettings | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery<CMSSettings>({
    queryKey: ['cms-settings'],
    queryFn: () => apiClient.get('/cms/settings').then(r => r.data),
  });

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  const saveMutation = useMutation({
    mutationFn: () => apiClient.patch('/cms/settings', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Failed to save settings'),
  });

  if (isLoading || !form) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading CMS settings...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h5" fontWeight={700}>CMS Settings</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Global player/behavior configuration. No hardcoded intervals -- every display reads these values.
      </Typography>

      <Paper sx={{ p: 3 }}>
        <Grid container spacing={2}>
          {FIELDS.map(f => (
            <Grid item xs={12} sm={6} key={f.key}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label={f.label}
                helperText={f.help}
                value={form[f.key] as number}
                onChange={e => setForm(prev => prev ? { ...prev, [f.key]: Number(e.target.value) } : prev)}
              />
            </Grid>
          ))}
        </Grid>

        <FormControlLabel
          sx={{ mt: 2 }}
          control={
            <Switch checked={form.autoCleanupEnabled}
              onChange={e => setForm(prev => prev ? { ...prev, autoCleanupEnabled: e.target.checked } : prev)} />
          }
          label="Auto cleanup of orphaned media enabled (runs nightly)"
        />

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {saved && <Alert severity="success" sx={{ mt: 2 }}>Settings saved.</Alert>}

        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="contained" disabled={saveMutation.isPending}
            onClick={() => { setError(''); saveMutation.mutate(); }}>
            {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
