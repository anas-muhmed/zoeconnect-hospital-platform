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
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArchiveIcon from '@mui/icons-material/Archive';
import PublishIcon from '@mui/icons-material/Publish';
import UnpublishedIcon from '@mui/icons-material/Unpublished';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface FeedbackForm {
  id: string;
  name: string;
  description: string | null;
  language: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  createdAt: string;
}

const STATUS_COLOR: Record<FeedbackForm['status'], 'default' | 'success' | 'warning'> = {
  DRAFT: 'default',
  PUBLISHED: 'success',
  ARCHIVED: 'warning',
};

export default function FeedbackFormsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', language: 'en' });
  const [formError, setFormError] = useState('');

  const { data: forms = [], isLoading } = useQuery<FeedbackForm[]>({
    queryKey: ['feedback-forms'],
    queryFn: () => apiClient.get('/feedback/forms').then(r => r.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['feedback-forms'] });

  const createMutation = useMutation({
    mutationFn: (dto: typeof form) => apiClient.post('/feedback/forms', dto),
    onSuccess: (res) => {
      invalidate();
      setCreateOpen(false);
      setForm({ name: '', description: '', language: 'en' });
      router.push(`/feedback/forms/${res.data.id}`);
    },
    onError: (e: any) => setFormError(e?.response?.data?.message ?? 'Failed to create form'),
  });

  const cloneMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/feedback/forms/${id}/clone`),
    onSuccess: invalidate,
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/feedback/forms/${id}/archive`),
    onSuccess: invalidate,
  });

  const publishMutation = useMutation({
    mutationFn: ({ id, publish }: { id: string; publish: boolean }) =>
      apiClient.post(`/feedback/forms/${id}/${publish ? 'publish' : 'unpublish'}`),
    onSuccess: invalidate,
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Failed to change publish state'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/feedback/forms/${id}`),
    onSuccess: invalidate,
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Failed to delete form'),
  });

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading feedback forms...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Patient Feedback Forms</Typography>
          <Typography variant="body2" color="text.secondary">
            Build dynamic questionnaires for patient experience feedback. Publish a form before generating a QR code for it.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setFormError(''); setCreateOpen(true); }}>
          New Form
        </Button>
      </Box>

      {forms.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">No feedback forms yet. Create one to start building your questionnaire.</Typography>
        </Paper>
      )}

      {forms.map(f => (
        <Paper key={f.id} sx={{ p: 3, mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
            <Box sx={{ flex: 1, cursor: 'pointer' }} onClick={() => router.push(`/feedback/forms/${f.id}`)}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography fontWeight={700} variant="h6">{f.name}</Typography>
                <Chip size="small" label={f.status} color={STATUS_COLOR[f.status]} />
                <Chip size="small" variant="outlined" label={f.language.toUpperCase()} />
              </Box>
              {f.description && (
                <Typography variant="body2" color="text.secondary">{f.description}</Typography>
              )}
              {f.publishedAt && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Published {new Date(f.publishedAt).toLocaleString()}
                </Typography>
              )}
            </Box>

            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Tooltip title="Edit form">
                <IconButton size="small" onClick={() => router.push(`/feedback/forms/${f.id}`)} aria-label="Edit form">
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Clone">
                <IconButton size="small" onClick={() => cloneMutation.mutate(f.id)} aria-label="Clone">
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {f.status === 'PUBLISHED' ? (
                <Tooltip title="Unpublish">
                  <IconButton size="small" color="warning" onClick={() => publishMutation.mutate({ id: f.id, publish: false })} aria-label="Unpublish">
                    <UnpublishedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : (
                <Tooltip title="Publish">
                  <IconButton size="small" color="success" onClick={() => publishMutation.mutate({ id: f.id, publish: true })} aria-label="Publish">
                    <PublishIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {f.status !== 'ARCHIVED' && (
                <Tooltip title="Archive">
                  <IconButton size="small" onClick={() => archiveMutation.mutate(f.id)} aria-label="Archive">
                    <ArchiveIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Delete">
                <IconButton size="small" color="error" onClick={() => {
                  if (confirm(`Delete form "${f.name}"? This cannot be undone.`)) removeMutation.mutate(f.id);
                }} aria-label="Delete">
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </Paper>
      ))}

      <ResponsiveDialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Feedback Form</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            label="Form Name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Outpatient Visit Feedback"
            fullWidth
          />
          <TextField
            label="Description"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            multiline minRows={2}
            fullWidth
          />
          <TextField select label="Language" value={form.language}
            onChange={e => setForm(f => ({ ...f, language: e.target.value }))} sx={{ maxWidth: 200 }}>
            <MenuItem value="en">English</MenuItem>
            <MenuItem value="ar">Arabic</MenuItem>
            <MenuItem value="hi">Hindi</MenuItem>
          </TextField>
          {formError && <Alert severity="error">{formError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => createMutation.mutate(form)}
            disabled={!form.name || createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create & Edit'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
