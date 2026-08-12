'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SaveIcon from '@mui/icons-material/Save';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import EventNoteIcon from '@mui/icons-material/EventNote';
import SchoolIcon from '@mui/icons-material/School';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import HistoryIcon from '@mui/icons-material/History';

import {
  eicApi,
  type EicPreschoolEnrollment,
  type EicPreschoolAssessment,
  type EicPreschoolDailyReport,
} from '@/lib/api/eic.api';
import PageHeader from '@/components/PageHeader';


// ─── SRS-specific assessment fields ──────────────────────────────────────────
// Each item has an "inputType": 'ternary' = Yes/No/With Help, 'skill' = level scale

type FieldType = 'ternary' | 'skill';
interface AssessField { key: string; label: string; type: FieldType }

// FR-055
const LANGUAGE_FIELDS: AssessField[] = [
  { key: 'nameCallResponse',       label: 'Name-call response',                  type: 'ternary' },
  { key: 'instructionFollowing',   label: 'Instruction following',                type: 'ternary' },
  { key: 'meConcept',              label: '"Me" concept (self-identification)',    type: 'ternary' },
  { key: 'soundIdentification',    label: 'Sound identification',                  type: 'ternary' },
  { key: 'nonVerbalResponse',      label: 'Non-verbal communication response',     type: 'ternary' },
  { key: 'commonObjectPointing',   label: 'Common object pointing',               type: 'ternary' },
  { key: 'voiceSounds',            label: 'Voice sounds (vocalisation)',           type: 'ternary' },
  { key: 'voiceToGetAttention',    label: 'Voice to get attention',               type: 'ternary' },
];

// FR-056
const ADL_FIELDS: AssessField[] = [
  { key: 'eating',    label: 'Eating',    type: 'ternary' },
  { key: 'toileting', label: 'Toileting', type: 'ternary' },
  { key: 'brushing',  label: 'Brushing',  type: 'ternary' },
  { key: 'bathing',   label: 'Bathing',   type: 'ternary' },
  { key: 'dressing',  label: 'Dressing',  type: 'ternary' },
  { key: 'grooming',  label: 'Grooming',  type: 'ternary' },
];

// FR-057
const SOCIAL_FIELDS: AssessField[] = [
  { key: 'peerInteraction',      label: 'Peer interaction',                    type: 'ternary' },
  { key: 'touchResponse',        label: 'Touch response',                      type: 'ternary' },
  { key: 'personTracking',       label: 'Person-tracking',                     type: 'ternary' },
  { key: 'solitaryObjectPlay',   label: 'Solitary object play (2 mins)',        type: 'ternary' },
  { key: 'groupRolePlay',        label: 'Group role play',                      type: 'ternary' },
  { key: 'eyeContact',           label: 'Eye contact',                          type: 'ternary' },
  { key: 'sharing',              label: 'Sharing',                              type: 'ternary' },
];

// FR-058
const PRE_ACADEMIC_FIELDS: AssessField[] = [
  { key: 'pencilGrasp',   label: 'Pencil grasp',   type: 'ternary' },
  { key: 'scribble',      label: 'Scribble',        type: 'ternary' },
  { key: 'tripodGrasp',   label: 'Tripod grasp',    type: 'ternary' },
  { key: 'tracing',       label: 'Tracing',          type: 'ternary' },
];

// FR-059
const CONCEPT_FIELDS: AssessField[] = [
  { key: 'colourRed',          label: 'Colour — Red',                        type: 'ternary' },
  { key: 'colourGreen',        label: 'Colour — Green',                      type: 'ternary' },
  { key: 'colourYellow',       label: 'Colour — Yellow',                     type: 'ternary' },
  { key: 'colourBlack',        label: 'Colour — Black',                      type: 'ternary' },
  { key: 'colourBlue',         label: 'Colour — Blue',                       type: 'ternary' },
  { key: 'shapeCircle',        label: 'Shape — Circle',                      type: 'ternary' },
  { key: 'shapeTriangle',      label: 'Shape — Triangle',                    type: 'ternary' },
  { key: 'shapeSquare',        label: 'Shape — Square',                      type: 'ternary' },
  { key: 'bodyParts',          label: 'Body parts',                          type: 'ternary' },
  { key: 'familyMembers',      label: 'Family members',                      type: 'ternary' },
  { key: 'familiarObjects',    label: 'Familiar objects (fruits/animals/vehicles)', type: 'ternary' },
  { key: 'sizeComparisons',    label: 'Size comparisons (big/small)',         type: 'ternary' },
];

// Gross & Fine motor — skill scale (not in FR-055–059 but clinically relevant)
const GROSS_MOTOR_FIELDS: AssessField[] = [
  { key: 'balance',      label: 'Balance',       type: 'skill' },
  { key: 'coordination', label: 'Coordination',  type: 'skill' },
  { key: 'running',      label: 'Running',        type: 'skill' },
  { key: 'jumping',      label: 'Jumping',        type: 'skill' },
  { key: 'throwing',     label: 'Throwing',       type: 'skill' },
];

const FINE_MOTOR_FIELDS: AssessField[] = [
  { key: 'gripping',   label: 'Grip strength',  type: 'skill' },
  { key: 'cutting',    label: 'Cutting',         type: 'skill' },
  { key: 'drawing',    label: 'Drawing',         type: 'skill' },
  { key: 'beading',    label: 'Beading',          type: 'skill' },
  { key: 'handedness', label: 'Hand preference', type: 'skill' },
];

const DOMAIN_CONFIG: Array<{ key: string; label: string; fields: AssessField[] }> = [
  { key: 'languageCommunication',   label: 'Language & Communication (FR-055)', fields: LANGUAGE_FIELDS   },
  { key: 'adlSelfHelp',             label: 'ADL / Self-Help (FR-056)',          fields: ADL_FIELDS        },
  { key: 'socialEmotional',         label: 'Social Interaction (FR-057)',       fields: SOCIAL_FIELDS     },
  { key: 'preAcademic',             label: 'Pre-Academic Skills (FR-058)',      fields: PRE_ACADEMIC_FIELDS },
  { key: 'conceptualUnderstanding', label: 'Concept Recognition (FR-059)',      fields: CONCEPT_FIELDS    },
  { key: 'grossMotor',              label: 'Gross Motor',                       fields: GROSS_MOTOR_FIELDS },
  { key: 'fineMotor',               label: 'Fine Motor',                        fields: FINE_MOTOR_FIELDS  },
];

const TERNARY_OPTIONS = ['', 'YES', 'NO', 'WITH_HELP'];
const SKILL_OPTIONS   = ['', 'NOT_ASSESSED', 'EMERGING', 'DEVELOPING', 'ACHIEVED'];

const ADL_PERFORMANCE_KEYS = ['Eating', 'Drinking', 'Toilet', 'Hand washing', 'Shoes & socks', 'Bag management'];
const MOOD_OPTIONS         = ['CALM', 'ACTIVE', 'IRRITABLE', 'CRYING', 'NEEDED_SUPPORT'];
const ATTEND_OPTIONS       = ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY'];
const PARTICIPATE_OPTIONS  = ['FULL', 'PARTIAL', 'WITH_SUPPORT', 'REFUSED'];
const DAY_RATING_OPTIONS   = ['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'VERY_POOR'];

const ATTEND_COLOUR: Record<string, string> = {
  PRESENT:  '#4caf50',
  ABSENT:   '#f44336',
  LATE:     '#ff9800',
  HALF_DAY: '#2196f3',
};
const PARTICIPATE_COLOUR: Record<string, string> = {
  FULL:         '#4caf50',
  PARTIAL:      '#ff9800',
  WITH_SUPPORT: '#2196f3',
  REFUSED:      '#f44336',
};

function fmt(d: Date) { return d.toISOString().split('T')[0]; }

// ─── Assessment Domain Section ────────────────────────────────────────────────
function DomainSection({
  domainKey, label, fields, value, onChange, readOnly,
}: {
  domainKey: string;
  label: string;
  fields: AssessField[];
  value: Record<string, unknown>;
  onChange?: (key: string, field: string, sub: string, val: string) => void;
  readOnly?: boolean;
}) {
  // Compute completion %
  const filled = fields.filter((f) => {
    const cell = value[f.key] as Record<string, string> | undefined;
    return cell?.level && cell.level !== '';
  }).length;
  const pct = Math.round((filled / fields.length) * 100);

  return (
    <Accordion variant="outlined" sx={{ mb: 1 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, pr: 2 }}>
          <Typography fontWeight={600} sx={{ flex: 1 }}>{label}</Typography>
          <Box sx={{ width: 80 }}>
            <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3 }} />
          </Box>
          <Typography variant="caption" color="text.secondary">{pct}%</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 0 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
              <TableCell sx={{ width: '45%' }}>Skill / Item</TableCell>
              <TableCell sx={{ width: '25%' }}>
                {fields[0]?.type === 'ternary' ? 'Yes / No / With Help' : 'Level'}
              </TableCell>
              <TableCell>Remarks</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {fields.map((f) => {
              const cell = (value[f.key] as Record<string, string> | undefined) ?? {};
              const options = f.type === 'ternary' ? TERNARY_OPTIONS : SKILL_OPTIONS;
              return (
                <TableRow key={f.key} hover>
                  <TableCell>{f.label}</TableCell>
                  <TableCell>
                    <TextField
                      select size="small" fullWidth
                      value={cell.level ?? ''}
                      onChange={(e) => onChange?.(domainKey, f.key, 'level', e.target.value)}
                      disabled={readOnly}
                      sx={{
                        '& .MuiSelect-select': {
                          color: cell.level === 'YES' || cell.level === 'ACHIEVED'   ? 'success.main'
                               : cell.level === 'NO'  || cell.level === 'NOT_ASSESSED' ? 'error.main'
                               : cell.level === 'WITH_HELP' || cell.level === 'EMERGING' ? 'warning.main'
                               : 'inherit',
                          fontWeight: cell.level ? 600 : 400,
                        },
                      }}
                    >
                      {options.map((o) => (
                        <MenuItem key={o} value={o}>
                          {o === '' ? '—' : o.replace(/_/g, ' ')}
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small" fullWidth
                      placeholder="Optional remarks"
                      value={cell.remarks ?? ''}
                      onChange={(e) => onChange?.(domainKey, f.key, 'remarks', e.target.value)}
                      disabled={readOnly}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </AccordionDetails>
    </Accordion>
  );
}

// ─── Daily Report Dialog ──────────────────────────────────────────────────────
function DailyReportDialog({
  enrollId, date, existing, open, onClose, onSaved,
}: {
  enrollId: string;
  date: string;
  existing: EicPreschoolDailyReport | null;
  open: boolean;
  onClose: () => void;
  onSaved: (r: EicPreschoolDailyReport) => void;
}) {
  const [attendance,            setAttendance]            = useState(existing?.attendance           ?? 'PRESENT');
  const [moodOnArrival,         setMoodOnArrival]         = useState(existing?.moodOnArrival         ?? '');
  const [participationLevel,    setParticipationLevel]    = useState(existing?.participationLevel    ?? '');
  const [overallDayRating,      setOverallDayRating]      = useState(existing?.overallDayRating      ?? '');
  const [behaviourObservations, setBehaviourObservations] = useState(existing?.behaviourObservations ?? '');
  const [homePractice,          setHomePractice]          = useState(existing?.homePractice          ?? '');
  const [teacherRemarks,        setTeacherRemarks]        = useState(existing?.teacherRemarks        ?? '');
  const [curriculumActivities,  setCurriculumActivities]  = useState<Array<{ activity: string; participation: string; remarks: string }>>(
    existing?.curriculumActivities?.map((a) => ({ activity: a.activity, participation: a.participation, remarks: a.remarks ?? '' })) ?? [],
  );
  const [adlPerformance, setAdlPerformance] = useState<Record<string, string>>(existing?.adlPerformance ?? {});
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const addActivity    = () => setCurriculumActivities((p) => [...p, { activity: '', participation: 'FULL', remarks: '' }]);
  const removeActivity = (i: number) => setCurriculumActivities((p) => p.filter((_, idx) => idx !== i));
  const updateActivity = (i: number, field: string, val: string) =>
    setCurriculumActivities((p) => p.map((a, idx) => idx === i ? { ...a, [field]: val } : a));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await eicApi.submitDailyReport(enrollId, {
        reportDate:            date,
        attendance,
        moodOnArrival:         moodOnArrival        || null,
        participationLevel:    participationLevel    || null,
        overallDayRating:      overallDayRating      || null,
        behaviourObservations: behaviourObservations || null,
        homePractice:          homePractice          || null,
        teacherRemarks:        teacherRemarks        || null,
        curriculumActivities:  curriculumActivities.filter((a) => a.activity.trim()),
        adlPerformance,
      });
      onSaved(saved);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to save report');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Daily Report — {date}
        {existing && <Chip label="Editing existing" size="small" sx={{ ml: 1 }} />}
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Row 1: Attendance + Mood + Participation + Overall */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}>
            <TextField select label="Attendance *" size="small" fullWidth value={attendance} onChange={(e) => setAttendance(e.target.value)}>
              {ATTEND_OPTIONS.map((o) => <MenuItem key={o} value={o}>{o.replace('_', ' ')}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField select label="Mood & Regulation" size="small" fullWidth value={moodOnArrival} onChange={(e) => setMoodOnArrival(e.target.value)}>
              <MenuItem value="">—</MenuItem>
              {MOOD_OPTIONS.map((o) => <MenuItem key={o} value={o}>{o.replace(/_/g, ' ')}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField select label="Participation Level" size="small" fullWidth value={participationLevel} onChange={(e) => setParticipationLevel(e.target.value)}>
              <MenuItem value="">—</MenuItem>
              {PARTICIPATE_OPTIONS.map((o) => <MenuItem key={o} value={o}>{o.replace(/_/g, ' ')}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField select label="Overall Day Rating" size="small" fullWidth value={overallDayRating} onChange={(e) => setOverallDayRating(e.target.value)}>
              <MenuItem value="">—</MenuItem>
              {DAY_RATING_OPTIONS.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
            </TextField>
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }}><Typography variant="caption" color="text.secondary">CURRICULUM ACTIVITIES</Typography></Divider>

        {curriculumActivities.map((act, i) => (
          <Grid container spacing={1} sx={{ mb: 1 }} key={i} alignItems="center">
            <Grid item xs={12} sm={4}>
              <TextField label="Activity" size="small" fullWidth value={act.activity} onChange={(e) => updateActivity(i, 'activity', e.target.value)} placeholder="e.g. Block building" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField select label="Participation" size="small" fullWidth value={act.participation} onChange={(e) => updateActivity(i, 'participation', e.target.value)}>
                {PARTICIPATE_OPTIONS.map((o) => <MenuItem key={o} value={o}>{o.replace('_', ' ')}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField label="Remarks" size="small" fullWidth value={act.remarks} onChange={(e) => updateActivity(i, 'remarks', e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={1} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <IconButton size="small" color="error" onClick={() => removeActivity(i)}><DeleteOutlineIcon fontSize="small" /></IconButton>
            </Grid>
          </Grid>
        ))}
        <Button size="small" startIcon={<AddCircleIcon />} onClick={addActivity} sx={{ mb: 2 }}>Add Activity</Button>

        <Divider sx={{ my: 2 }}><Typography variant="caption" color="text.secondary">ADL PERFORMANCE</Typography></Divider>

        <Grid container spacing={1} sx={{ mb: 2 }}>
          {ADL_PERFORMANCE_KEYS.map((key) => (
            <Grid item xs={6} sm={4} key={key}>
              <TextField select label={key} size="small" fullWidth value={adlPerformance[key] ?? ''} onChange={(e) => setAdlPerformance((p) => ({ ...p, [key]: e.target.value }))}>
                <MenuItem value="">—</MenuItem>
                {['INDEPENDENT', 'WITH_VERBAL_PROMPT', 'WITH_PHYSICAL_PROMPT', 'TOTAL_ASSIST', 'REFUSED'].map((o) => (
                  <MenuItem key={o} value={o}>{o.replace(/_/g, ' ')}</MenuItem>
                ))}
              </TextField>
            </Grid>
          ))}
        </Grid>

        <Divider sx={{ my: 2 }}><Typography variant="caption" color="text.secondary">OBSERVATIONS & NOTES</Typography></Divider>

        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <TextField label="Behaviour Observations" size="small" fullWidth multiline rows={3} value={behaviourObservations} onChange={(e) => setBehaviourObservations(e.target.value)} />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField label="Home Practice" size="small" fullWidth multiline rows={3} value={homePractice} onChange={(e) => setHomePractice(e.target.value)} />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField label="Teacher Remarks" size="small" fullWidth multiline rows={3} value={teacherRemarks} onChange={(e) => setTeacherRemarks(e.target.value)} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} onClick={handleSave} disabled={saving}>
          Save Report
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ─── Attendance Register with participation trends ────────────────────────────
function AttendanceCalendar({ reports }: { reports: EicPreschoolDailyReport[] }) {
  const today     = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const reportMap: Record<string, EicPreschoolDailyReport> = {};
  reports.forEach((r) => { reportMap[r.reportDate] = r; });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay    = new Date(year, month, 1).getDay();
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const monthName   = new Date(year, month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month + delta);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const monthReports = reports.filter((r) => {
    const d = new Date(r.reportDate);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const presentCount  = monthReports.filter((r) => r.attendance === 'PRESENT').length;
  const absentCount   = monthReports.filter((r) => r.attendance === 'ABSENT').length;
  const fullPart      = monthReports.filter((r) => r.participationLevel === 'FULL').length;
  const partialPart   = monthReports.filter((r) => r.participationLevel === 'PARTIAL').length;
  const supportPart   = monthReports.filter((r) => r.participationLevel === 'WITH_SUPPORT').length;

  return (
    <Box>
      {/* Month nav */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <IconButton size="small" onClick={() => shiftMonth(-1)}><ChevronLeftIcon /></IconButton>
        <Typography fontWeight={600} sx={{ flex: 1, textAlign: 'center' }}>{monthName}</Typography>
        <IconButton size="small" onClick={() => shiftMonth(1)} disabled={year === today.getFullYear() && month >= today.getMonth()}>
          <ChevronRightIcon />
        </IconButton>
        <Tooltip title="Current month">
          <IconButton size="small" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }} aria-label="Current month">
            <TodayIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Summary row */}
      <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        <Chip label={`${presentCount} Present`}  size="small" sx={{ bgcolor: ATTEND_COLOUR.PRESENT,  color: '#fff' }} />
        <Chip label={`${absentCount} Absent`}    size="small" sx={{ bgcolor: ATTEND_COLOUR.ABSENT,   color: '#fff' }} />
        <Divider orientation="vertical" flexItem />
        <Chip label={`Full participation: ${fullPart}`}       size="small" sx={{ bgcolor: PARTICIPATE_COLOUR.FULL,         color: '#fff' }} />
        <Chip label={`Partial: ${partialPart}`}               size="small" sx={{ bgcolor: PARTICIPATE_COLOUR.PARTIAL,      color: '#fff' }} />
        <Chip label={`With support: ${supportPart}`}          size="small" sx={{ bgcolor: PARTICIPATE_COLOUR.WITH_SUPPORT, color: '#fff' }} />
      </Box>

      {/* Calendar grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <Box key={d} sx={{ textAlign: 'center', p: 0.5 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>{d}</Typography>
          </Box>
        ))}
        {cells.map((day, idx) => {
          if (!day) return <Box key={idx} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const report  = reportMap[dateStr];
          const colour  = report ? ATTEND_COLOUR[report.attendance] : undefined;
          const pColour = report?.participationLevel ? PARTICIPATE_COLOUR[report.participationLevel] : undefined;
          const isToday = dateStr === fmt(today);
          return (
            <Tooltip key={idx} title={report ? `${report.attendance}${report.participationLevel ? ' · ' + report.participationLevel.replace('_', ' ') : ''}${report.overallDayRating ? ' · ' + report.overallDayRating : ''}` : ''} arrow>
              <Box sx={{
                textAlign: 'center', p: '4px', borderRadius: 1,
                bgcolor: colour ?? 'grey.100',
                border: isToday ? '2px solid' : '1px solid',
                borderColor: isToday ? 'primary.main' : 'transparent',
                minHeight: 44,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <Typography variant="caption" fontWeight={isToday ? 700 : 400} sx={{ color: colour ? '#fff' : 'text.primary' }}>
                  {day}
                </Typography>
                {pColour && (
                  <Box sx={{ width: '70%', height: 4, borderRadius: 2, bgcolor: pColour, opacity: 0.9 }} />
                )}
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      {/* Legend */}
      <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
        {Object.entries(ATTEND_COLOUR).map(([k, c]) => (
          <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: c }} />
            <Typography variant="caption">{k.replace('_', ' ')}</Typography>
          </Box>
        ))}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'grey.300' }} />
          <Typography variant="caption">No record</Typography>
        </Box>
        <Divider orientation="vertical" flexItem />
        <Typography variant="caption" color="text.secondary">Bottom bar = participation level</Typography>
      </Box>
    </Box>
  );
}

// ─── Previous Assessment Reference Panel ──────────────────────────────────────
function AssessmentHistoryPanel({ history }: { history: EicPreschoolAssessment[] }) {
  if (history.length === 0) return null;
  return (
    <Box sx={{ mt: 3 }}>
      <Divider sx={{ mb: 2 }}>
        <Chip icon={<HistoryIcon />} label={`Previous Assessments (${history.length})`} size="small" variant="outlined" />
      </Divider>
      {history.map((a) => (
        <Accordion key={a.id} variant="outlined" sx={{ mb: 1, bgcolor: 'grey.50' }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={600} sx={{ flex: 1 }}>
              Assessment #{a.assessmentNumber} — {a.assessmentDate}
            </Typography>
            <Chip label={a.assessorName ?? 'Unknown'} size="small" variant="outlined" sx={{ mr: 1 }} />
            <Chip label="Historical" size="small" color="default" />
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Read-only reference — completed on {a.assessmentDate}
            </Typography>
            {DOMAIN_CONFIG.map(({ key, label, fields }) => (
              <DomainSection
                key={key}
                domainKey={key}
                label={label}
                fields={fields}
                value={(a as any)[key] ?? {}}
                readOnly
              />
            ))}
            {a.recommendations && (
              <Card variant="outlined" sx={{ mt: 1 }}>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={700} gutterBottom>Recommendations</Typography>
                  <Typography variant="body2" whiteSpace="pre-wrap">{a.recommendations}</Typography>
                </CardContent>
              </Card>
            )}
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PreschoolDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id     = params.id as string;

  const [tab,        setTab]        = useState(0);
  const [enrollment, setEnrollment] = useState<EicPreschoolEnrollment | null>(null);
  const [reports,    setReports]    = useState<EicPreschoolDailyReport[]>([]);
  const [history,    setHistory]    = useState<EicPreschoolAssessment[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  // Assessment state
  const [assessForm,      setAssessForm]      = useState<Record<string, Record<string, unknown>>>({});
  const [assessorName,    setAssessorName]    = useState('');
  const [assessmentDate,  setAssessmentDate]  = useState(fmt(new Date()));
  const [recommendations, setRecommendations] = useState('');
  const [goals,           setGoals]           = useState<Array<{ text: string; targetDate: string }>>([]);
  const [assessSaving,    setAssessSaving]    = useState(false);
  const [assessMsg,       setAssessMsg]       = useState<string | null>(null);
  const [assessErr,       setAssessErr]       = useState<string | null>(null);
  const [reassessing,     setReassessing]     = useState(false);
  const [confirmReassess, setConfirmReassess] = useState(false);

  // Daily report state
  const today = fmt(new Date());
  const [reportMonth,    setReportMonth]    = useState(today.slice(0, 7));
  const [reportDialog,   setReportDialog]   = useState(false);
  const [selectedDate,   setSelectedDate]   = useState(today);
  const [selectedReport, setSelectedReport] = useState<EicPreschoolDailyReport | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [enr, rList, hist] = await Promise.all([
        eicApi.getPreschoolEnrollment(id),
        eicApi.listDailyReports(id),
        eicApi.getAssessmentHistory(id),
      ]);
      setEnrollment(enr);
      setReports(rList);

      // History = all but current
      const pastAssessments = hist.filter((a) => !a.isCurrent);
      setHistory(pastAssessments);

      const current = hist.find((a) => a.isCurrent);
      if (current) {
        setAssessForm({
          languageCommunication:   (current as any).languageCommunication   ?? {},
          adlSelfHelp:             (current as any).adlSelfHelp             ?? {},
          socialEmotional:         (current as any).socialEmotional         ?? {},
          preAcademic:             (current as any).preAcademic             ?? {},
          conceptualUnderstanding: (current as any).conceptualUnderstanding ?? {},
          grossMotor:              (current as any).grossMotor              ?? {},
          fineMotor:               (current as any).fineMotor               ?? {},
        });
        setAssessorName(current.assessorName ?? '');
        setAssessmentDate(current.assessmentDate);
        setRecommendations(current.recommendations ?? '');
        setGoals(current.goals?.map((g) => ({ text: g.text, targetDate: g.targetDate ?? '' })) ?? []);
      }
    } catch {
      setError('Failed to load preschool enrollment');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDomainChange = (domain: string, skillKey: string, sub: string, val: string) => {
    setAssessForm((prev) => ({
      ...prev,
      [domain]: {
        ...prev[domain],
        [skillKey]: { ...((prev[domain]?.[skillKey] as Record<string, string>) ?? {}), [sub]: val },
      },
    }));
  };

  const handleSaveAssessment = async () => {
    setAssessSaving(true);
    setAssessErr(null);
    try {
      await eicApi.savePreschoolAssessment(id, {
        assessorName,
        assessmentDate,
        recommendations: recommendations || null,
        goals: goals.filter((g) => g.text.trim()).map((g) => ({ text: g.text, targetDate: g.targetDate || undefined })),
        ...assessForm,
      } as any);
      setAssessMsg('Assessment saved.');
      setTimeout(() => setAssessMsg(null), 3000);
    } catch (e: any) {
      setAssessErr(e?.response?.data?.message ?? 'Save failed');
    } finally {
      setAssessSaving(false);
    }
  };

  const handleStartReassessment = async () => {
    setReassessing(true);
    try {
      await eicApi.startReassessment(id);
      setConfirmReassess(false);
      // Reload so the new blank assessment and updated history appear
      setLoading(true);
      await loadData();
    } catch (e: any) {
      setAssessErr(e?.response?.data?.message ?? 'Failed to start reassessment');
    } finally {
      setReassessing(false);
    }
  };

  const openReportDialog = (date: string, existing: EicPreschoolDailyReport | null) => {
    setSelectedDate(date);
    setSelectedReport(existing);
    setReportDialog(true);
  };

  const handleReportSaved = (r: EicPreschoolDailyReport) => {
    setReports((prev) => {
      const idx = prev.findIndex((x) => x.reportDate === r.reportDate);
      if (idx >= 0) { const u = [...prev]; u[idx] = r; return u; }
      return [r, ...prev];
    });
  };

  const reportMap: Record<string, EicPreschoolDailyReport> = {};
  reports.forEach((r) => { reportMap[r.reportDate] = r; });
  const monthReports = reports.filter((r) => r.reportDate.startsWith(reportMonth));

  const shiftMonth = (delta: number) => {
    const [y, m] = reportMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta);
    setReportMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;
  if (error || !enrollment) return <Alert severity="error">{error ?? 'Not found'}</Alert>;

  const patient  = enrollment.patient;
  const ageLabel = patient?.ageYears != null ? `${patient.ageYears}y ${patient.ageMonths ?? 0}m` : '—';
  const currentAssessmentNumber = history.length > 0 ? Math.max(...history.map((a) => a.assessmentNumber)) + 1 : 1;

  return (
    <Box>
      {/* Header */}
            <PageHeader
        title={patient?.fullName ?? 'Student'}
        subtitle={patient?.mrn ? `MRN: ${patient.mrn}` : undefined}
        icon={<SchoolIcon />}
        back="/eic/preschool"
        breadcrumbs={[
          { label: 'EIC', href: '/eic' },
          { label: 'Preschool', href: '/eic/preschool' },
          { label: patient?.fullName ?? 'Student' },
        ]}
      />

      {/* Info bar */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent sx={{ py: '12px !important' }}>
          <Grid container spacing={3}>
            <Grid item><Typography variant="caption" color="text.secondary">Age</Typography><Typography variant="body2" fontWeight={500}>{ageLabel}</Typography></Grid>
            <Grid item><Typography variant="caption" color="text.secondary">Gender</Typography><Typography variant="body2" fontWeight={500}>{patient?.gender ?? '—'}</Typography></Grid>
            <Grid item><Typography variant="caption" color="text.secondary">Class / Group</Typography><Typography variant="body2" fontWeight={500}>{enrollment.classGroup ?? '—'}</Typography></Grid>
            <Grid item><Typography variant="caption" color="text.secondary">Teacher</Typography><Typography variant="body2" fontWeight={500}>{enrollment.teacherName ?? '—'}</Typography></Grid>
            <Grid item><Typography variant="caption" color="text.secondary">Admission</Typography><Typography variant="body2" fontWeight={500}>{enrollment.admissionDate}</Typography></Grid>
            <Grid item><Typography variant="caption" color="text.secondary">Total Sessions</Typography><Typography variant="body2" fontWeight={500}>{reports.length}</Typography></Grid>
          </Grid>
        </CardContent>
      </Card>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tab label={`Assessment #${currentAssessmentNumber}${history.length > 0 ? ` (${history.length} prev)` : ''}`} />
        <Tab label={`Daily Reports (${reports.length})`} icon={<EventNoteIcon />} iconPosition="start" />
        <Tab label="Attendance Register" icon={<CalendarMonthIcon />} iconPosition="start" />
      </Tabs>

      {/* ── Assessment tab ── */}
      {tab === 0 && (
        <Box>
          {assessMsg && <Alert severity="success" sx={{ mb: 2 }}>{assessMsg}</Alert>}
          {assessErr && <Alert severity="error"   sx={{ mb: 2 }}>{assessErr}</Alert>}

          {history.length > 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              This is <strong>Assessment #{currentAssessmentNumber}</strong>. Scroll down after saving to see all previous assessments for reference.
            </Alert>
          )}

          {/* Header fields */}
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>Assessment Details</Typography>
                {/* Reassessment button — only shown when assessment is saved */}
                <Tooltip title="Archive this assessment and start a new one (re-assessment)">
                  <Button
                    size="small" variant="outlined" color="warning"
                    startIcon={<RestartAltIcon />}
                    onClick={() => setConfirmReassess(true)}
                  >
                    Start Re-assessment
                  </Button>
                </Tooltip>
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField label="Assessor Name" size="small" fullWidth value={assessorName} onChange={(e) => setAssessorName(e.target.value)} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField label="Assessment Date" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} value={assessmentDate} onChange={(e) => setAssessmentDate(e.target.value)} />
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* SRS-specific domain sections */}
          {DOMAIN_CONFIG.map(({ key, label, fields }) => (
            <DomainSection key={key} domainKey={key} label={label} fields={fields} value={assessForm[key] ?? {}} onChange={handleDomainChange} />
          ))}

          {/* Recommendations */}
          <Card variant="outlined" sx={{ mt: 2, mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>Recommendations</Typography>
              <TextField multiline rows={4} fullWidth size="small" value={recommendations} onChange={(e) => setRecommendations(e.target.value)} placeholder="Programme recommendations, next period goals, parent guidance…" />
            </CardContent>
          </Card>

          {/* Goals */}
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>Goals</Typography>
                <Button size="small" startIcon={<AddCircleIcon />} onClick={() => setGoals((p) => [...p, { text: '', targetDate: '' }])}>Add Goal</Button>
              </Box>
              {goals.map((g, i) => (
                <Grid container spacing={1} key={i} sx={{ mb: 1 }} alignItems="center">
                  <Grid item xs={12} sm={7}>
                    <TextField label={`Goal ${i + 1}`} size="small" fullWidth value={g.text} onChange={(e) => setGoals((p) => p.map((x, idx) => idx === i ? { ...x, text: e.target.value } : x))} />
                  </Grid>
                  <Grid item xs={10} sm={4}>
                    <TextField label="Target Date" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }} value={g.targetDate} onChange={(e) => setGoals((p) => p.map((x, idx) => idx === i ? { ...x, targetDate: e.target.value } : x))} />
                  </Grid>
                  <Grid item xs={2} sm={1}>
                    <IconButton size="small" color="error" onClick={() => setGoals((p) => p.filter((_, idx) => idx !== i))}><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </Grid>
                </Grid>
              ))}
              {goals.length === 0 && <Typography variant="body2" color="text.secondary">No goals added yet.</Typography>}
            </CardContent>
          </Card>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" startIcon={assessSaving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} onClick={handleSaveAssessment} disabled={assessSaving}>
              Save Assessment
            </Button>
          </Box>

          {/* Previous assessments for reference */}
          <AssessmentHistoryPanel history={history} />
        </Box>
      )}

      {/* ── Daily Reports tab ── */}
      {tab === 1 && (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <IconButton size="small" onClick={() => shiftMonth(-1)}><ChevronLeftIcon /></IconButton>
            <Typography fontWeight={600} sx={{ flex: 1, textAlign: 'center' }}>
              {new Date(reportMonth + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </Typography>
            <IconButton size="small" onClick={() => shiftMonth(1)} disabled={reportMonth >= today.slice(0, 7)}><ChevronRightIcon /></IconButton>
            <Tooltip title="Current month"><IconButton size="small" onClick={() => setReportMonth(today.slice(0, 7))} aria-label="Current month"><TodayIcon fontSize="small" /></IconButton></Tooltip>
            <Button variant="contained" size="small" startIcon={<AddCircleIcon />} onClick={() => openReportDialog(today, reportMap[today] ?? null)}>
              Today&apos;s Report
            </Button>
          </Box>

          {monthReports.length === 0 ? (
            <Box sx={{ textAlign: 'center', mt: 4, color: 'text.secondary' }}>
              <EventNoteIcon sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
              <Typography>No daily reports for this month.</Typography>
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                    <TableCell>Date</TableCell>
                    <TableCell>Attendance</TableCell>
                    <TableCell>Mood</TableCell>
                    <TableCell>Participation</TableCell>
                    <TableCell>Day Rating</TableCell>
                    <TableCell>Activities</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {[...monthReports].sort((a, b) => b.reportDate.localeCompare(a.reportDate)).map((r) => (
                    <TableRow key={r.id} hover sx={{ cursor: 'pointer' }} onClick={() => openReportDialog(r.reportDate, r)}>
                      <TableCell>{r.reportDate}</TableCell>
                      <TableCell><Chip label={r.attendance} size="small" sx={{ bgcolor: ATTEND_COLOUR[r.attendance], color: '#fff' }} /></TableCell>
                      <TableCell>{r.moodOnArrival?.replace(/_/g, ' ') ?? '—'}</TableCell>
                      <TableCell>
                        {r.participationLevel
                          ? <Chip label={r.participationLevel.replace(/_/g, ' ')} size="small" sx={{ bgcolor: PARTICIPATE_COLOUR[r.participationLevel] ?? 'grey.300', color: '#fff' }} />
                          : '—'}
                      </TableCell>
                      <TableCell>{r.overallDayRating ?? '—'}</TableCell>
                      <TableCell>{r.curriculumActivities?.length ?? 0} logged</TableCell>
                      <TableCell><Typography variant="caption" color="primary">Edit</Typography></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <DailyReportDialog enrollId={id} date={selectedDate} existing={selectedReport} open={reportDialog} onClose={() => setReportDialog(false)} onSaved={handleReportSaved} />
        </Box>
      )}

      {/* ── Attendance Register tab ── */}
      {tab === 2 && <AttendanceCalendar reports={reports} />}

      {/* Reassessment confirmation dialog */}
      <ResponsiveDialog open={confirmReassess} onClose={() => setConfirmReassess(false)} maxWidth="xs">
        <DialogTitle>Start Re-assessment?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will archive the current assessment as historical and open a new blank assessment form.
            The previous assessment will remain visible below the new form for reference.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmReassess(false)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handleStartReassessment} disabled={reassessing}
            startIcon={reassessing ? <CircularProgress size={16} color="inherit" /> : <RestartAltIcon />}>
            Start Re-assessment
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
