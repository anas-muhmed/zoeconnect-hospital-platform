'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import NextLink from 'next/link';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

import AddIcon from '@mui/icons-material/Add';
import GroupIcon from '@mui/icons-material/Group';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';

import PageHeader from '@/components/PageHeader';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useDebounce } from '@/lib/hooks/useDebounce';

interface ClassSummary {
  id: string;
  name: string;
}

interface RosterEntry {
  allocationId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  registrationNumber: string | null;
  admissionStatus: string | null;
  startDate: string;
  status: string;
}

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  registrationNumber?: string | null;
  admissionStatus?: string | null;
}

export default function ClassRosterPage() {
  const params = useParams();
  const classId = params.id as string;
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission('CV:ALLOCATION:CREATE') || hasPermission('CV:ALLOCATION:UPDATE');

  const [classInfo, setClassInfo] = useState<ClassSummary | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addOptions, setAddOptions] = useState<StudentOption[]>([]);
  const [addLoading, setAddLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const debouncedAddQuery = useDebounce(addQuery, 350);

  const loadRoster = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      apiClient.get(`/childrens-village/classes/${classId}`),
      apiClient.get(`/childrens-village/classes/${classId}/roster`),
    ])
      .then(([classRes, rosterRes]) => {
        setClassInfo(classRes.data);
        setRoster(rosterRes.data ?? []);
      })
      .catch((err) => {
        console.error(err);
        setError(err?.response?.data?.message || 'Failed to load this class roster.');
      })
      .finally(() => setLoading(false));
  }, [classId]);

  useEffect(() => { loadRoster(); }, [loadRoster]);

  // Only students not already active in this class are worth offering --
  // exclude anyone who already shows up in the roster below.
  useEffect(() => {
    if (!addOpen) return;
    setAddLoading(true);
    apiClient.get('/childrens-village/students', {
      params: { q: debouncedAddQuery || undefined, status: 'ENROLLED', limit: 20 },
    })
      .then((res) => {
        const rosterIds = new Set(roster.map((r) => r.studentId));
        setAddOptions((res.data.items ?? []).filter((s: StudentOption) => !rosterIds.has(s.id)));
      })
      .catch(() => setAddOptions([]))
      .finally(() => setAddLoading(false));
  }, [addOpen, debouncedAddQuery, roster]);

  const openAddDialog = () => {
    setSelectedStudent(null);
    setAddQuery('');
    setSaveError('');
    setAddOpen(true);
  };

  const submitAdd = async () => {
    if (!selectedStudent) return;
    setSaving(true);
    setSaveError('');
    try {
      await apiClient.post(`/childrens-village/classes/${classId}/roster`, {
        studentId: selectedStudent.id,
      });
      setAddOpen(false);
      loadRoster();
    } catch (err: any) {
      setSaveError(err?.response?.data?.message || 'Could not add this student to the class.');
    } finally {
      setSaving(false);
    }
  };

  const removeStudent = async (studentId: string) => {
    setRemovingId(studentId);
    try {
      await apiClient.delete(`/childrens-village/classes/${classId}/roster/${studentId}`);
      setRoster((prev) => prev.filter((r) => r.studentId !== studentId));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not remove this student from the class.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 1 }}>
        <Link component={NextLink} href="/childrens-village/classes" underline="hover" color="inherit">
          Classes
        </Link>
        <Typography color="text.primary">{classInfo?.name ?? 'Roster'}</Typography>
      </Breadcrumbs>

      <PageHeader
        title={classInfo ? `${classInfo.name} — Roster` : 'Class Roster'}
        subtitle="Students currently enrolled in this class."
        icon={<GroupIcon />}
        actions={
          canManage ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openAddDialog}>
              Add Student
            </Button>
          ) : undefined
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : roster.length === 0 ? (
          <Box sx={{ textAlign: 'center', color: 'text.disabled', py: 6 }}>
            <Typography color="text.secondary">
              No students are enrolled in this class yet.
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell><b>Name</b></TableCell>
                  <TableCell><b>Reg No</b></TableCell>
                  <TableCell><b>Enrolled Since</b></TableCell>
                  {canManage && <TableCell align="right"><b>Actions</b></TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {roster.map((r) => (
                  <TableRow key={r.allocationId} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Avatar sx={{ bgcolor: 'primary.light', color: 'primary.dark', fontWeight: 700 }}>
                          {r.firstName[0]}{r.lastName[0]}
                        </Avatar>
                        <Typography variant="body2" fontWeight={600}>{r.firstName} {r.lastName}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {r.registrationNumber || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={r.startDate ? new Date(r.startDate).toLocaleDateString() : '-'}
                      />
                    </TableCell>
                    {canManage && (
                      <TableCell align="right">
                        <Tooltip title="Remove from class">
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              disabled={removingId === r.studentId}
                              onClick={() => removeStudent(r.studentId)}
                             aria-label="Remove from class">
                              {removingId === r.studentId
                                ? <CircularProgress size={16} />
                                : <PersonRemoveIcon fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <ResponsiveDialog open={addOpen} onClose={() => !saving && setAddOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add Student to Class</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
            <Autocomplete
              options={addOptions}
              loading={addLoading}
              value={selectedStudent}
              onChange={(_, value) => setSelectedStudent(value)}
              onInputChange={(_, value) => setAddQuery(value)}
              getOptionLabel={(o) => `${o.firstName} ${o.lastName}${o.registrationNumber ? ` (${o.registrationNumber})` : ''}`}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              renderInput={(inputParams) => (
                <TextField
                  {...inputParams}
                  label="Search enrolled students"
                  placeholder="Type a name or registration number..."
                  InputProps={{
                    ...inputParams.InputProps,
                    endAdornment: (
                      <>
                        {addLoading ? <CircularProgress size={16} /> : null}
                        {inputParams.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Only students with an approved (Enrolled) admission are shown. If someone's missing,
              check their admission status in the Student Directory.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={submitAdd} disabled={saving || !selectedStudent}>
            {saving ? <CircularProgress size={20} /> : 'Add to Class'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
