'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Stack from '@mui/material/Stack';
import ArticleIcon from '@mui/icons-material/Article';
import AddIcon from '@mui/icons-material/Add';

import PageHeader from '@/components/PageHeader';
import { apiClient } from '@/lib/api/client';

// Mirrors backend/src/modules/childrens-village/subjects/entities/cv-subject.entity.ts SubjectCategory
const SUBJECT_CATEGORIES = ['ACADEMIC', 'FUNCTIONAL', 'THERAPEUTIC', 'CREATIVE', 'OTHER'] as const;
type SubjectCategory = typeof SUBJECT_CATEGORIES[number];

const CATEGORY_COLORS: Record<SubjectCategory, 'primary' | 'success' | 'secondary' | 'warning' | 'default'> = {
  ACADEMIC: 'primary',
  FUNCTIONAL: 'success',
  THERAPEUTIC: 'secondary',
  CREATIVE: 'warning',
  OTHER: 'default',
};

interface CvSubject {
  id: string;
  name: string;
  code: string | null;
  category: SubjectCategory;
  description: string | null;
  isActive: boolean;
}

interface SubjectForm {
  name: string;
  code: string;
  category: SubjectCategory;
  description: string;
  isActive: boolean;
}

const EMPTY_FORM: SubjectForm = { name: '', code: '', category: 'ACADEMIC', description: '', isActive: true };

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<CvSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<SubjectForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadSubjects = () => {
    setLoading(true);
    setLoadError(null);
    apiClient.get<CvSubject[]>('/childrens-village/subjects')
      .then((res) => setSubjects(res.data))
      .catch(() => setLoadError('Could not load subjects.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSubjects();
  }, []);

  const openDialog = () => {
    setForm(EMPTY_FORM);
    setSaveError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (saving) return;
    setDialogOpen(false);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setSaveError('Name is required.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.post('/childrens-village/subjects', {
        name: form.name,
        code: form.code || undefined,
        category: form.category,
        description: form.description || undefined,
        isActive: form.isActive,
      });
      setDialogOpen(false);
      loadSubjects();
    } catch (err: any) {
      setSaveError(err?.response?.data?.message ?? 'Could not create the subject. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ArticleIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" fontWeight="bold">
            Subjects
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ borderRadius: 2 }} onClick={openDialog}>
          New Subject
        </Button>
      </Box>

      {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : subjects.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2, border: '1px dashed #e0e0e0', bgcolor: '#fafafa' }}>
          <Typography color="text.secondary">
            No subjects configured yet.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell><b>Name</b></TableCell>
                <TableCell><b>Code</b></TableCell>
                <TableCell><b>Category</b></TableCell>
                <TableCell><b>Status</b></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {subjects.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{s.name}</Typography>
                    {s.description && (
                      <Typography variant="caption" color="text.secondary">{s.description}</Typography>
                    )}
                  </TableCell>
                  <TableCell>{s.code ?? '—'}</TableCell>
                  <TableCell>
                    <Chip size="small" label={s.category} color={CATEGORY_COLORS[s.category] ?? 'default'} variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={s.isActive ? 'Active' : 'Inactive'}
                      color={s.isActive ? 'success' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <ResponsiveDialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>New Subject</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {saveError && <Alert severity="error">{saveError}</Alert>}
            <TextField
              label="Subject Name"
              fullWidth
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Code"
                fullWidth
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
              <TextField
                select
                label="Category"
                fullWidth
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as SubjectCategory }))}
              >
                {SUBJECT_CATEGORIES.map((cat) => (
                  <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                ))}
              </TextField>
            </Stack>
            <TextField
              label="Description"
              fullWidth
              multiline
              minRows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            <FormControlLabel
              control={(
                <Checkbox
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
              )}
              label="Active"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : 'Create'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
