'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Skeleton from '@mui/material/Skeleton';
import SettingsIcon from '@mui/icons-material/Settings';
import SaveIcon from '@mui/icons-material/Save';
import { apiClient } from '@/lib/api/client';
import PageHeader from '@/components/PageHeader';

interface CvSettings {
  id: string;
  requireAdmissionApproval: boolean;
  updatedAt: string;
}

export default function ChildrensVillageSettingsPage() {
  const queryClient = useQueryClient();
  const [requireApproval, setRequireApproval] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);

  const { data, isLoading, error } = useQuery<CvSettings>({
    queryKey: ['cv-settings'],
    queryFn: () => apiClient.get('/childrens-village/settings').then(r => r.data),
  });

  useEffect(() => {
    if (data && requireApproval === null) setRequireApproval(data.requireAdmissionApproval);
  }, [data, requireApproval]);

  const saveMutation = useMutation({
    mutationFn: (value: boolean) =>
      apiClient.patch('/childrens-village/settings', { requireAdmissionApproval: value }).then(r => r.data),
    onSuccess: (updated: CvSettings) => {
      queryClient.setQueryData(['cv-settings'], updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const isDirty = data !== undefined && requireApproval !== null && requireApproval !== data.requireAdmissionApproval;

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Children's Village Settings"
        subtitle="Module-wide configuration, manageable by Hospital Admins and Super Admins."
        icon={<SettingsIcon />}
      />

      {error ? (
        <Alert severity="error">Failed to load settings.</Alert>
      ) : isLoading || requireApproval === null ? (
        <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 2 }} />
      ) : (
        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3, maxWidth: 720 }}>
          <Typography variant="h6" fontWeight={700} gutterBottom>
            Admissions
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={requireApproval}
                onChange={(e) => setRequireApproval(e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography variant="body1" fontWeight={600}>
                  Require admission approval
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {requireApproval
                    ? "New admissions stay in a Pending state until someone with the Approve Admissions permission reviews and approves or rejects them."
                    : "New admissions are enrolled immediately — no review step. Turn this on if admissions should go through an approval workflow before a student is active."}
                </Typography>
              </Box>
            }
            sx={{ alignItems: 'flex-start', ml: 0, gap: 1.5 }}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <Button
              variant="contained"
              startIcon={saveMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              disabled={!isDirty || saveMutation.isPending}
              onClick={() => requireApproval !== null && saveMutation.mutate(requireApproval)}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
            {saved && <Alert severity="success" sx={{ py: 0 }}>Saved.</Alert>}
            {saveMutation.isError && <Alert severity="error" sx={{ py: 0 }}>Failed to save.</Alert>}
          </Box>
        </Paper>
      )}
    </Box>
  );
}
