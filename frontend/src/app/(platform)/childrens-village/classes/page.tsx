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
import Tooltip from '@mui/material/Tooltip';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import AddIcon from '@mui/icons-material/Add';
import GroupIcon from '@mui/icons-material/Group';
import ScheduleIcon from '@mui/icons-material/Schedule';
import Link from 'next/link';

import PageHeader from '@/components/PageHeader';
import { apiClient } from '@/lib/api/client';

interface AcademicYear {
  id: string;
  name: string;
  isActive: boolean;
}

interface CvClass {
  id: string;
  name: string;
  capacity: number;
  ageGroup: string | null;
  disabilityCategory: string | null;
  roomNumber: string | null;
  isActive: boolean;
  academicYearId: string;
  academicYear?: AcademicYear | null;
}

interface ClassForm {
  academicYearId: string;
  name: string;
  capacity: string;
  ageGroup: string;
  disabilityCategory: string;
  roomNumber: string;
  isActive: boolean;
}

const EMPTY_FORM: ClassForm = {
  academicYearId: '', name: '', capacity: '20', ageGroup: '', disabilityCategory: '', roomNumber: '', isActive: true,
};

export default function ClassesPage() {
  const [classes, setClasses] = useState<CvClass[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ClassForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      apiClient.get<CvClass[]>('/childrens-village/classes'),
      apiClient.get<AcademicYear[]>('/childrens-village/academic-years'),
    ])
      .then(([classesRes, yearsRes]) => {
        setClasses(classesRes.data);
        setAcademicYears(yearsRes.data);
      })
      .catch(() => setLoadError('Could not load classes.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const openDialog = () => {
    const activeYear = academicYears.find((y) => y.isActive);
    setForm({ ...EMPTY_FORM, academicYearId: activeYear?.id ?? academicYears[0]?.id ?? '' });
    setSaveError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (saving) return;
    setDialogOpen(false);
  };

  // No edit UI existed for a class after creation -- if one ever ends up
  // Inactive (whatever the cause), there was previously no way to flip it
  // back short of a direct DB edit. This calls the existing PUT endpoint
  // (cv-class.controller.ts's `update`) to toggle it from the list.
  const toggleActive = async (cls: CvClass) => {
    setTogglingId(cls.id);
    try {
      await apiClient.put(`/childrens-village/classes/${cls.id}`, { isActive: !cls.isActive });
      loadData();
    } catch {
      setLoadError('Could not update this class\'s status. Please try again.');
    } finally {
      setTogglingId(null);
    }
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setSaveError('Name is required.');
      return;
    }
    if (!form.academicYearId) {
      setSaveError('An academic year is required. Create one first under Academic Years.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.post('/childrens-village/classes', {
        academicYearId: form.academicYearId,
        name: form.name,
        capacity: form.capacity ? Number(form.capacity) : undefined,
        ageGroup: form.ageGroup || undefined,
        disabilityCategory: form.disabilityCategory || undefined,
        roomNumber: form.roomNumber || undefined,
        isActive: form.isActive,
      });
      setDialogOpen(false);
      loadData();
    } catch (err: any) {
      setSaveError(err?.response?.data?.message ?? 'Could not create the class. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Classes"
        icon={<PeopleAltIcon />}
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openDialog}>
            New Class
          </Button>
        }
      />

      {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : classes.length === 0 ? (
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
            No classes configured yet.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell><b>Name</b></TableCell>
                <TableCell><b>Academic Year</b></TableCell>
                <TableCell><b>Age Group</b></TableCell>
                <TableCell><b>Capacity</b></TableCell>
                <TableCell><b>Room</b></TableCell>
                <TableCell><b>Status</b></TableCell>
                <TableCell align="right"><b>Actions</b></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {classes.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{c.name}</Typography>
                  </TableCell>
                  <TableCell>{c.academicYear?.name ?? '—'}</TableCell>
                  <TableCell>{c.ageGroup ?? '—'}</TableCell>
                  <TableCell>{c.capacity}</TableCell>
                  <TableCell>{c.roomNumber ?? '—'}</TableCell>
                  <TableCell>
                    <Tooltip title={`Click to mark ${c.isActive ? 'Inactive' : 'Active'}`}>
                      <Chip
                        size="small"
                        label={togglingId === c.id ? '…' : (c.isActive ? 'Active' : 'Inactive')}
                        color={c.isActive ? 'success' : 'default'}
                        variant="outlined"
                        onClick={() => toggleActive(c)}
                        disabled={togglingId === c.id}
                        sx={{ cursor: 'pointer' }}
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button
                        size="small"
                        component={Link}
                        href={`/childrens-village/classes/${c.id}/roster`}
                        startIcon={<GroupIcon fontSize="small" />}
                      >
                        Roster
                      </Button>
                      <Button
                        size="small"
                        component={Link}
                        href={`/childrens-village/classes/${c.id}/timetable`}
                        startIcon={<ScheduleIcon fontSize="small" />}
                      >
                        Timetable
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <ResponsiveDialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>New Class</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {saveError && <Alert severity="error">{saveError}</Alert>}
            {academicYears.length === 0 && (
              <Alert severity="warning">
                No academic years exist yet — create one first under Academic Years.
              </Alert>
            )}
            <TextField
              select
              label="Academic Year"
              fullWidth
              value={form.academicYearId}
              onChange={(e) => setForm((f) => ({ ...f, academicYearId: e.target.value }))}
              disabled={academicYears.length === 0}
            >
              {academicYears.map((y) => (
                <MenuItem key={y.id} value={y.id}>{y.name}{y.isActive ? ' (Active)' : ''}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Class Name"
              placeholder="e.g. Functional Group-1"
              fullWidth
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Capacity"
                type="number"
                fullWidth
                value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
              />
              <TextField
                label="Age Group"
                placeholder="e.g. 3-5 yrs"
                fullWidth
                value={form.ageGroup}
                onChange={(e) => setForm((f) => ({ ...f, ageGroup: e.target.value }))}
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Disability Category"
                fullWidth
                value={form.disabilityCategory}
                onChange={(e) => setForm((f) => ({ ...f, disabilityCategory: e.target.value }))}
              />
              <TextField
                label="Room Number"
                fullWidth
                value={form.roomNumber}
                onChange={(e) => setForm((f) => ({ ...f, roomNumber: e.target.value }))}
              />
            </Stack>
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
          <Button variant="contained" onClick={submit} disabled={saving || academicYears.length === 0}>
            {saving ? <CircularProgress size={20} /> : 'Create'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
