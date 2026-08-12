'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface CMSPlaylist { id: string; name: string; }

interface CMSEmergencyBroadcast {
  id: string;
  branchId: string | null;
  playlistId: string;
  message: string;
  isActive: boolean;
  activatedBy: string;
  activatedAt: string;
  deactivatedBy: string | null;
  deactivatedAt: string | null;
}

export default function CmsEmergencyPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ playlistId: '', message: '' });
  const [error, setError] = useState('');

  const { data: playlists = [] } = useQuery<CMSPlaylist[]>({
    queryKey: ['cms-playlists'],
    queryFn: () => apiClient.get('/cms/playlists').then(r => r.data),
  });

  const { data: active = [], isLoading } = useQuery<CMSEmergencyBroadcast[]>({
    queryKey: ['cms-emergency-active'],
    queryFn: () => apiClient.get('/cms/emergency/active').then(r => r.data),
    refetchInterval: 10_000,
  });

  const { data: history = [] } = useQuery<CMSEmergencyBroadcast[]>({
    queryKey: ['cms-emergency-history'],
    queryFn: () => apiClient.get('/cms/emergency/history').then(r => r.data),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['cms-emergency-active'] });
    queryClient.invalidateQueries({ queryKey: ['cms-emergency-history'] });
  };

  const activateMutation = useMutation({
    mutationFn: () => apiClient.post('/cms/emergency', { branchId: null, playlistId: form.playlistId, message: form.message }),
    onSuccess: () => { invalidate(); setForm({ playlistId: '', message: '' }); },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Failed to activate emergency broadcast'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/cms/emergency/${id}/deactivate`),
    onSuccess: invalidate,
  });

  const playlistName = (id: string) => playlists.find(p => p.id === id)?.name ?? 'Unknown playlist';

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h5" fontWeight={700}>Emergency Broadcast</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Highest priority -- overrides every schedule, group, and fallback playlist on every display until deactivated.
      </Typography>

      {active.length > 0 && (
        <Paper sx={{ p: 3, mb: 3, bgcolor: 'error.main', color: 'white' }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WarningAmberIcon /> Emergency broadcast is ACTIVE
          </Typography>
          {active.map(a => (
            <Box key={a.id} sx={{ mt: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="body1" fontWeight={600}>{a.message}</Typography>
                <Typography variant="caption">
                  Playlist: {playlistName(a.playlistId)} · Activated by {a.activatedBy} at {new Date(a.activatedAt).toLocaleString()}
                </Typography>
              </Box>
              <Button variant="contained" color="inherit" sx={{ color: 'error.main' }}
                disabled={deactivateMutation.isPending}
                onClick={() => deactivateMutation.mutate(a.id)}>
                Deactivate
              </Button>
            </Box>
          ))}
        </Paper>
      )}

      {active.length === 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 2 }}>Activate Emergency Broadcast</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField select label="Emergency playlist" value={form.playlistId}
              onChange={e => setForm(f => ({ ...f, playlistId: e.target.value }))} fullWidth>
              {playlists.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>
            <TextField label="Message" value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder="e.g. Fire evacuation in progress -- follow posted exit routes" fullWidth />
            {error && <Alert severity="error">{error}</Alert>}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="contained" color="error" startIcon={<WarningAmberIcon />}
                disabled={!form.playlistId || !form.message || activateMutation.isPending}
                onClick={() => { setError(''); activateMutation.mutate(); }}>
                {activateMutation.isPending ? 'Activating...' : 'Activate on Every Display'}
              </Button>
            </Box>
          </Box>
        </Paper>
      )}

      <Typography variant="subtitle2" sx={{ mb: 1 }}>History</Typography>
      {isLoading ? (
        <CircularProgress size={24} />
      ) : history.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No emergency broadcasts have been issued yet.</Typography>
      ) : (
        <List dense>
          {history.map(h => (
            <ListItem key={h.id} sx={{ bgcolor: 'grey.50', borderRadius: 1, mb: 0.5, border: '1px solid', borderColor: 'divider' }}>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" fontWeight={600}>{h.message}</Typography>
                    <Chip size="small" label={h.isActive ? 'Active' : 'Ended'} color={h.isActive ? 'error' : 'default'} />
                  </Box>
                }
                secondary={`Activated ${new Date(h.activatedAt).toLocaleString()} by ${h.activatedBy}${h.deactivatedAt ? ` · Ended ${new Date(h.deactivatedAt).toLocaleString()}` : ''}`}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
}
