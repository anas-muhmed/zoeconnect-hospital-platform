'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ArchiveIcon from '@mui/icons-material/Archive';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface CMSPlaylist {
  id: string;
  name: string;
  description: string | null;
  isArchived: boolean;
  publishedVersionId: string | null;
  hasUnpublishedChanges: boolean;
  updatedAt: string;
}

export default function CmsPlaylistsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });

  const { data: playlists = [], isLoading } = useQuery<CMSPlaylist[]>({
    queryKey: ['cms-playlists'],
    queryFn: () => apiClient.get('/cms/playlists').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (dto: typeof form) => apiClient.post('/cms/playlists', dto).then(r => r.data),
    onSuccess: (created: CMSPlaylist) => {
      queryClient.invalidateQueries({ queryKey: ['cms-playlists'] });
      setCreateOpen(false);
      setForm({ name: '', description: '' });
      router.push(`/cms/playlists/${created.id}`);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/cms/playlists/${id}/duplicate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cms-playlists'] }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/cms/playlists/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cms-playlists'] }),
  });

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading playlists...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>CMS Playlists</Typography>
          <Typography variant="body2" color="text.secondary">
            Build and publish ordered media playlists for digital signage displays.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          New Playlist
        </Button>
      </Box>

      {playlists.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">No playlists yet. Create one to get started.</Typography>
        </Paper>
      )}

      {playlists.map(playlist => (
        <Paper key={playlist.id} sx={{ p: 3, mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography fontWeight={700} variant="h6">{playlist.name}</Typography>
                {playlist.publishedVersionId ? (
                  <Chip size="small" label={playlist.hasUnpublishedChanges ? 'Unpublished changes' : 'Published'}
                    color={playlist.hasUnpublishedChanges ? 'warning' : 'success'} />
                ) : (
                  <Chip size="small" label="Never published" color="default" />
                )}
              </Box>
              {playlist.description && (
                <Typography variant="body2" color="text.secondary">{playlist.description}</Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Tooltip title="Edit playlist">
                <IconButton size="small" onClick={() => router.push(`/cms/playlists/${playlist.id}`)} aria-label="Edit playlist">
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Duplicate">
                <IconButton size="small" onClick={() => duplicateMutation.mutate(playlist.id)} aria-label="Duplicate">
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Archive">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => {
                    if (confirm(`Archive "${playlist.name}"? Displays using it will stop showing new updates.`)) {
                      archiveMutation.mutate(playlist.id);
                    }
                  }}
                 aria-label="Archive">
                  <ArchiveIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </Paper>
      ))}

      <ResponsiveDialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Playlist</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField label="Playlist Name" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Main Lobby Rotation" fullWidth />
          <TextField label="Description (optional)" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            multiline rows={2} fullWidth />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => createMutation.mutate(form)}
            disabled={!form.name || createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
