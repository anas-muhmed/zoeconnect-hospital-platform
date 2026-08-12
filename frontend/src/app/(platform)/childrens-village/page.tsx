'use client';

import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import DashboardIcon from '@mui/icons-material/Dashboard';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ClassIcon from '@mui/icons-material/Class';
import GroupIcon from '@mui/icons-material/Group';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PieChartIcon from '@mui/icons-material/PieChart';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import LockIcon from '@mui/icons-material/Lock';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SchoolIcon from '@mui/icons-material/School';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

import PageHeader from '@/components/PageHeader';
import { apiClient } from '@/lib/api/client';

interface ClassCapacity {
  id: string;
  name: string;
  ageGroup: string | null;
  capacity: number;
  allocated: number;
}

interface CvDashboardStats {
  activeAcademicYear: { name: string; startDate: string; endDate: string } | null;
  totalClasses: number;
  totalStudents: number;
  totalCapacity: number;
  capacityUtilizationPercent: number;
  recentAdmissions30d: number;
  studentStatusBreakdown: Record<string, number>;
  admissionStatusBreakdown: Record<string, number>;
  genderBreakdown: Record<string, number>;
  ageGroupBreakdown: Record<string, number>;
  classCapacity: ClassCapacity[];
}

interface TimetablePeriod {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  subjectId: string;
  room: string | null;
  subject?: { name: string; category?: string } | null;
  timetable?: { cvClass?: { name?: string } | null } | null;
  isOverriddenForDate?: boolean;
}

interface PullOut {
  id: string;
  startTime: string;
  endTime: string;
  reason?: string | null;
  student?: { firstName?: string; lastName?: string } | null;
}

interface TeacherSchedule {
  date: string;
  dayOfWeek: string;
  isToday: boolean;
  isPast: boolean;
  regularPeriods: TimetablePeriod[];
  pullOuts: PullOut[];
  eicSessions: any[];
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: '#4caf50',
  INACTIVE: '#9e9e9e',
  SUSPENDED: '#f44336',
  GRADUATED: '#2196f3',
  PENDING: '#ff9800',
  APPROVED: '#4caf50',
  REJECTED: '#f44336',
  WAITLISTED: '#ff9800',
  UNSPECIFIED: '#9e9e9e',
};

const PIE_PALETTE = ['#3f51b5', '#00acc1', '#ff9800', '#8e24aa', '#4caf50', '#f44336'];

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const DAY_SHORT_LABELS: Record<string, string> = {
  SUNDAY: 'Sun', MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat',
};

function toChartData(breakdown: Record<string, number> | undefined) {
  if (!breakdown) return [];
  return Object.entries(breakdown).map(([name, value]) => ({ name, value }));
}

function toDateParam(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDays(d, diffToMonday);
}

function dayNameOf(d: Date): string {
  return DAY_NAMES[d.getDay()];
}

function formatTime(t?: string | null): string {
  if (!t) return '—';
  const [hStr, mStr] = t.split(':');
  const hour = parseInt(hStr, 10);
  if (Number.isNaN(hour)) return t;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${mStr} ${suffix}`;
}

function studentName(s?: { firstName?: string; lastName?: string } | null): string {
  if (!s) return 'Student';
  return [s.firstName, s.lastName].filter(Boolean).join(' ') || 'Student';
}

export default function ChildrensVillageDashboard() {
  const [stats, setStats] = useState<CvDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [schedule, setSchedule] = useState<TeacherSchedule | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [weekOverview, setWeekOverview] = useState<Record<string, number>>({});

  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ room: '', startTime: '', endTime: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingSavePeriodId, setPendingSavePeriodId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiClient.get<CvDashboardStats>('/childrens-village/analytics/dashboard')
      .then((res) => {
        if (mounted) setStats(res.data);
      })
      .catch(() => {
        if (mounted) setError('Failed to load dashboard data.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    setScheduleLoading(true);
    setScheduleError(null);
    apiClient.get<TeacherSchedule>('/childrens-village/teacher-workspace/schedule', {
      params: { date: toDateParam(selectedDate) },
    })
      .then((res) => {
        if (mounted) setSchedule(res.data);
      })
      .catch(() => {
        if (mounted) setScheduleError('Could not load your schedule for this day.');
      })
      .finally(() => {
        if (mounted) setScheduleLoading(false);
      });
    return () => { mounted = false; };
  }, [selectedDate]);

  useEffect(() => {
    let mounted = true;
    apiClient.get<Record<string, number>>('/childrens-village/teacher-workspace/schedule/week-overview')
      .then((res) => {
        if (mounted) setWeekOverview(res.data ?? {});
      })
      .catch(() => {
        if (mounted) setWeekOverview({});
      });
    return () => { mounted = false; };
  }, []);

  const weekDays = useMemo(() => {
    const monday = startOfWeek(selectedDate);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [selectedDate]);

  const selectedWeekdayLabel = selectedDate.toLocaleDateString(undefined, { weekday: 'long' });

  const isCurrentPeriod = (p: TimetablePeriod): boolean => {
    if (!schedule?.isToday) return false;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = p.startTime.split(':').map(Number);
    const [eh, em] = p.endTime.split(':').map(Number);
    return nowMins >= sh * 60 + sm && nowMins < eh * 60 + em;
  };

  const startEdit = (p: TimetablePeriod) => {
    setSaveError(null);
    setEditingPeriodId(p.id);
    setEditForm({
      room: p.room ?? '',
      startTime: p.startTime?.slice(0, 5) ?? '',
      endTime: p.endTime?.slice(0, 5) ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingPeriodId(null);
    setSaveError(null);
  };

  // Saving always asks the editor whether the change should apply to just
  // the day they're viewing, or to every future occurrence of that weekday
  // -- the scope-choice dialog below is what actually calls `commitEdit`.
  const saveEdit = (periodId: string) => {
    setPendingSavePeriodId(periodId);
  };

  const commitEdit = async (periodId: string, scope: 'THIS_DAY' | 'ALL_FUTURE') => {
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.patch(`/childrens-village/teacher-workspace/schedule/periods/${periodId}`, {
        date: toDateParam(selectedDate),
        scope,
        room: editForm.room,
        startTime: editForm.startTime ? `${editForm.startTime}:00` : undefined,
        endTime: editForm.endTime ? `${editForm.endTime}:00` : undefined,
      });
      const res = await apiClient.get<TeacherSchedule>('/childrens-village/teacher-workspace/schedule', {
        params: { date: toDateParam(selectedDate) },
      });
      setSchedule(res.data);
      setEditingPeriodId(null);
      setPendingSavePeriodId(null);
    } catch {
      setSaveError('Could not save this change. Please try again.');
      setPendingSavePeriodId(null);
    } finally {
      setSaving(false);
    }
  };

  const statCards = [
    {
      label: 'Active Academic Year',
      value: stats?.activeAcademicYear?.name ?? '—',
      icon: <CalendarTodayIcon sx={{ fontSize: 22 }} />,
    },
    {
      label: 'Total Classes',
      value: stats?.totalClasses ?? 0,
      icon: <ClassIcon sx={{ fontSize: 22 }} />,
    },
    {
      label: 'Total Students',
      value: stats?.totalStudents ?? 0,
      icon: <GroupIcon sx={{ fontSize: 22 }} />,
    },
    {
      label: 'Capacity Utilization',
      value: `${stats?.capacityUtilizationPercent ?? 0}%`,
      icon: <PieChartIcon sx={{ fontSize: 22 }} />,
    },
    {
      label: 'New Admissions (30d)',
      value: stats?.recentAdmissions30d ?? 0,
      icon: <PersonAddIcon sx={{ fontSize: 22 }} />,
    },
  ];

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Children's Village Dashboard" icon={<DashboardIcon />} />
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader title="Children's Village Dashboard" icon={<DashboardIcon />} />

      <Grid container spacing={3}>
        {statCards.map((card) => (
          <Grid item xs={12} sm={6} md={2.4} key={card.label}>
            <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Box sx={{ color: 'primary.main', display: 'flex' }}>{card.icon}</Box>
                <Typography variant="subtitle2" color="text.secondary">{card.label}</Typography>
              </Box>
              {loading ? (
                <Skeleton variant="text" width="60%" height={40} />
              ) : (
                <Typography variant="h5" fontWeight="bold">{card.value}</Typography>
              )}
            </Paper>
          </Grid>
        ))}

        {/* My timetable — today's schedule with inline edit, past days locked */}
        <Grid item xs={12}>
          <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SchoolIcon color="primary" />
                <Typography variant="subtitle1" fontWeight={600}>My Timetable</Typography>
                {schedule?.isToday && <Chip size="small" color="primary" label="Today" />}
                {schedule?.isPast && (
                  <Chip size="small" icon={<LockIcon sx={{ fontSize: 16 }} />} label="View only — past day" />
                )}
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <IconButton size="small" onClick={() => setSelectedDate((d) => addDays(d, -1))} aria-label="Previous day">
                  <ChevronLeftIcon />
                </IconButton>
                <Typography variant="body2" fontWeight={500} sx={{ minWidth: 150, textAlign: 'center' }}>
                  {selectedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </Typography>
                <IconButton size="small" onClick={() => setSelectedDate((d) => addDays(d, 1))} aria-label="Next day">
                  <ChevronRightIcon />
                </IconButton>
                <Tooltip title="Jump to today">
                  <IconButton size="small" onClick={() => setSelectedDate(new Date())} aria-label="Today">
                    <TodayIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            {/* Week-at-a-glance strip */}
            <Stack direction="row" spacing={1} sx={{ mb: 2.5, flexWrap: 'wrap' }}>
              {weekDays.map((d) => {
                const isSelected = toDateParam(d) === toDateParam(selectedDate);
                const count = weekOverview[dayNameOf(d)] ?? 0;
                return (
                  <Chip
                    key={toDateParam(d)}
                    onClick={() => setSelectedDate(d)}
                    color={isSelected ? 'primary' : 'default'}
                    variant={isSelected ? 'filled' : 'outlined'}
                    label={`${DAY_SHORT_LABELS[dayNameOf(d)]} ${d.getDate()} · ${count}`}
                    size="small"
                  />
                );
              })}
            </Stack>

            {scheduleError && <Alert severity="error" sx={{ mb: 2 }}>{scheduleError}</Alert>}
            {saveError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSaveError(null)}>{saveError}</Alert>}

            {scheduleLoading ? (
              <Skeleton variant="rectangular" height={160} />
            ) : (schedule?.regularPeriods?.length ?? 0) === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No periods scheduled for you on this day.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {schedule!.regularPeriods.map((p) => {
                  const editing = editingPeriodId === p.id;
                  const current = isCurrentPeriod(p);
                  return (
                    <Box
                      key={p.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        p: 1.5,
                        borderRadius: 2,
                        border: 1,
                        borderColor: current ? 'primary.main' : 'divider',
                        bgcolor: current ? 'primary.50' : 'transparent',
                      }}
                    >
                      <Box sx={{ minWidth: 130, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <AccessTimeIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                        {editing ? (
                          <Stack direction="row" spacing={0.5}>
                            <TextField
                              type="time"
                              size="small"
                              value={editForm.startTime}
                              onChange={(e) => setEditForm((f) => ({ ...f, startTime: e.target.value }))}
                              sx={{ width: 110 }}
                            />
                            <TextField
                              type="time"
                              size="small"
                              value={editForm.endTime}
                              onChange={(e) => setEditForm((f) => ({ ...f, endTime: e.target.value }))}
                              sx={{ width: 110 }}
                            />
                          </Stack>
                        ) : (
                          <Typography variant="body2">
                            {formatTime(p.startTime)} – {formatTime(p.endTime)}
                          </Typography>
                        )}
                      </Box>

                      <Divider orientation="vertical" flexItem />

                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" fontWeight={600}>
                            {p.subject?.name ?? 'Subject'}
                            {p.timetable?.cvClass?.name ? ` · ${p.timetable.cvClass.name}` : ''}
                          </Typography>
                          {p.isOverriddenForDate && (
                            <Tooltip title="This slot was changed for this day only — the recurring weekly schedule is unaffected">
                              <Chip size="small" variant="outlined" color="secondary" label="Changed for this day" />
                            </Tooltip>
                          )}
                        </Box>
                        {editing ? (
                          <TextField
                            size="small"
                            placeholder="Room"
                            value={editForm.room}
                            onChange={(e) => setEditForm((f) => ({ ...f, room: e.target.value }))}
                            sx={{ mt: 0.5, width: 160 }}
                          />
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            {p.room ? `Room ${p.room}` : 'No room assigned'}
                          </Typography>
                        )}
                      </Box>

                      {current && <Chip size="small" color="primary" label="Now" />}

                      {schedule?.isPast ? (
                        <Tooltip title="Past days are view-only">
                          <LockIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                        </Tooltip>
                      ) : editing ? (
                        <Stack direction="row" spacing={0.5}>
                          <IconButton size="small" color="primary" disabled={saving} onClick={() => saveEdit(p.id)}>
                            {saving ? <CircularProgress size={18} /> : <SaveIcon fontSize="small" />}
                          </IconButton>
                          <IconButton size="small" disabled={saving} onClick={cancelEdit}>
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      ) : (
                        <Tooltip title="Edit this slot">
                          <IconButton size="small" onClick={() => startEdit(p)} aria-label="Edit this slot">
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            )}

            {/* Pull-outs / therapy sessions for the day */}
            {(schedule?.pullOuts?.length ?? 0) > 0 && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                  Pull-outs & Therapy Sessions
                </Typography>
                <Stack spacing={1}>
                  {schedule!.pullOuts.map((po) => (
                    <Box key={po.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Chip size="small" label={`${formatTime(po.startTime)} – ${formatTime(po.endTime)}`} />
                      <Typography variant="body2">{studentName(po.student)}</Typography>
                      {po.reason && (
                        <Typography variant="caption" color="text.secondary">— {po.reason}</Typography>
                      )}
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}

            {(schedule?.eicSessions?.length ?? 0) > 0 && (
              <Box sx={{ mt: 2 }}>
                <Chip
                  size="small"
                  color="info"
                  variant="outlined"
                  label={`${schedule!.eicSessions.length} EIC therapy session(s) today`}
                />
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Student status breakdown */}
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3, height: 340 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Student Status</Typography>
            {loading ? (
              <Skeleton variant="rectangular" height={260} />
            ) : toChartData(stats?.studentStatusBreakdown).length === 0 ? (
              <Typography variant="body2" color="text.secondary">No student data yet.</Typography>
            ) : (
              <ResponsiveContainer width="100%" height="85%">
                <PieChart>
                  <Pie
                    data={toChartData(stats?.studentStatusBreakdown)}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {toChartData(stats?.studentStatusBreakdown).map((entry, idx) => (
                      <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? PIE_PALETTE[idx % PIE_PALETTE.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>

        {/* Admission status breakdown */}
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3, height: 340 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Admission Status</Typography>
            {loading ? (
              <Skeleton variant="rectangular" height={260} />
            ) : toChartData(stats?.admissionStatusBreakdown).length === 0 ? (
              <Typography variant="body2" color="text.secondary">No admissions recorded yet.</Typography>
            ) : (
              <ResponsiveContainer width="100%" height="85%">
                <BarChart data={toChartData(stats?.admissionStatusBreakdown)} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <RechartsTooltip />
                  <Bar dataKey="value" name="Students" radius={[4, 4, 0, 0]}>
                    {toChartData(stats?.admissionStatusBreakdown).map((entry, idx) => (
                      <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? PIE_PALETTE[idx % PIE_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>

        {/* Gender breakdown */}
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3, height: 340 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Gender Distribution</Typography>
            {loading ? (
              <Skeleton variant="rectangular" height={260} />
            ) : toChartData(stats?.genderBreakdown).length === 0 ? (
              <Typography variant="body2" color="text.secondary">No student data yet.</Typography>
            ) : (
              <ResponsiveContainer width="100%" height="85%">
                <PieChart>
                  <Pie
                    data={toChartData(stats?.genderBreakdown)}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {toChartData(stats?.genderBreakdown).map((entry, idx) => (
                      <Cell key={entry.name} fill={PIE_PALETTE[idx % PIE_PALETTE.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>

        {/* Class capacity utilization */}
        <Grid item xs={12} md={7}>
          <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>Class Capacity Utilization</Typography>
            {loading ? (
              <Skeleton variant="rectangular" height={200} />
            ) : (stats?.classCapacity?.length ?? 0) === 0 ? (
              <Typography variant="body2" color="text.secondary">No active classes yet.</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {stats!.classCapacity.map((c) => {
                  const pct = c.capacity > 0 ? Math.min(100, Math.round((c.allocated / c.capacity) * 100)) : 0;
                  return (
                    <Box key={c.id}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2" fontWeight={500}>
                          {c.name}{c.ageGroup ? ` · ${c.ageGroup}` : ''}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {c.allocated} / {c.capacity} ({pct}%)
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        color={pct >= 90 ? 'error' : pct >= 70 ? 'warning' : 'primary'}
                        sx={{ height: 8, borderRadius: 1 }}
                      />
                    </Box>
                  );
                })}
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Age group distribution */}
        <Grid item xs={12} md={5}>
          <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3, height: '100%' }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Age Group Distribution</Typography>
            {loading ? (
              <Skeleton variant="rectangular" height={220} />
            ) : toChartData(stats?.ageGroupBreakdown).length === 0 ? (
              <Typography variant="body2" color="text.secondary">No student data yet.</Typography>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={toChartData(stats?.ageGroupBreakdown)} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <RechartsTooltip />
                  <Bar dataKey="value" name="Students" fill="#3f51b5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>
      </Grid>

      <ResponsiveDialog open={!!pendingSavePeriodId} onClose={() => setPendingSavePeriodId(null)}>
        <DialogTitle>Apply this change to…</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Should this update only {selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })},
            or every future {selectedWeekdayLabel}?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={saving}
            onClick={() => pendingSavePeriodId && commitEdit(pendingSavePeriodId, 'THIS_DAY')}
          >
            Just this day
          </Button>
          <Button
            variant="contained"
            disabled={saving}
            onClick={() => pendingSavePeriodId && commitEdit(pendingSavePeriodId, 'ALL_FUTURE')}
          >
            Every future {selectedWeekdayLabel}
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
