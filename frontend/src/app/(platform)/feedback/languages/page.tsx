'use client';

/**
 * Admin management of the global language pool available for translating
 * feedback forms into (see FeedbackLanguage's backend doc comment). No
 * delete -- languages are toggled inactive instead, since a form may
 * already have translations saved against a language's code.
 */

import { useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import AddIcon from '@mui/icons-material/Add';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface FeedbackLanguage {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export default function FeedbackLanguagesPage() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const { data: languages = [], isLoading } = useQuery<FeedbackLanguage[]>({
    queryKey: ['feedback-languages'],
    queryFn: () => apiClient.get('/feedback/languages').then(r => r.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['feedback-languages'] });

  const addMutation = useMutation({
    mutationFn: () => apiClient.post('/feedback/languages', { code: code.trim(), name: name.trim() }),
    onSuccess: () => { invalidate(); setCode(''); setName(''); setError(''); },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Failed to add language'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.patch(`/feedback/languages/${id}`, { isActive }),
    onSuccess: invalidate,
    onError: (e: any) => { alert(e?.response?.data?.message ?? 'Failed to update language'); invalidate(); },
  });

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading languages...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 700, mx: 'auto' }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>Supported Languages</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Configure the languages available for translating feedback forms. Enabling a language does not translate
        forms automatically; it simply makes that language available when editing translations. Deactivating a
        language hides it from new translation editors but keeps any translations already saved against it.
      </Typography>

      <Paper sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>Add a Language</Typography>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <TextField label="Code" placeholder="e.g. ta" value={code} onChange={e => setCode(e.target.value)} sx={{ width: 120 }} />
          <TextField label="Name" placeholder="e.g. Tamil" value={name} onChange={e => setName(e.target.value)} sx={{ flex: 1, minWidth: 200 }} />
          <Button
            variant="contained" startIcon={<AddIcon />}
            onClick={() => addMutation.mutate()}
            disabled={!code.trim() || !name.trim() || addMutation.isPending}
          >
            Add
          </Button>
        </Box>
        {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      </Paper>

      {languages.map(l => (
        <Paper key={l.id} sx={{ p: 2, mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Chip size="small" label={l.code} sx={{ fontFamily: 'monospace' }} />
            <Typography fontWeight={600}>{l.name}</Typography>
          </Box>
          <Switch
            checked={l.isActive}
            onChange={e => toggleMutation.mutate({ id: l.id, isActive: e.target.checked })}
          />
        </Paper>
      ))}
    </Box>
  );
}
