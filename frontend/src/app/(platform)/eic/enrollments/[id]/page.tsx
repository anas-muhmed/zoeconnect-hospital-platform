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
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import PersonIcon from '@mui/icons-material/Person';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import EventNoteIcon from '@mui/icons-material/EventNote';
import Autocomplete from '@mui/material/Autocomplete';

import AssignmentIcon from '@mui/icons-material/Assignment';
import LogoutIcon from '@mui/icons-material/Logout';

import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import {
  eicApi,
  type EicTherapyEnrollment,
  type EicAssessment,
  type EicGoal,
  type EicTeamMember,
  type EicTherapySession,
  type EicDiscipline,
  type EicProgressReport,
  type EicDischargeSummary,
  DISCIPLINE_LABELS,
} from '@/lib/api/eic.api';
import PageHeader from '@/components/PageHeader';


// ─── Types ────────────────────────────────────────────────────────────────────
type HisDoctor = {
  doctorCode: string;
  doctorName: string;
  specialization: string;
  departmentName: string;
  qualification: string | null;
};

// ─── Shared doctor autocomplete hook ─────────────────────────────────────────
function useDoctorOptions() {
  const [options,  setOptions]  = useState<HisDoctor[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [fetched,  setFetched]  = useState(false);

  const load = (q?: string) => {
    if (!fetched) { setFetched(true); setLoading(true); }
    eicApi.doctorsSuggest(q)
      .then(setOptions)
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  };

  return { options, loading, load };
}

// ─── Status colours ───────────────────────────────────────────────────────────
const ASSESS_COLOUR: Record<string, any> = {
  DRAFT:              'default',
  SUBMITTED:          'info',
  UNDER_REVIEW:       'warning',
  REVISION_REQUESTED: 'error',
  FINALISED:          'success',
};
const GOAL_COLOUR: Record<string, any> = {
  ACTIVE:       'success',
  ACHIEVED:     'info',
  DISCONTINUED: 'error',
};

// ─── Create Assessment Dialog ─────────────────────────────────────────────────
function CreateAssessmentDialog({
  enrollmentId,
  open,
  onClose,
  onCreated,
}: {
  enrollmentId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (a: EicAssessment) => void;
}) {
  const [discipline,    setDiscipline]    = useState<EicDiscipline | ''>('');
  const [selectedDoc,   setSelectedDoc]   = useState<HisDoctor | null>(null);
  const [inputValue,    setInputValue]    = useState('');
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const { options, loading, load }        = useDoctorOptions();

  // Load doctor list when dialog opens
  useEffect(() => { if (open) load(); }, [open]); // eslint-disable-line

  const handleCreate = async () => {
    if (!discipline || !selectedDoc) {
      setError('Discipline and therapist are required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await eicApi.createAssessment(enrollmentId, {
        discipline:    discipline as EicDiscipline,
        therapistId:   selectedDoc.doctorCode,
        therapistName: selectedDoc.doctorName,
      });
      onCreated(created);
      onClose();
      setDiscipline('');
      setSelectedDoc(null);
      setInputValue('');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to create assessment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>New Assessment</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField
          select label="Discipline *" fullWidth size="small" sx={{ mt: 1, mb: 2 }}
          value={discipline}
          onChange={(e) => setDiscipline(e.target.value as EicDiscipline)}
        >
          {(Object.entries(DISCIPLINE_LABELS) as [EicDiscipline, string][])
            .filter(([d]) => d !== 'PRESCHOOL')
            .map(([d, label]) => (
              <MenuItem key={d} value={d}>{label}</MenuItem>
            ))}
        </TextField>

        <Autocomplete<HisDoctor>
          options={options}
          loading={loading}
          value={selectedDoc}
          inputValue={inputValue}
          onInputChange={(_, v) => { setInputValue(v); load(v); }}
          onChange={(_, v) => setSelectedDoc(v)}
          getOptionLabel={(o) => o.doctorName}
          isOptionEqualToValue={(a, b) => a.doctorCode === b.doctorCode}
          noOptionsText={loading ? 'Loading…' : 'No doctors found'}
          renderOption={(props, o) => (
            <Box component="li" {...props} key={o.doctorCode}>
              <Box>
                <Typography variant="body2" fontWeight={600}>{o.doctorName}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {o.specialization} · {o.departmentName}
                  {o.qualification ? ` · ${o.qualification}` : ''}
                </Typography>
              </Box>
            </Box>
          )}
          renderInput={(params) => (
            <TextField {...params} label="Therapist *" size="small" fullWidth
              InputProps={{ ...params.InputProps,
                endAdornment: <>{loading && <CircularProgress size={14} />}{params.InputProps.endAdornment}</>,
              }}
            />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate} disabled={saving}>
          {saving ? <CircularProgress size={16} /> : 'Create'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ─── Assign Therapist Dialog ──────────────────────────────────────────────────
function AssignTherapistDialog({
  enrollmentId,
  open,
  onClose,
  onAssigned,
}: {
  enrollmentId: string;
  open: boolean;
  onClose: () => void;
  onAssigned: (m: EicTeamMember) => void;
}) {
  const [discipline,  setDiscipline]  = useState<EicDiscipline | ''>('');
  const [selectedDoc, setSelectedDoc] = useState<HisDoctor | null>(null);
  const [inputValue,  setInputValue]  = useState('');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const { options, loading, load }    = useDoctorOptions();

  useEffect(() => { if (open) load(); }, [open]); // eslint-disable-line

  const handleAssign = async () => {
    if (!discipline || !selectedDoc) {
      setError('All fields are required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const member = await eicApi.assignTherapist(enrollmentId, {
        discipline:    discipline as EicDiscipline,
        therapistId:   selectedDoc.doctorCode,
        therapistName: selectedDoc.doctorName,
      });
      onAssigned(member);
      onClose();
      setDiscipline('');
      setSelectedDoc(null);
      setInputValue('');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to assign therapist');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Assign Therapist</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField
          select label="Discipline *" fullWidth size="small" sx={{ mt: 1, mb: 2 }}
          value={discipline}
          onChange={(e) => setDiscipline(e.target.value as EicDiscipline)}
        >
          {(Object.entries(DISCIPLINE_LABELS) as [EicDiscipline, string][]).map(([d, label]) => (
            <MenuItem key={d} value={d}>{label}</MenuItem>
          ))}
        </TextField>

        <Autocomplete<HisDoctor>
          options={options}
          loading={loading}
          value={selectedDoc}
          inputValue={inputValue}
          onInputChange={(_, v) => { setInputValue(v); load(v); }}
          onChange={(_, v) => setSelectedDoc(v)}
          getOptionLabel={(o) => o.doctorName}
          isOptionEqualToValue={(a, b) => a.doctorCode === b.doctorCode}
          noOptionsText={loading ? 'Loading…' : 'No doctors found'}
          renderOption={(props, o) => (
            <Box component="li" {...props} key={o.doctorCode}>
              <Box>
                <Typography variant="body2" fontWeight={600}>{o.doctorName}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {o.specialization} · {o.departmentName}
                </Typography>
              </Box>
            </Box>
          )}
          renderInput={(params) => (
            <TextField {...params} label="Therapist *" size="small" fullWidth
              InputProps={{ ...params.InputProps,
                endAdornment: <>{loading && <CircularProgress size={14} />}{params.InputProps.endAdornment}</>,
              }}
            />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleAssign} disabled={saving}>
          {saving ? <CircularProgress size={16} /> : 'Assign'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}


// ─── Reassessment Dialog ──────────────────────────────────────────────────────
function ReassessDialog({
  parent,
  open,
  onClose,
  onCreated,
}: {
  parent: EicAssessment;
  open: boolean;
  onClose: () => void;
  onCreated: (parent: EicAssessment, therapistId: string, therapistName: string) => void;
}) {
  const [selectedDoc, setSelectedDoc] = useState<HisDoctor | null>(null);
  const [inputValue,  setInputValue]  = useState('');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const { options, loading, load }    = useDoctorOptions();

  useEffect(() => { if (open) load(); }, [open]); // eslint-disable-line

  const handleCreate = async () => {
    if (!selectedDoc) { setError('Select a therapist'); return; }
    setSaving(true);
    setError(null);
    try {
      onCreated(parent, selectedDoc.doctorCode, selectedDoc.doctorName);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Start Reassessment</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Alert severity="info" sx={{ mb: 2 }}>
          Starting a reassessment for <strong>{DISCIPLINE_LABELS[parent.discipline]}</strong>{' '}
          (linked to the finalised assessment).
        </Alert>
        <Autocomplete<HisDoctor>
          options={options}
          loading={loading}
          value={selectedDoc}
          inputValue={inputValue}
          onInputChange={(_, v) => { setInputValue(v); load(v); }}
          onChange={(_, v) => setSelectedDoc(v)}
          getOptionLabel={(o) => o.doctorName}
          isOptionEqualToValue={(a, b) => a.doctorCode === b.doctorCode}
          noOptionsText={loading ? 'Loading…' : 'No doctors found'}
          renderOption={(props, o) => (
            <Box component="li" {...props} key={o.doctorCode}>
              <Box>
                <Typography variant="body2" fontWeight={600}>{o.doctorName}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {o.specialization} · {o.departmentName}
                </Typography>
              </Box>
            </Box>
          )}
          renderInput={(params) => (
            <TextField {...params} label="Therapist *" size="small" fullWidth
              InputProps={{ ...params.InputProps,
                endAdornment: <>{loading && <CircularProgress size={14} />}{params.InputProps.endAdornment}</>,
              }}
            />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" startIcon={<ReplayIcon />} onClick={handleCreate} disabled={saving}>
          {saving ? <CircularProgress size={16} /> : 'Start Reassessment'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function EnrollmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id     = params.id as string;

  const [tab,         setTab]         = useState(0);
  const [enrollment,  setEnrollment]  = useState<EicTherapyEnrollment | null>(null);
  const [assessments, setAssessments] = useState<EicAssessment[]>([]);
  const [sessions,    setSessions]    = useState<EicTherapySession[]>([]);
  const [goals,       setGoals]       = useState<EicGoal[]>([]);
  const [team,        setTeam]        = useState<EicTeamMember[]>([]);
  const [reports,     setReports]     = useState<EicProgressReport[]>([]);
  const [discharge,   setDischarge]   = useState<EicDischargeSummary | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  const [assessDialog,   setAssessDialog]   = useState(false);
  const [reassessParent, setReassessParent] = useState<EicAssessment | null>(null);
  const [teamDialog,     setTeamDialog]     = useState(false);
  const [sessionDialog,  setSessionDialog]  = useState(false);
  const [reportDialog,   setReportDialog]   = useState(false);
  const [dischargeDialog, setDischargeDialog] = useState(false);
  const [newReportForm,  setNewReportForm]  = useState({ periodFrom: '', periodTo: '', preset: '3M' });
  const [newDischargeForm, setNewDischargeForm] = useState({ dischargeReason: '', dischargeDate: new Date().toISOString().split('T')[0] });
  const [reportSaving,   setReportSaving]   = useState(false);
  const [dischSaving,    setDischSaving]    = useState(false);
  const [reportError,    setReportError]    = useState<string | null>(null);
  const [dischError,     setDischError]     = useState<string | null>(null);
  const [newSessionForm, setNewSessionForm] = useState({
    discipline: '' as EicDiscipline | '',
    sessionDate: new Date().toISOString().split('T')[0],
    therapistName: '',
    durationMinutes: '',
    attendance: 'PRESENT',
  });
  const [creatingSess,      setCreatingSess]      = useState(false);
  const [sessError,         setSessError]         = useState<string | null>(null);
  const [sessSelectedDoc,   setSessSelectedDoc]   = useState<HisDoctor | null>(null);
  const [sessDocInput,      setSessDocInput]      = useState('');
  const { options: sessDocOptions, loading: sessDocLoading, load: loadSessDocs } = useDoctorOptions();

  const loadData = useCallback(async () => {
    try {
      const [enr, aList, sList, gList, tList, rList, disc] = await Promise.all([
        eicApi.getEnrollment(id),
        eicApi.listAssessments(id),
        eicApi.listSessions(id),
        eicApi.listGoals(id),
        eicApi.getEnrollmentTeam(id),
        eicApi.listProgressReports(id),
        eicApi.getDischargeByEnrollment(id).catch(() => null),
      ]);
      setEnrollment(enr);
      setAssessments(aList);
      setSessions(sList);
      setGoals(gList);
      setTeam(tList);
      setReports(rList);
      setDischarge(disc);
    } catch {
      setError('Failed to load enrollment');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const handleInitiateReport = async () => {
    if (!newReportForm.periodFrom || !newReportForm.periodTo) {
      setReportError('Period from and to are required'); return;
    }
    if (!enrollment) return;
    setReportSaving(true);
    setReportError(null);
    try {
      const r = await eicApi.initiateProgressReport(id, {
        ...newReportForm,
        disciplines: enrollment.activeDisciplines,
      });
      setReports((prev) => [r, ...prev]);
      setReportDialog(false);
      router.push(`/eic/progress-reports/${r.id}`);
    } catch (err: any) {
      setReportError(err?.response?.data?.message ?? 'Failed to initiate report');
    } finally {
      setReportSaving(false);
    }
  };

  const handleInitiateDischarge = async () => {
    if (!newDischargeForm.dischargeReason.trim() || !newDischargeForm.dischargeDate) {
      setDischError('Discharge reason and date are required'); return;
    }
    if (!enrollment) return;
    setDischSaving(true);
    setDischError(null);
    try {
      const d = await eicApi.initiateDischarge(id, {
        ...newDischargeForm,
        disciplines: enrollment.activeDisciplines,
      });
      setDischarge(d);
      setDischargeDialog(false);
      router.push(`/eic/discharge/${d.id}`);
    } catch (err: any) {
      setDischError(err?.response?.data?.message ?? 'Failed to initiate discharge');
    } finally {
      setDischSaving(false);
    }
  };

  const handleCreateSession = async () => {
    if (!newSessionForm.discipline || !sessSelectedDoc) {
      setSessError('Discipline and therapist are required'); return;
    }
    setCreatingSess(true);
    setSessError(null);
    try {
      const sess = await eicApi.createSession(id, {
        discipline:      newSessionForm.discipline as EicDiscipline,
        sessionDate:     newSessionForm.sessionDate,
        therapistId:     sessSelectedDoc.doctorCode,
        therapistName:   sessSelectedDoc.doctorName,
        durationMinutes: newSessionForm.durationMinutes ? Number(newSessionForm.durationMinutes) : undefined,
        attendance:      newSessionForm.attendance,
      });
      setSessions((prev) => [sess, ...prev]);
      setSessionDialog(false);
      router.push(`/eic/sessions/${sess.id}`);
    } catch (err: any) {
      setSessError(err?.response?.data?.message ?? 'Failed to create session');
    } finally {
      setCreatingSess(false);
    }
  };


  const handleReassess = async (parent: EicAssessment, therapistId: string, therapistName: string) => {
    try {
      const created = await eicApi.reassessTherapyAssessment(parent.id, { therapistId, therapistName });
      setAssessments((prev) => [created, ...prev]);
      setReassessParent(null);
      router.push(`/eic/assessments/${created.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to start reassessment');
    }
  };

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;
  if (error || !enrollment) return <Alert severity="error">{error ?? 'Not found'}</Alert>;

  const patient = enrollment.patient;

  return (
    <Box>
      {/* Header */}
            <PageHeader
        title={patient?.fullName ?? 'Enrollment'}
        subtitle={patient?.mrn ? `MRN: ${patient.mrn}` : undefined}
        icon={<AssignmentIndIcon />}
        back="/eic/patients"
        breadcrumbs={[
          { label: 'EIC', href: '/eic' },
          { label: 'Patients', href: '/eic/patients' },
          { label: patient?.fullName ?? 'Enrollment' },
        ]}
      />

      {/* Summary card */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent sx={{ py: '12px !important' }}>
          <Grid container spacing={3}>
            <Grid item>
              <Typography variant="caption" color="text.secondary">Admission Date</Typography>
              <Typography variant="body2" fontWeight={500}>{enrollment.admissionDate}</Typography>
            </Grid>
            <Grid item>
              <Typography variant="caption" color="text.secondary">Disciplines</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                {enrollment.activeDisciplines.map((d) => (
                  <Chip key={d} label={DISCIPLINE_LABELS[d]} size="small" />
                ))}
              </Box>
            </Grid>
            {enrollment.primaryDiagnosis && (
              <Grid item xs={12} sm="auto">
                <Typography variant="caption" color="text.secondary">Primary Diagnosis</Typography>
                <Typography variant="body2">{enrollment.primaryDiagnosis}</Typography>
              </Grid>
            )}
            {enrollment.referralSource && (
              <Grid item>
                <Typography variant="caption" color="text.secondary">Referral Source</Typography>
                <Typography variant="body2">{enrollment.referralSource}</Typography>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }} variant="scrollable" scrollButtons="auto">
        <Tab label={`Assessments (${assessments.length})`} />
        <Tab label={`Sessions (${sessions.length})`} icon={<EventNoteIcon />} iconPosition="start" />
        <Tab label={`Goals (${goals.filter((g) => g.status === 'ACTIVE').length} active)`} />
        <Tab label={`Team (${team.filter((t) => t.isActive).length})`} />
        <Tab label={`Reports (${reports.length})`} icon={<AssignmentIcon />} iconPosition="start" />
        <Tab label="Discharge" icon={<LogoutIcon />} iconPosition="start" />
      </Tabs>

      {/* ── Assessments ── */}
      {tab === 0 && (
        <Box>
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained" size="small"
              startIcon={<AddCircleIcon />}
              onClick={() => setAssessDialog(true)}
            >
              New Assessment
            </Button>
          </Box>

          {assessments.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
              No assessments yet. Create the initial assessment for each therapy discipline.
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                    <TableCell>Discipline</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Therapist</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {assessments.map((a) => (
                    <TableRow
                      key={a.id} hover sx={{ cursor: 'pointer' }}
                      onClick={() => router.push(`/eic/assessments/${a.id}`)}
                    >
                      <TableCell>
                        <Chip label={DISCIPLINE_LABELS[a.discipline]} size="small" />
                      </TableCell>
                      <TableCell>{a.assessmentType}</TableCell>
                      <TableCell>{a.therapistName}</TableCell>
                      <TableCell>
                        <Chip label={a.status} size="small" color={ASSESS_COLOUR[a.status]} />
                      </TableCell>
                      <TableCell>{new Date(a.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <OpenInNewIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                          {a.status === 'FINALISED' && (
                            <Tooltip title="Start Reassessment">
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={(e) => { e.stopPropagation(); setReassessParent(a); }}
                               aria-label="Start Reassessment">
                                <ReplayIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <CreateAssessmentDialog
            enrollmentId={id}
            open={assessDialog}
            onClose={() => setAssessDialog(false)}
            onCreated={(a) => setAssessments((prev) => [a, ...prev])}
          />

          {/* Reassessment dialog — reuses CreateAssessmentDialog but disciplines are locked to parent */}
          {reassessParent && (
            <ReassessDialog
              parent={reassessParent}
              open={!!reassessParent}
              onClose={() => setReassessParent(null)}
              onCreated={handleReassess}
            />
          )}
        </Box>
      )}

      {/* ── Sessions ── */}
      {tab === 1 && (
        <Box>
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained" size="small"
              startIcon={<AddCircleIcon />}
              onClick={() => setSessionDialog(true)}
            >
              Log Session
            </Button>
          </Box>

          {sessions.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
              No sessions logged yet.
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                    <TableCell>Date</TableCell>
                    <TableCell>Discipline</TableCell>
                    <TableCell>Therapist</TableCell>
                    <TableCell>Duration</TableCell>
                    <TableCell>Attendance</TableCell>
                    <TableCell>Entries</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow
                      key={s.id} hover sx={{ cursor: 'pointer' }}
                      onClick={() => router.push(`/eic/sessions/${s.id}`)}
                    >
                      <TableCell>{s.sessionDate}</TableCell>
                      <TableCell>
                        <Chip label={DISCIPLINE_LABELS[s.discipline]} size="small" />
                      </TableCell>
                      <TableCell>{s.therapistName}</TableCell>
                      <TableCell>{s.durationMinutes ? `${s.durationMinutes}m` : '—'}</TableCell>
                      <TableCell>{s.attendance}</TableCell>
                      <TableCell>{s.entries?.length ?? 0}</TableCell>
                      <TableCell>
                        <Chip
                          label={s.status} size="small"
                          color={({ DRAFT: 'warning', SUBMITTED: 'success', CANCELLED: 'error' } as any)[s.status] ?? 'default'}
                        />
                      </TableCell>
                      <TableCell>
                        <OpenInNewIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Create session dialog */}
          <ResponsiveDialog open={sessionDialog} onClose={() => setSessionDialog(false)} maxWidth="sm" fullWidth
            TransitionProps={{ onEnter: () => loadSessDocs() }}>
            <DialogTitle>Log New Session</DialogTitle>
            <DialogContent>
              {sessError && <Alert severity="error" sx={{ mb: 2 }}>{sessError}</Alert>}
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    select label="Discipline *" fullWidth size="small"
                    value={newSessionForm.discipline}
                    onChange={(e) => setNewSessionForm((p) => ({ ...p, discipline: e.target.value as EicDiscipline }))}
                  >
                    {enrollment.activeDisciplines.map((d) => (
                      <MenuItem key={d} value={d}>{DISCIPLINE_LABELS[d]}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Session Date *" type="date" fullWidth size="small"
                    InputLabelProps={{ shrink: true }}
                    value={newSessionForm.sessionDate}
                    inputProps={{ max: new Date().toISOString().split('T')[0] }}
                    onChange={(e) => setNewSessionForm((p) => ({ ...p, sessionDate: e.target.value }))}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Autocomplete<HisDoctor>
                    options={sessDocOptions}
                    loading={sessDocLoading}
                    value={sessSelectedDoc}
                    inputValue={sessDocInput}
                    onInputChange={(_, v) => { setSessDocInput(v); loadSessDocs(v); }}
                    onChange={(_, v) => setSessSelectedDoc(v)}
                    getOptionLabel={(o) => o.doctorName}
                    isOptionEqualToValue={(a, b) => a.doctorCode === b.doctorCode}
                    noOptionsText={sessDocLoading ? 'Loading…' : 'No doctors found'}
                    renderOption={(props, o) => (
                      <Box component="li" {...props} key={o.doctorCode}>
                        <Box>
                          <Typography variant="body2" fontWeight={600}>{o.doctorName}</Typography>
                          <Typography variant="caption" color="text.secondary">{o.specialization}</Typography>
                        </Box>
                      </Box>
                    )}
                    renderInput={(params) => (
                      <TextField {...params} label="Therapist *" size="small" fullWidth
                        InputProps={{ ...params.InputProps,
                          endAdornment: <>{sessDocLoading && <CircularProgress size={14} />}{params.InputProps.endAdornment}</>,
                        }}
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField
                    label="Duration (min)" type="number" fullWidth size="small"
                    value={newSessionForm.durationMinutes}
                    onChange={(e) => setNewSessionForm((p) => ({ ...p, durationMinutes: e.target.value }))}
                  />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField
                    select label="Attendance" fullWidth size="small"
                    value={newSessionForm.attendance}
                    onChange={(e) => setNewSessionForm((p) => ({ ...p, attendance: e.target.value }))}
                  >
                    {['PRESENT', 'ABSENT', 'LATE', 'CANCELLED'].map((v) => (
                      <MenuItem key={v} value={v}>{v}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSessionDialog(false)}>Cancel</Button>
              <Button variant="contained" onClick={handleCreateSession} disabled={creatingSess}>
                {creatingSess ? <CircularProgress size={16} /> : 'Create & Open'}
              </Button>
            </DialogActions>
          </ResponsiveDialog>
        </Box>
      )}

      {/* ── Goals ── */}
      {tab === 2 && (
        <Box>
          {goals.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
              Goals are created inside assessment forms.
            </Typography>
          ) : (
            <Box>
              {(['ACTIVE', 'ACHIEVED', 'DISCONTINUED'] as const).map((status) => {
                const subset = goals.filter((g) => g.status === status);
                if (subset.length === 0) return null;
                return (
                  <Box key={status} sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                      {status} ({subset.length})
                    </Typography>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                            <TableCell>Discipline</TableCell>
                            <TableCell>Type</TableCell>
                            <TableCell>Goal</TableCell>
                            <TableCell>Sessions</TableCell>
                            <TableCell>Target Date</TableCell>
                            <TableCell />
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {subset.map((g) => (
                            <TableRow key={g.id}>
                              <TableCell>
                                <Chip label={DISCIPLINE_LABELS[g.discipline]} size="small" />
                              </TableCell>
                              <TableCell>
                                <Typography variant="caption">{g.goalType}</Typography>
                              </TableCell>
                              <TableCell sx={{ maxWidth: 300 }}>
                                <Typography variant="body2">{g.goalText}</Typography>
                              </TableCell>
                              <TableCell>{g.sessionCount}</TableCell>
                              <TableCell>{g.targetDate ?? '—'}</TableCell>
                              <TableCell>
                                {g.status === 'ACTIVE' && (
                                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                                    <Tooltip title="Mark Achieved">
                                      <IconButton
                                        size="small" color="success"
                                        onClick={async () => {
                                          await eicApi.achieveGoal(g.id, '');
                                          setGoals((prev) =>
                                            prev.map((x) => x.id === g.id ? { ...x, status: 'ACHIEVED' } : x)
                                          );
                                        }}
                                       aria-label="Mark Achieved">
                                        <CheckCircleOutlineIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Discontinue">
                                      <IconButton
                                        size="small" color="error"
                                        onClick={async () => {
                                          await eicApi.discontinueGoal(g.id);
                                          setGoals((prev) =>
                                            prev.map((x) => x.id === g.id ? { ...x, status: 'DISCONTINUED' } : x)
                                          );
                                        }}
                                       aria-label="Discontinue">
                                        <CancelOutlinedIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  </Box>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      )}

      {/* ── Progress Reports ── */}
      {tab === 4 && (
        <Box>
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained" size="small"
              startIcon={<AddCircleIcon />}
              onClick={() => setReportDialog(true)}
            >
              New Progress Report
            </Button>
          </Box>

          {reports.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
              No progress reports yet. Use the button above to initiate a progress report (3-month, 6-month, annual, or custom period).
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                    <TableCell>#</TableCell>
                    <TableCell>Period</TableCell>
                    <TableCell>Sections</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Signed</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {reports.map((r) => (
                    <TableRow
                      key={r.id} hover sx={{ cursor: 'pointer' }}
                      onClick={() => router.push(`/eic/progress-reports/${r.id}`)}
                    >
                      <TableCell>{r.reportNumber}</TableCell>
                      <TableCell>{r.periodFrom} → {r.periodTo}</TableCell>
                      <TableCell>
                        {r.sections ? (
                          <>
                            {r.sections.filter((s) => s.status === 'SUBMITTED').length}/{r.sections.length} submitted
                          </>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={r.status} size="small"
                          color={({ IN_PROGRESS: 'warning', PENDING_SIGNATURE: 'info', SIGNED: 'success', PUBLISHED: 'success' } as any)[r.status] ?? 'default'}
                        />
                      </TableCell>
                      <TableCell>
                        {r.signatoryName ? `${r.signatoryName} · ${new Date(r.signedAt!).toLocaleDateString()}` : '—'}
                      </TableCell>
                      <TableCell>
                        <OpenInNewIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Initiate report dialog */}
          <ResponsiveDialog open={reportDialog} onClose={() => setReportDialog(false)} maxWidth="xs" fullWidth>
            <DialogTitle>Initiate Progress Report</DialogTitle>
            <DialogContent>
              {reportError && <Alert severity="error" sx={{ mb: 2 }}>{reportError}</Alert>}
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                {/* Period preset */}
                <Grid item xs={12}>
                  <TextField
                    select label="Report Period" fullWidth size="small"
                    value={newReportForm.preset}
                    onChange={(e) => {
                      const preset = e.target.value;
                      setNewReportForm((p) => {
                        const from = p.periodFrom;
                        let to = p.periodTo;
                        if (from && preset !== 'CUSTOM') {
                          const d = new Date(from);
                          if (preset === '3M')  d.setMonth(d.getMonth() + 3);
                          if (preset === '6M')  d.setMonth(d.getMonth() + 6);
                          if (preset === '1Y')  d.setFullYear(d.getFullYear() + 1);
                          // subtract 1 day so period is e.g. Jan 1 → Mar 31
                          d.setDate(d.getDate() - 1);
                          to = d.toISOString().split('T')[0];
                        }
                        return { ...p, preset, periodTo: to };
                      });
                    }}
                  >
                    <MenuItem value="3M">3 Months</MenuItem>
                    <MenuItem value="6M">6 Months</MenuItem>
                    <MenuItem value="1Y">1 Year (Annual)</MenuItem>
                    <MenuItem value="CUSTOM">Custom range</MenuItem>
                  </TextField>
                </Grid>

                {/* Period dates */}
                <Grid item xs={6}>
                  <TextField
                    label="Period From *" type="date" fullWidth size="small"
                    InputLabelProps={{ shrink: true }}
                    value={newReportForm.periodFrom}
                    onChange={(e) => {
                      const from = e.target.value;
                      setNewReportForm((p) => {
                        let to = p.periodTo;
                        if (from && p.preset !== 'CUSTOM') {
                          const d = new Date(from);
                          if (p.preset === '3M') d.setMonth(d.getMonth() + 3);
                          if (p.preset === '6M') d.setMonth(d.getMonth() + 6);
                          if (p.preset === '1Y') d.setFullYear(d.getFullYear() + 1);
                          d.setDate(d.getDate() - 1);
                          to = d.toISOString().split('T')[0];
                        }
                        return { ...p, periodFrom: from, periodTo: to };
                      });
                    }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label="Period To *" type="date" fullWidth size="small"
                    InputLabelProps={{ shrink: true }}
                    value={newReportForm.periodTo}
                    onChange={(e) => setNewReportForm((p) => ({ ...p, periodTo: e.target.value, preset: 'CUSTOM' }))}
                  />
                </Grid>
              </Grid>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Sections will be created for all active disciplines: {enrollment?.activeDisciplines.map((d) => DISCIPLINE_LABELS[d]).join(', ')}
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setReportDialog(false)}>Cancel</Button>
              <Button variant="contained" onClick={handleInitiateReport} disabled={reportSaving}>
                {reportSaving ? <CircularProgress size={16} /> : 'Initiate & Open'}
              </Button>
            </DialogActions>
          </ResponsiveDialog>
        </Box>
      )}

      {/* ── Discharge ── */}
      {tab === 5 && (
        <Box>
          {discharge ? (
            <Box>
              <Card variant="outlined" sx={{ mb: 2 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="subtitle2" fontWeight={700}>Discharge Summary</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Reason: {discharge.dischargeReason}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Date: {discharge.dischargeDate}
                      </Typography>
                      {discharge.signatoryName && (
                        <Typography variant="body2" color="text.secondary">
                          Signed by: {discharge.signatoryName} · {discharge.signatoryDesignation}
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip
                        label={discharge.status} size="small"
                        color={({ DRAFT: 'default', PENDING_SECTIONS: 'warning', PENDING_SIGNATURE: 'info', SIGNED: 'success' } as any)[discharge.status] ?? 'default'}
                      />
                      <Button
                        variant="outlined" size="small"
                        startIcon={<OpenInNewIcon />}
                        onClick={() => router.push(`/eic/discharge/${discharge.id}`)}
                      >
                        Open
                      </Button>
                    </Box>
                  </Box>
                  {discharge.sections && discharge.sections.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="caption" fontWeight={600}>Sections:</Typography>
                      <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                        {discharge.sections.map((s) => (
                          <Chip
                            key={s.id}
                            label={`${DISCIPLINE_LABELS[s.discipline]}: ${s.status}`}
                            size="small"
                            color={s.status === 'SUBMITTED' ? 'success' : 'default'}
                          />
                        ))}
                      </Box>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', mt: 4 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                No discharge summary initiated yet.
              </Typography>
              <Button
                variant="contained" color="warning"
                startIcon={<AddCircleIcon />}
                onClick={() => setDischargeDialog(true)}
                sx={{ mt: 1 }}
              >
                Initiate Discharge
              </Button>
            </Box>
          )}

          {/* Initiate discharge dialog */}
          <ResponsiveDialog open={dischargeDialog} onClose={() => setDischargeDialog(false)} maxWidth="xs" fullWidth>
            <DialogTitle>Initiate Discharge</DialogTitle>
            <DialogContent>
              {dischError && <Alert severity="error" sx={{ mb: 2 }}>{dischError}</Alert>}
              <TextField
                label="Discharge Reason *" fullWidth size="small" multiline rows={2}
                sx={{ mt: 1, mb: 2 }}
                value={newDischargeForm.dischargeReason}
                onChange={(e) => setNewDischargeForm((p) => ({ ...p, dischargeReason: e.target.value }))}
                placeholder="e.g. Goals achieved, family relocation, financial constraints…"
              />
              <TextField
                label="Discharge Date *" type="date" fullWidth size="small"
                InputLabelProps={{ shrink: true }}
                value={newDischargeForm.dischargeDate}
                onChange={(e) => setNewDischargeForm((p) => ({ ...p, dischargeDate: e.target.value }))}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Sections for all active disciplines will be created: {enrollment?.activeDisciplines.map((d) => DISCIPLINE_LABELS[d]).join(', ')}
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDischargeDialog(false)}>Cancel</Button>
              <Button variant="contained" color="warning" onClick={handleInitiateDischarge} disabled={dischSaving}>
                {dischSaving ? <CircularProgress size={16} /> : 'Initiate & Open'}
              </Button>
            </DialogActions>
          </ResponsiveDialog>
        </Box>
      )}

      {/* ── Team ── */}
      {tab === 3 && (
        <Box>
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained" size="small"
              startIcon={<AddCircleIcon />}
              onClick={() => setTeamDialog(true)}
            >
              Assign Therapist
            </Button>
          </Box>

          {team.filter((m) => m.isActive).length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
              No therapists assigned yet.
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                    <TableCell>Therapist</TableCell>
                    <TableCell>Discipline</TableCell>
                    <TableCell>Assigned</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {team.filter((m) => m.isActive).map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <PersonIcon fontSize="small" color="action" />
                          <Typography variant="body2">{m.therapistName}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip label={DISCIPLINE_LABELS[m.discipline]} size="small" />
                      </TableCell>
                      <TableCell>{new Date(m.assignedAt).toLocaleDateString()}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="Remove">
                          <IconButton
                            size="small" color="error"
                            onClick={async () => {
                              await eicApi.removeTherapist(id, m.id);
                              setTeam((prev) =>
                                prev.map((x) => x.id === m.id ? { ...x, isActive: false } : x)
                              );
                            }}
                           aria-label="Remove">
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <AssignTherapistDialog
            enrollmentId={id}
            open={teamDialog}
            onClose={() => setTeamDialog(false)}
            onAssigned={(m) => setTeam((prev) => [...prev, m])}
          />
        </Box>
      )}
    </Box>
  );
}
