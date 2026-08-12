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
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Stack from '@mui/material/Stack';
import EventNoteIcon from '@mui/icons-material/EventNote';
import AddIcon from '@mui/icons-material/Add';

import PageHeader from '@/components/PageHeader';
import { apiClient } from '@/lib/api/client';

interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

interface AcademicYearForm {
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

const EMPTY_FORM: AcademicYearForm = { name: '', startDate: '', endDate: '', isActive: true };

export default function AcademicYearsPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AcademicYearForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadYears = () => {
    setLoading(true);
    setLoadError(null);
    apiClient.get<AcademicYear[]>('/childrens-village/academic-years')
      .then((res) => setYears(res.data))
      .catch(() => setLoadError('Could not load academic years.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadYears();
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
    if (!form.name.trim() || !form.startDate || !form.endDate) {
      setSaveError('Name, start date, and end date are all required.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.post('/childrens-village/academic-years', form);
      setDialogOpen(false);
      loadYears();
    } catch (err: any) {
      setSaveError(err?.response?.data?.message ?? 'Could not create the academic year. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Academic Years"
        icon={<EventNoteIcon />}
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openDialog}>
            New Academic Year
          </Button>
        }
      />

      {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : years.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            border: 1,
            borderStyle: 'dashed',
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'grey.50',
            p: 4,
            textAlign: 'center',
          }}
        >
          <Typography color="text.secondary">
            No academic years configured yet. Click the button above to create one.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell><b>Name</b></TableCell>
                <TableCell><b>Start Date</b></TableCell>
                <TableCell><b>End Date</b></TableCell>
                <TableCell><b>Status</b></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {years.map((y) => (
                <TableRow key={y.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{y.name}</Typography>
                  </TableCell>
                  <TableCell>{new Date(y.startDate).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(y.endDate).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={y.isActive ? 'Active' : 'Inactive'}
                      color={y.isActive ? 'success' : 'default'}
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
        <DialogTitle>New Academic Year</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {saveError && <Alert severity="error">{saveError}</Alert>}
            <TextField
              label="Name"
              placeholder="e.g. 2026-2027"
              fullWidth
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Start Date"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
              <TextField
                label="End Date"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </Stack>
            <FormControlLabel
              control={(
                <Checkbox
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
              )}
              label="Set as active academic year"
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
