'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface CMSPlaylist { id: string; name: string; }

interface CMSDisplayGroup {
  id: string;
  name: string;
  playlistId: string | null;
  createdAt: string;
}

interface CMSDisplayAssignment { id: string; name: string; groupId: string | null; }

export default function CmsGroupsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CMSDisplayGroup | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', playlistId: '' });
  const [error, setError] = useState('');

  const { data: groups = [], isLoading } = useQuery<CMSDisplayGroup[]>({
    queryKey: ['cms-display-groups'],
    queryFn: () => apiClient.get('/cms/display-groups').then(r => r.data),
  });

  const { data: playlists = [] } = useQuery<CMSPlaylist[]>({
    queryKey: ['cms-playlists'],
    queryFn: () => apiClient.get('/cms/playlists').then(r => r.data),
  });

  const { data: displays = [] } = useQuery<CMSDisplayAssignment[]>({
    queryKey: ['cms-displays'],
    queryFn: () => apiClient.get('/cms/displays').then(r => r.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['cms-display-groups'] });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name: form.name, playlistId: form.playlistId || null };
      return editing && editing !== 'new'
        ? apiClient.patch(`/cms/display-groups/${editing.id}`, payload)
        : apiClient.post('/cms/display-groups', payload);
    },
    onSuccess: () => { invalidate(); setEditing(null); },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Failed to save group'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/cms/display-groups/${id}`),
    onSuccess: invalidate,
  });

  const openCreate = () => { setForm({ name: '', playlistId: '' }); setError(''); setEditing('new'); };
  const openEdit = (g: CMSDisplayGroup) => { setForm({ name: g.name, playlistId: g.playlistId ?? '' }); setError(''); setEditing(g); };

  const memberCount = (groupId: string) => displays.filter(d => d.groupId === groupId).length;
  const playlistName = (id: string | null) => playlists.find(p => p.id === id)?.name ?? '— No playlist —';

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading screen groups...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Screen Groups</Typography>
          <Typography variant="body2" color="text.secondary">
            Group displays (e.g. "Reception TVs") and assign one playlist to the whole group at once.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>New Group</Button>
      </Box>

      {groups.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">No screen groups yet.</Typography>
        </Paper>
      )}

      {groups.map(g => (
        <Paper key={g.id} sx={{ p: 3, mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography fontWeight={700} variant="h6">{g.name}</Typography>
              <Chip size="small" label={`${memberCount(g.id)} display${memberCount(g.id) === 1 ? '' : 's'}`} />
            </Box>
            <Typography variant="body2" color="text.secondary">Playlist: {playlistName(g.playlistId)}</Typography>
          </Box>
          <Box>
            <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(g)} aria-label="Edit"><EditIcon fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="Delete">
              <IconButton size="small" color="error" onClick={() => {
                if (confirm(`Delete group "${g.name}"? Member displays fall back to their own playlist.`)) removeMutation.mutate(g.id);
              }} aria-label="Delete">
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Paper>
      ))}

      <ResponsiveDialog open={editing !== null} onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing === 'new' ? 'Create Screen Group' : 'Edit Screen Group'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField label="Group name" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Reception TVs" fullWidth />
          <TextField select label="Playlist" value={form.playlistId}
            onChange={e => setForm(f => ({ ...f, playlistId: e.target.value }))} fullWidth>
            <MenuItem value="">— No playlist —</MenuItem>
            {playlists.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="contained" disabled={!form.name || saveMutation.isPending}
            onClick={() => { setError(''); saveMutation.mutate(); }}>
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
