'use client';

/**
 * Feedback Settings --- module-wide, admin-tunable configuration (v1.0
 * capstone phase). Mirrors cms/settings/page.tsx's single-GET/single-PATCH-
 * whole-object pattern. Read/updated via a cached FeedbackSettingsService on
 * the backend, so a save here may take up to a few minutes to be reflected
 * everywhere if the backend has multiple instances -- see that service's
 * doc comment.
 */

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import AddIcon from '@mui/icons-material/Add';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface FeedbackSettings {
  id: string;
  /** Not editable here -- excluded from the PATCH payload, see saveMutation. */
  branchId: string | null;
  /** Not editable here -- excluded from the PATCH payload, see saveMutation. */
  updatedAt: string;
  maxSubmissionsPerDevice: number;
  submissionLimitWindowHours: number;
  duplicateSubmissionWindowSeconds: number;
  defaultGoogleReviewThreshold: number;
  defaultGoogleReviewThankYouMessage: string | null;
  defaultGoogleReviewInvitationMessage: string | null;
  defaultThankYouMessage: string | null;
  defaultSplashDurationSeconds: number;
  minSplashDurationSeconds: number;
  maxSplashDurationSeconds: number;
  complaintCategories: string[];
  complaintResolvedWhatsappTemplate: string | null;
}

const NUMERIC_FIELDS: { key: keyof FeedbackSettings; label: string; help: string }[] = [
  { key: 'maxSubmissionsPerDevice', label: 'Max Submissions Per Device', help: 'Caps how many times one device can submit against a single campaign in the window below' },
  { key: 'submissionLimitWindowHours', label: 'Submission Limit Window (hours)', help: 'Rolling window the submission cap above applies to' },
  { key: 'duplicateSubmissionWindowSeconds', label: 'Duplicate Submission Window (s)', help: 'Two submissions from the same device this close together are treated as an accidental double-tap' },
  { key: 'defaultGoogleReviewThreshold', label: 'Default Google Review Threshold', help: 'Rating (out of 5) a submission must meet to trigger the Google Review prompt, unless a campaign overrides it' },
  { key: 'defaultSplashDurationSeconds', label: 'Default Splash Duration (s)', help: 'How long a splash image shows if no duration is specified on upload' },
  { key: 'minSplashDurationSeconds', label: 'Min Splash Duration (s)', help: 'Lower bound clamp for splash image duration' },
  { key: 'maxSplashDurationSeconds', label: 'Max Splash Duration (s)', help: 'Upper bound clamp for splash image duration' },
];

const TEXT_FIELDS: { key: keyof FeedbackSettings; label: string; help: string; multiline?: boolean }[] = [
  { key: 'defaultThankYouMessage', label: 'Default Thank You Message', help: 'Shown after any submission that doesn\'t trigger a Google Review or complaint prompt', multiline: true },
  { key: 'defaultGoogleReviewThankYouMessage', label: 'Default Google Review Thank You Message', help: 'Used when a campaign hasn\'t customized its own copy', multiline: true },
  { key: 'defaultGoogleReviewInvitationMessage', label: 'Default Google Review Invitation Message', help: 'Used when a campaign hasn\'t customized its own copy', multiline: true },
  { key: 'complaintResolvedWhatsappTemplate', label: 'Complaint Resolved WhatsApp Template', help: 'Meta-approved WhatsApp template name for the "your complaint was resolved" notification. Leave blank to disable.' },
];

export default function FeedbackSettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FeedbackSettings | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery<FeedbackSettings>({
    queryKey: ['feedback-settings'],
    queryFn: () => apiClient.get('/feedback/settings').then(r => r.data),
  });

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  const saveMutation = useMutation({
    // Only send the editable fields -- `form` also carries `id`/`branchId`/`updatedAt`
    // straight from the GET response, and UpdateFeedbackSettingsDto's whitelist:true
    // pipe rejects any property it doesn't have a decorator for (see that DTO's doc
    // comment). Destructuring them out here is simpler than loosening the DTO.
    mutationFn: () => {
      const { id, branchId, updatedAt, ...editable } = form as FeedbackSettings;
      return apiClient.patch('/feedback/settings', editable);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback-settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Failed to save settings'),
  });

  if (isLoading || !form) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading feedback settings...</Typography>
      </Box>
    );
  }

  const addCategory = () => {
    const value = newCategory.trim();
    if (!value || form.complaintCategories.includes(value)) return;
    setForm(prev => prev ? { ...prev, complaintCategories: [...prev.complaintCategories, value] } : prev);
    setNewCategory('');
  };

  const removeCategory = (cat: string) => {
    setForm(prev => prev ? { ...prev, complaintCategories: prev.complaintCategories.filter(c => c !== cat) } : prev);
  };

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h5" fontWeight={700}>Feedback Settings</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Module-wide defaults for the Patient Feedback module. Individual campaigns can still override the Google
        Review copy and threshold; these values apply whenever a campaign hasn't set its own.
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>Limits &amp; Timing</Typography>
        <Grid container spacing={2}>
          {NUMERIC_FIELDS.map(f => (
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
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>Default Messaging</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {TEXT_FIELDS.map(f => (
            <TextField
              key={f.key}
              fullWidth
              size="small"
              multiline={f.multiline}
              minRows={f.multiline ? 2 : undefined}
              label={f.label}
              helperText={f.help}
              value={(form[f.key] as string) ?? ''}
              onChange={e => setForm(prev => prev ? { ...prev, [f.key]: e.target.value } : prev)}
            />
          ))}
        </Box>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600}>Complaint Categories</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Shown as the category dropdown on the public portal's "tell us more" screen after a low-rated submission.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
          {form.complaintCategories.map(cat => (
            <Chip key={cat} label={cat} onDelete={() => removeCategory(cat)} />
          ))}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            size="small" label="Add category" value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
          />
          <Button variant="outlined" startIcon={<AddIcon />} onClick={addCategory}>Add</Button>
        </Box>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {saved && <Alert severity="success" sx={{ mb: 2 }}>Settings saved.</Alert>}

      <Divider sx={{ mb: 2 }} />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" disabled={saveMutation.isPending || form.complaintCategories.length === 0}
          onClick={() => { setError(''); saveMutation.mutate(); }}>
          {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </Box>
    </Box>
  );
}
