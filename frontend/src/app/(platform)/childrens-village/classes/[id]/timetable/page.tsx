'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
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
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import CircularProgress from '@mui/material/CircularProgress';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from 'next/link';

import AddIcon from '@mui/icons-material/Add';
import ScheduleIcon from '@mui/icons-material/Schedule';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

import PageHeader from '@/components/PageHeader';

export default function ClassTimetablePage() {
  const params = useParams();
  const classId = params.id as string;

  const [timetable, setTimetable] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Mock data for dropdowns
  const subjects = [
    { id: 'sub-1', name: 'Mathematics' },
    { id: 'sub-2', name: 'Speech Therapy' },
    { id: 'sub-3', name: 'Occupational Therapy' },
    { id: 'sub-4', name: 'Art & Craft' },
    { id: 'sub-5', name: 'Physical Education' },
  ];

  const teachers = [
    { id: 'tch-1', name: 'Alice Smith' },
    { id: 'tch-2', name: 'Bob Johnson' },
    { id: 'tch-3', name: 'Charlie Davis' },
  ];

  const daysOfWeek = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

  // Add Period Form State
  const [showAddPeriod, setShowAddPeriod] = useState(false);
  const [periodForm, setPeriodForm] = useState({
    dayOfWeek: 'MONDAY',
    startTime: '08:00',
    endTime: '09:00',
    subjectId: '',
    teacherId: '',
    room: ''
  });

  useEffect(() => {
    // In a real app we'd fetch the specific timetable
    // setTimeout is just for mock delay
    setTimeout(() => {
      setTimetable({
        id: 'tt-mock-uuid',
        classId,
        periods: [
          { id: 'p1', dayOfWeek: 'MONDAY', startTime: '08:00', endTime: '09:00', subject: { name: 'Mathematics' }, room: 'Room 101' },
          { id: 'p2', dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '10:00', subject: { name: 'Art & Craft' }, room: 'Art Room' },
          { id: 'p3', dayOfWeek: 'TUESDAY', startTime: '08:00', endTime: '09:00', subject: { name: 'Physical Education' }, room: 'Gym' },
        ]
      });
      setLoading(false);
    }, 500);
  }, [classId]);

  const handleAddPeriod = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate API call
    const newPeriod = {
      id: Math.random().toString(),
      ...periodForm,
      subject: subjects.find(s => s.id === periodForm.subjectId)
    };

    setTimetable({
      ...timetable,
      periods: [...timetable.periods, newPeriod]
    });

    setShowAddPeriod(false);
    setPeriodForm({
      dayOfWeek: 'MONDAY',
      startTime: '08:00',
      endTime: '09:00',
      subjectId: '',
      teacherId: '',
      room: ''
    });
  };

  const timeSlots = ['08:00 - 09:00', '09:00 - 10:00', '10:00 - 11:00', '11:00 - 12:00', '13:00 - 14:00'];

  return (
    <Box sx={{ p: 3 }}>
      <Breadcrumbs
        separator={<NavigateNextIcon sx={{ fontSize: 13 }} />}
        sx={{ mb: 1.25 }}
      >
        <Link
          href="/childrens-village/classes"
          style={{ color: '#6B7899', fontSize: '0.8rem', fontWeight: 500, textDecoration: 'none' }}
        >
          Classes
        </Link>
        <Typography sx={{ fontSize: '0.8rem', color: '#3D4A66', fontWeight: 600 }}>
          Timetable
        </Typography>
      </Breadcrumbs>

      <PageHeader
        title="Class Timetable"
        icon={<ScheduleIcon />}
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setShowAddPeriod(true)}>
            Add Period
          </Button>
        }
      />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} />
        </Box>
      ) : (
        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell><b>Time</b></TableCell>
                  {daysOfWeek.map((day) => (
                    <TableCell key={day}><b>{day}</b></TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {timeSlots.map((timeSlot) => {
                  const startT = timeSlot.split(' - ')[0];
                  return (
                    <TableRow key={timeSlot}>
                      <TableCell sx={{ bgcolor: 'grey.50', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {timeSlot}
                      </TableCell>
                      {daysOfWeek.map((day) => {
                        const period = timetable?.periods?.find(
                          (p: any) => p.dayOfWeek === day && p.startTime.startsWith(startT)
                        );
                        return (
                          <TableCell key={day}>
                            {period ? (
                              <Box
                                sx={{
                                  bgcolor: 'primary.50',
                                  border: 1,
                                  borderColor: 'primary.100',
                                  borderRadius: 1,
                                  p: 1,
                                  textAlign: 'center',
                                }}
                              >
                                <Typography variant="body2" fontWeight={600} color="primary.dark">
                                  {period.subject?.name}
                                </Typography>
                                <Typography variant="caption" color="primary.main">
                                  {period.room}
                                </Typography>
                              </Box>
                            ) : (
                              <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center' }}>
                                -
                              </Typography>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Add Period Dialog */}
      <ResponsiveDialog open={showAddPeriod} onClose={() => setShowAddPeriod(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Timetable Period</DialogTitle>
        <Box component="form" onSubmit={handleAddPeriod}>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  select
                  label="Day"
                  fullWidth
                  size="small"
                  value={periodForm.dayOfWeek}
                  onChange={(e) => setPeriodForm({ ...periodForm, dayOfWeek: e.target.value })}
                >
                  {daysOfWeek.map((d) => (
                    <MenuItem key={d} value={d}>{d}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Room"
                  fullWidth
                  size="small"
                  value={periodForm.room}
                  onChange={(e) => setPeriodForm({ ...periodForm, room: e.target.value })}
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Start Time"
                  type="time"
                  fullWidth
                  size="small"
                  required
                  value={periodForm.startTime}
                  onChange={(e) => setPeriodForm({ ...periodForm, startTime: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="End Time"
                  type="time"
                  fullWidth
                  size="small"
                  required
                  value={periodForm.endTime}
                  onChange={(e) => setPeriodForm({ ...periodForm, endTime: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Box>

              <TextField
                select
                label="Subject"
                fullWidth
                size="small"
                required
                value={periodForm.subjectId}
                onChange={(e) => setPeriodForm({ ...periodForm, subjectId: e.target.value })}
              >
                <MenuItem value="">Select subject...</MenuItem>
                {subjects.map((s) => (
                  <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                ))}
              </TextField>

              <TextField
                select
                label="Teacher"
                fullWidth
                size="small"
                required
                value={periodForm.teacherId}
                onChange={(e) => setPeriodForm({ ...periodForm, teacherId: e.target.value })}
              >
                <MenuItem value="">Select teacher...</MenuItem>
                {teachers.map((t) => (
                  <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                ))}
              </TextField>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setShowAddPeriod(false)} color="inherit">
              Cancel
            </Button>
            <Button type="submit" variant="contained">
              Add Period
            </Button>
          </DialogActions>
        </Box>
      </ResponsiveDialog>
    </Box>
  );
}
