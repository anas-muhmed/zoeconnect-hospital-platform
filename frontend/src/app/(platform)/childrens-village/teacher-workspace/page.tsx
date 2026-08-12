"use client";

import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import AddIcon from '@mui/icons-material/Add';
import SendIcon from '@mui/icons-material/Send';
import { apiClient } from '@/lib/api/client';

interface RosterStudent {
  id: string;
  firstName: string;
  lastName: string;
  classId: string;
  className: string;
}

function todayParam(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function TeacherWorkspacePage() {
  const [activeTab, setActiveTab] = useState('dlr');

  // Real roster for the logged-in teacher's own classes (2026-08-03 fix) --
  // this used to be two hardcoded names ("Leo M.", "Mia T.") that never
  // reflected actual admissions. See cv-class.service.ts's
  // `getRosterForTeacher()` for how "this teacher's students" is resolved.
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    apiClient.get<RosterStudent[]>('/childrens-village/teacher-workspace/roster')
      .then((res) => { if (mounted) setRoster(res.data); })
      .catch(() => { if (mounted) setRosterError('Could not load your student roster.'); })
      .finally(() => { if (mounted) setRosterLoading(false); });
    return () => { mounted = false; };
  }, []);

  const [dlrForm, setDlrForm] = useState({
    studentId: '',
    mood: 'Happy',
    participation: 'Excellent',
    communication: 'Verbal',
    adlEating: 'Independent',
    adlToileting: '',
    behaviour: '',
    activities: '',
    attendanceStatus: 'PRESENT',
  });
  const [dlrSaving, setDlrSaving] = useState(false);
  const [dlrError, setDlrError] = useState<string | null>(null);
  const [dlrSuccess, setDlrSuccess] = useState(false);

  const handleDlrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dlrForm.studentId) {
      setDlrError('Select a student first.');
      return;
    }
    setDlrSaving(true);
    setDlrError(null);
    setDlrSuccess(false);
    try {
      await apiClient.post('/childrens-village/teacher-workspace/learning-records', {
        studentId: dlrForm.studentId,
        date: todayParam(),
        mood: dlrForm.mood,
        participation: dlrForm.participation,
        communication: dlrForm.communication,
        adlEating: dlrForm.adlEating,
        attendanceStatus: dlrForm.attendanceStatus,
      });
      setDlrSuccess(true);
    } catch (err: any) {
      setDlrError(err?.response?.data?.message ?? 'Could not save this record. Please try again.');
    } finally {
      setDlrSaving(false);
    }
  };

  // Bulk attendance status per roster student, keyed by studentId. Populated
  // once the roster loads; the "quick add" behaviour buttons and
  // curriculum/IEP cascade panels below are still placeholders -- wiring
  // those to real endpoints is a separate, larger pass (they'd need their
  // own data sources: curriculum objectives and active IEP goals per
  // student, neither of which this page fetches yet).
  const [attendanceStatuses, setAttendanceStatuses] = useState<Record<string, { status: string; remarks: string }>>({});
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [attendanceSuccess, setAttendanceSuccess] = useState(false);

  useEffect(() => {
    setAttendanceStatuses((prev) => {
      const next = { ...prev };
      roster.forEach((s) => {
        if (!next[s.id]) next[s.id] = { status: 'PRESENT', remarks: '' };
      });
      return next;
    });
  }, [roster]);

  const submitBulkAttendance = async () => {
    setAttendanceSaving(true);
    setAttendanceError(null);
    setAttendanceSuccess(false);
    try {
      await apiClient.post('/childrens-village/teacher-workspace/attendance/bulk', roster.map((s) => ({
        studentId: s.id,
        classId: s.classId,
        date: todayParam(),
        status: attendanceStatuses[s.id]?.status ?? 'PRESENT',
        remarks: attendanceStatuses[s.id]?.remarks || undefined,
      })));
      setAttendanceSuccess(true);
    } catch (err: any) {
      setAttendanceError(err?.response?.data?.message ?? 'Could not submit attendance. Please try again.');
    } finally {
      setAttendanceSaving(false);
    }
  };

  const schedule = [
    { time: '08:00', title: 'Morning Circle', sub: 'Class: Pre-K Group A', color: 'primary.main', highlight: false },
    { time: '09:00', title: 'Speech Therapy Pull-out', sub: 'Leo M.', color: 'secondary.main', highlight: true },
    { time: '10:00', title: 'Arts & Crafts', sub: 'Class: Pre-K Group A', color: 'success.main', highlight: false },
  ];

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}>

      {/* Left Sidebar (Timetable & Tasks) */}
      <Box sx={{ width: { xs: '100%', md: '33%' }, display: 'flex', flexDirection: 'column', gap: 3 }}>

        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 2, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
            Today&apos;s Schedule
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {schedule.map((item) => (
              <Box
                key={item.time}
                sx={{
                  display: 'flex',
                  borderLeft: 4,
                  borderColor: item.color,
                  pl: 1.5,
                  ...(item.highlight && { bgcolor: 'secondary.50', p: 1, borderRadius: '0 4px 4px 0' }),
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ width: 64, flexShrink: 0, color: item.highlight ? 'secondary.dark' : 'text.secondary', fontWeight: item.highlight ? 600 : 400 }}
                >
                  {item.time}
                </Typography>
                <Box>
                  <Typography variant="body2" fontWeight={600} color={item.highlight ? 'secondary.dark' : 'text.primary'}>
                    {item.title}
                  </Typography>
                  <Typography variant="caption" color={item.highlight ? 'secondary.dark' : 'text.secondary'}>
                    {item.sub}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Paper>

        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 1, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
            Pending Tasks
          </Typography>
          <Box>
            <FormControlLabel
              control={<Checkbox size="small" />}
              label={<Typography variant="body2">Review IEP Draft for Mia T.</Typography>}
              sx={{ display: 'flex', alignItems: 'flex-start', mt: 0.5 }}
            />
            <FormControlLabel
              control={<Checkbox size="small" />}
              label={<Typography variant="body2">Submit pending DLR for Noah R.</Typography>}
              sx={{ display: 'flex', alignItems: 'flex-start' }}
            />
          </Box>
        </Paper>
      </Box>

      {/* Main Content Area */}
      <Box sx={{ width: { xs: '100%', md: '67%' }, display: 'flex', flexDirection: 'column', gap: 3 }}>

        {/* Workspace Navigation Tabs */}
        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 0.5 }}>
          <Tabs
            value={activeTab}
            onChange={(_, val) => setActiveTab(val)}
            variant="fullWidth"
            sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40 } }}
          >
            <Tab value="dlr" label="DLR Entry" />
            <Tab value="attendance" label="Bulk Attendance" />
            <Tab value="diary" label="Parent Diary" />
          </Tabs>
        </Paper>

        {activeTab === 'attendance' && (
          <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
              Bulk Attendance Entry
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Quickly mark attendance for the whole class. Note: DLR entries automatically log attendance.
            </Typography>

            {rosterError && <Alert severity="error" sx={{ mb: 2 }}>{rosterError}</Alert>}
            {attendanceError && <Alert severity="error" sx={{ mb: 2 }}>{attendanceError}</Alert>}
            {attendanceSuccess && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setAttendanceSuccess(false)}>Attendance submitted.</Alert>}

            {rosterLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            ) : roster.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No students found in your classes yet. Once students are allocated to a class you teach, they&apos;ll appear here.
              </Typography>
            ) : (
              <>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.50' }}>
                        <TableCell><b>Student</b></TableCell>
                        <TableCell><b>Class</b></TableCell>
                        <TableCell><b>Status</b></TableCell>
                        <TableCell><b>Remarks</b></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {roster.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{s.firstName} {s.lastName}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">{s.className}</Typography>
                          </TableCell>
                          <TableCell>
                            <FormControl size="small" sx={{ minWidth: 160 }}>
                              <Select
                                value={attendanceStatuses[s.id]?.status ?? 'PRESENT'}
                                onChange={(e) => setAttendanceStatuses((prev) => ({
                                  ...prev,
                                  [s.id]: { ...prev[s.id], status: e.target.value, remarks: prev[s.id]?.remarks ?? '' },
                                }))}
                              >
                                <MenuItem value="PRESENT">PRESENT</MenuItem>
                                <MenuItem value="ABSENT">ABSENT</MenuItem>
                                <MenuItem value="THERAPY_SESSION">THERAPY_SESSION</MenuItem>
                              </Select>
                            </FormControl>
                          </TableCell>
                          <TableCell>
                            <TextField
                              size="small"
                              fullWidth
                              placeholder="Optional"
                              value={attendanceStatuses[s.id]?.remarks ?? ''}
                              onChange={(e) => setAttendanceStatuses((prev) => ({
                                ...prev,
                                [s.id]: { status: prev[s.id]?.status ?? 'PRESENT', remarks: e.target.value },
                              }))}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button variant="contained" onClick={submitBulkAttendance} disabled={attendanceSaving}>
                    {attendanceSaving ? <CircularProgress size={20} /> : 'Submit Attendance'}
                  </Button>
                </Box>
              </>
            )}
          </Paper>
        )}

        {activeTab === 'dlr' && (
          <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 3 }}>
              Daily Learning Record (DLR) Entry
            </Typography>

            {rosterError && <Alert severity="error" sx={{ mb: 2 }}>{rosterError}</Alert>}
            {dlrError && <Alert severity="error" sx={{ mb: 2 }}>{dlrError}</Alert>}
            {dlrSuccess && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setDlrSuccess(false)}>Record saved.</Alert>}

            <Box component="form" onSubmit={handleDlrSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Core Student Selection */}
              <Box
                sx={{
                  bgcolor: 'primary.50',
                  border: 1,
                  borderColor: 'primary.100',
                  borderRadius: 2,
                  p: 2,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 2,
                }}
              >
                <FormControl size="small" required>
                  <InputLabel id="student-label">Student</InputLabel>
                  <Select
                    labelId="student-label"
                    label="Student"
                    value={dlrForm.studentId}
                    onChange={(e) => setDlrForm({ ...dlrForm, studentId: e.target.value })}
                    disabled={rosterLoading}
                  >
                    <MenuItem value="">
                      {rosterLoading ? 'Loading roster…' : roster.length === 0 ? 'No students in your classes yet' : 'Select a student...'}
                    </MenuItem>
                    {roster.map((s) => (
                      <MenuItem key={s.id} value={s.id}>
                        {s.firstName} {s.lastName}{s.className ? ` — ${s.className}` : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small">
                  <InputLabel id="attendance-cascade-label">Attendance Cascade</InputLabel>
                  <Select
                    labelId="attendance-cascade-label"
                    label="Attendance Cascade"
                    value={dlrForm.attendanceStatus}
                    onChange={(e) => setDlrForm({ ...dlrForm, attendanceStatus: e.target.value })}
                  >
                    <MenuItem value="PRESENT">Present</MenuItem>
                    <MenuItem value="EXCUSED">Excused Late</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              {/* Development Modifiers */}
              <Box>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
                  Daily Observation
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, gap: 2 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="mood-label">Mood</InputLabel>
                    <Select
                      labelId="mood-label"
                      label="Mood"
                      value={dlrForm.mood}
                      onChange={(e) => setDlrForm({ ...dlrForm, mood: e.target.value })}
                    >
                      <MenuItem value="Happy">Happy</MenuItem>
                      <MenuItem value="Calm">Calm</MenuItem>
                      <MenuItem value="Anxious">Anxious</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl size="small" fullWidth>
                    <InputLabel id="participation-label">Participation</InputLabel>
                    <Select
                      labelId="participation-label"
                      label="Participation"
                      value={dlrForm.participation}
                      onChange={(e) => setDlrForm({ ...dlrForm, participation: e.target.value })}
                    >
                      <MenuItem value="Excellent">Excellent</MenuItem>
                      <MenuItem value="Good">Good</MenuItem>
                      <MenuItem value="Minimal">Minimal</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl size="small" fullWidth>
                    <InputLabel id="communication-label">Communication</InputLabel>
                    <Select
                      labelId="communication-label"
                      label="Communication"
                      value={dlrForm.communication}
                      onChange={(e) => setDlrForm({ ...dlrForm, communication: e.target.value })}
                    >
                      <MenuItem value="Verbal">Verbal</MenuItem>
                      <MenuItem value="Gestures">Gestures</MenuItem>
                      <MenuItem value="AAC">AAC</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl size="small" fullWidth>
                    <InputLabel id="adl-eating-label">ADL (Eating)</InputLabel>
                    <Select
                      labelId="adl-eating-label"
                      label="ADL (Eating)"
                      value={dlrForm.adlEating}
                      onChange={(e) => setDlrForm({ ...dlrForm, adlEating: e.target.value })}
                    >
                      <MenuItem value="Independent">Independent</MenuItem>
                      <MenuItem value="Prompted">Prompted</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              </Box>

              {/* Behavior Cascade */}
              <Box>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
                  Behaviour Tracking
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button size="small" variant="outlined" color="success" startIcon={<AddIcon />}>
                    Good Participation
                  </Button>
                  <Button size="small" variant="outlined" color="success" startIcon={<AddIcon />}>
                    Completed Task
                  </Button>
                  <Button size="small" variant="outlined" color="error" startIcon={<AddIcon />}>
                    Log Incident
                  </Button>
                </Box>
              </Box>

              {/* Curriculum Cascade */}
              {dlrForm.studentId && (
                <Box sx={{ bgcolor: 'warning.50', border: 1, borderColor: 'warning.200', borderRadius: 2, p: 2 }}>
                  <Typography variant="subtitle2" fontWeight={700} color="warning.dark" sx={{ mb: 2 }}>
                    Curriculum Progress (Grade 1)
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box
                      sx={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1, p: 1,
                      }}
                    >
                      <Typography variant="body2">MATH-1.1: Counting 1-20</Typography>
                      <FormControl size="small">
                        <Select defaultValue="Practicing">
                          <MenuItem value="Practicing">Practicing</MenuItem>
                          <MenuItem value="Emerging">Emerging</MenuItem>
                          <MenuItem value="Achieved">Achieved</MenuItem>
                        </Select>
                      </FormControl>
                    </Box>
                  </Box>
                </Box>
              )}

              {/* IEP Cascade */}
              {dlrForm.studentId && (
                <Box sx={{ bgcolor: 'secondary.50', border: 1, borderColor: 'secondary.200', borderRadius: 2, p: 2 }}>
                  <Typography variant="subtitle2" fontWeight={700} color="secondary.dark" sx={{ mb: 2 }}>
                    Active IEP Goals (v2.0)
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box
                      sx={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2,
                        bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1, p: 1,
                      }}
                    >
                      <Typography variant="body2" sx={{ width: '66%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        COMM-1: Use 3-word sentences
                      </Typography>
                      <FormControl size="small">
                        <Select defaultValue="In Progress">
                          <MenuItem value="In Progress">In Progress</MenuItem>
                          <MenuItem value="Achieved">Achieved</MenuItem>
                        </Select>
                      </FormControl>
                    </Box>
                    <TextField size="small" fullWidth placeholder="Goal review notes (auto-syncs to IEP)" />
                  </Box>
                </Box>
              )}

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 2, borderTop: 1, borderColor: 'divider' }}>
                <Button type="submit" variant="contained" disabled={dlrSaving}>
                  {dlrSaving ? <CircularProgress size={20} /> : 'Save & Cascade Updates'}
                </Button>
              </Box>
            </Box>
          </Paper>
        )}

        {activeTab === 'diary' && (
          <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3, height: 384, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
              Parent Communication Diary
            </Typography>
            <Box sx={{ flex: 1, bgcolor: 'grey.50', border: 1, borderColor: 'divider', borderRadius: 1, p: 2, mb: 2, overflowY: 'auto' }}>
              <Box sx={{ bgcolor: 'primary.100', p: 1.5, borderRadius: 2, borderBottomLeftRadius: 0, maxWidth: 320, mb: 2 }}>
                <Typography variant="body2" color="primary.dark">
                  Leo had a great day today! He participated well in morning circle.
                </Typography>
                <Typography variant="caption" color="primary.dark" sx={{ mt: 0.5, display: 'block' }}>
                  Teacher • 10:00 AM
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField size="small" fullWidth placeholder="Send a message to parents (One-way)..." />
              <Button variant="contained" endIcon={<SendIcon />}>
                Send
              </Button>
            </Box>
          </Paper>
        )}

      </Box>
    </Box>
  );
}
