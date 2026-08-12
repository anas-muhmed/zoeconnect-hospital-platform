'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import SendIcon from '@mui/icons-material/Send';
import VerifiedIcon from '@mui/icons-material/Verified';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EventBusyIcon from '@mui/icons-material/EventBusy';

import {
  eicApi,
  type EicAssessment,
  type EicGoal,
  type EicGoalType,
  type EicDiscipline,
  DISCIPLINE_LABELS,
} from '@/lib/api/eic.api';
import { useAuthStore } from '@/lib/store/auth.store';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PageHeader from '@/components/PageHeader';
import ResponsiveTable from '@/components/ResponsiveTable';

// ─── Discipline-specific field schemas ────────────────────────────────────────
type FieldDef = { key: string; label: string; multiline?: boolean };

const BACKGROUND_FIELDS: Record<EicDiscipline | 'default', FieldDef[]> = {
  BT: [
    { key: 'referralReason',       label: 'Reason for Referral',       multiline: true },
    { key: 'primaryConcern',       label: "Parent's Primary Concern",   multiline: true },
    { key: 'behaviouralHistory',   label: 'Behavioural History',        multiline: true },
    { key: 'previousBTTherapy',    label: 'Previous BT Therapy',        multiline: true },
    { key: 'familyStructure',      label: 'Family Structure / Support', multiline: true },
  ],
  SLP: [
    { key: 'communicationConcern', label: 'Communication Concern',      multiline: true },
    { key: 'languageHistory',      label: 'Language Development History', multiline: true },
    { key: 'feedingHistory',       label: 'Feeding / Swallowing History', multiline: true },
    { key: 'hearingHistory',       label: 'Hearing History',            multiline: true },
    { key: 'previousSLPTherapy',   label: 'Previous SLP Therapy',       multiline: true },
  ],
  DT: [
    { key: 'referralReason',       label: 'Reason for Referral',        multiline: true },
    { key: 'developmentalConcern', label: 'Developmental Concern',      multiline: true },
    { key: 'previousIntervention', label: 'Previous Intervention',      multiline: true },
    { key: 'homeEnvironment',      label: 'Home Environment',           multiline: true },
  ],
  OT: [
    { key: 'referralReason',       label: 'Reason for Referral',        multiline: true },
    { key: 'sensoryHistory',       label: 'Sensory Processing History', multiline: true },
    { key: 'selfCareHistory',      label: 'Self-Care / ADL History',    multiline: true },
    { key: 'previousOTTherapy',    label: 'Previous OT Therapy',        multiline: true },
  ],
  SE: [
    { key: 'educationalHistory',   label: 'Educational History',        multiline: true },
    { key: 'previousPlacement',    label: 'Previous School Placement',  multiline: true },
    { key: 'learningConcerns',     label: 'Learning Concerns',          multiline: true },
  ],
  PRESCHOOL: [
    { key: 'referralReason',       label: 'Reason for Referral',        multiline: true },
  ],
  default: [
    { key: 'referralReason',       label: 'Reason for Referral',        multiline: true },
    { key: 'history',              label: 'Relevant History',           multiline: true },
  ],
};

const CLINICAL_OBS_FIELDS: Record<EicDiscipline | 'default', FieldDef[]> = {
  BT: [
    { key: 'attention',               label: 'Attention & Sitting Tolerance', multiline: true },
    { key: 'compliance',              label: 'Compliance & Instruction Following', multiline: true },
    { key: 'playBehaviour',           label: 'Play Behaviour',               multiline: true },
    { key: 'imitation',               label: 'Imitation Skills',             multiline: true },
    { key: 'repetitiveBehaviours',    label: 'Repetitive Behaviours / SIBs', multiline: true },
    { key: 'socialInteraction',       label: 'Social Interaction',           multiline: true },
    { key: 'communication',           label: 'Communication (functional)',   multiline: true },
  ],
  SLP: [
    { key: 'oralMotor',               label: 'Oral Motor Function',          multiline: true },
    { key: 'receptiveLanguage',       label: 'Receptive Language',           multiline: true },
    { key: 'expressiveLanguage',      label: 'Expressive Language',          multiline: true },
    { key: 'pragmatics',              label: 'Pragmatic / Social Language',  multiline: true },
    { key: 'articulation',            label: 'Articulation / Phonology',     multiline: true },
    { key: 'fluency',                 label: 'Fluency',                      multiline: true },
    { key: 'voice',                   label: 'Voice',                        multiline: true },
  ],
  DT: [
    { key: 'cognitive',               label: 'Cognitive Development',        multiline: true },
    { key: 'grossMotor',              label: 'Gross Motor Skills',           multiline: true },
    { key: 'fineMotor',               label: 'Fine Motor Skills',            multiline: true },
    { key: 'socialEmotional',         label: 'Social-Emotional Development', multiline: true },
    { key: 'adaptive',                label: 'Adaptive Behaviour',           multiline: true },
    { key: 'play',                    label: 'Play Skills',                  multiline: true },
  ],
  OT: [
    { key: 'sensoryProcessing',       label: 'Sensory Processing',           multiline: true },
    { key: 'fineMotorSkills',         label: 'Fine Motor Skills',            multiline: true },
    { key: 'grossMotorSkills',        label: 'Gross Motor Skills',           multiline: true },
    { key: 'visualMotorIntegration',  label: 'Visual-Motor Integration',     multiline: true },
    { key: 'dailyLivingSkills',       label: 'Daily Living Skills (ADL)',    multiline: true },
    { key: 'handwriting',             label: 'Handwriting / Graphomotor',    multiline: true },
  ],
  SE: [
    { key: 'preAcademic',             label: 'Pre-Academic Skills',          multiline: true },
    { key: 'academicSkills',          label: 'Academic Skills',              multiline: true },
    { key: 'attention',               label: 'Attention & Executive Function', multiline: true },
    { key: 'behaviour',               label: 'Classroom Behaviour',          multiline: true },
    { key: 'socialSkills',            label: 'Social Skills',                multiline: true },
  ],
  PRESCHOOL: [
    { key: 'generalObservations',     label: 'General Observations',         multiline: true },
  ],
  default: [
    { key: 'generalObservations',     label: 'General Observations',         multiline: true },
  ],
};

// ─── Generic section editor ───────────────────────────────────────────────────
function JsonbSection({
  title,
  fields,
  data,
  onChange,
}: {
  title: string;
  fields: FieldDef[];
  data: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
}) {
  return (
    <Accordion defaultExpanded>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography fontWeight={600}>{title}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Grid container spacing={2}>
          {fields.map((f) => (
            <Grid item xs={12} sm={6} md={4} key={f.key}>
              <TextField
                label={f.label}
                size="small"
                fullWidth
                multiline={f.multiline}
                minRows={f.multiline ? 3 : 1}
                maxRows={f.multiline ? 5 : 1}
                value={(data[f.key] as string) ?? ''}
                onChange={(e) => onChange({ ...data, [f.key]: e.target.value || undefined })}
                inputProps={f.multiline ? { style: { overflowY: 'auto', resize: 'none' } } : undefined}
              />
            </Grid>
          ))}
        </Grid>
      </AccordionDetails>
    </Accordion>
  );
}

// ─── Assessment Tool Scores section ──────────────────────────────────────────
function ToolScoresSection({
  scores,
  onChange,
}: {
  scores: Array<{ tool: string; score: string | number; interpretation: string }>;
  onChange: (s: typeof scores) => void;
}) {
  const add    = () => onChange([...scores, { tool: '', score: '', interpretation: '' }]);
  const remove = (i: number) => onChange(scores.filter((_, idx) => idx !== i));
  const update = (i: number, field: string, val: string) =>
    onChange(scores.map((s, idx) => idx === i ? { ...s, [field]: val } : s));

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography fontWeight={600}>Assessment Tool Scores</Typography>
      </AccordionSummary>
      <AccordionDetails>
        {scores.map((s, i) => (
          <Grid container spacing={2} key={i} sx={{ mb: 1, alignItems: 'center' }}>
            <Grid item xs={12} sm={4}>
              <TextField label="Tool / Scale" size="small" fullWidth value={s.tool}
                onChange={(e) => update(i, 'tool', e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField label="Score" size="small" fullWidth value={String(s.score)}
                onChange={(e) => update(i, 'score', e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Interpretation" size="small" fullWidth value={s.interpretation}
                onChange={(e) => update(i, 'interpretation', e.target.value)} />
            </Grid>
            <Grid item xs="auto">
              <IconButton size="small" color="error" onClick={() => remove(i)}>✕</IconButton>
            </Grid>
          </Grid>
        ))}
        <Button size="small" startIcon={<AddCircleIcon />} onClick={add} sx={{ mt: 1 }}>
          Add Score
        </Button>
      </AccordionDetails>
    </Accordion>
  );
}


// ─── Extend Goal Dialog ───────────────────────────────────────────────────────
function ExtendGoalDialog({
  goal,
  open,
  onClose,
  onExtended,
}: {
  goal: EicGoal;
  open: boolean;
  onClose: () => void;
  onExtended: (updated: EicGoal) => void;
}) {
  const currentDeadline = goal.extendedTargetDate ?? goal.targetDate ?? '';
  const [newDate,  setNewDate]  = useState('');
  const [remarks,  setRemarks]  = useState('');
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState<string | null>(null);

  // Reset when dialog opens
  useEffect(() => {
    if (open) { setNewDate(''); setRemarks(''); setErr(null); }
  }, [open]);

  const handleExtend = async () => {
    if (!newDate)        { setErr('New target date is required'); return; }
    if (!remarks.trim()) { setErr('Please provide a reason for the extension'); return; }
    if (newDate <= currentDeadline) {
      setErr('New date must be after the current target date'); return;
    }
    setSaving(true);
    setErr(null);
    try {
      const updated = await eicApi.extendGoal(goal.id, { newTargetDate: newDate, remarks });
      onExtended(updated);
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Extension failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Extend Goal Target Date</DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <Alert severity="info" sx={{ mb: 2 }} icon={<EventBusyIcon />}>
          Current deadline: <strong>{currentDeadline || '—'}</strong>
          {goal.originalTargetDate && (
            <><br />Original date: <strong>{goal.originalTargetDate}</strong></>
          )}
        </Alert>
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
            Goal
          </Typography>
          <Typography variant="body2">{goal.goalText}</Typography>
        </Box>
        <TextField
          label="New Target Date *" type="date" fullWidth size="small" sx={{ mb: 2 }}
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: currentDeadline }}
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
        />
        <TextField
          label="Reason for Extension *" fullWidth size="small" multiline rows={3}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="e.g. Patient requires additional time due to illness, progress slower than anticipated…"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="warning" onClick={handleExtend} disabled={saving}>
          {saving ? <CircularProgress size={16} /> : 'Extend Date'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ─── Add Goal Dialog ──────────────────────────────────────────────────────────
function AddGoalDialog({
  assessmentId,
  enrollmentId,
  discipline,
  open,
  onClose,
  onAdded,
}: {
  assessmentId: string;
  enrollmentId: string;
  discipline: EicDiscipline;
  open: boolean;
  onClose: () => void;
  onAdded: (g: EicGoal) => void;
}) {
  const [form, setForm]   = useState({ goalText: '', goalType: 'SHORT_TERM' as EicGoalType, targetDate: '' });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const handleAdd = async () => {
    if (!form.goalText.trim()) { setError('Goal text is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const goal = await eicApi.createGoal(enrollmentId, {
        assessmentId,
        discipline,
        goalType:   form.goalType,
        goalText:   form.goalText,
        targetDate: form.targetDate || undefined,
      });
      onAdded(goal);
      onClose();
      setForm({ goalText: '', goalType: 'SHORT_TERM', targetDate: '' });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to add goal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Goal — {DISCIPLINE_LABELS[discipline]}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField
          select label="Goal Type" fullWidth size="small" sx={{ mt: 1, mb: 2 }}
          value={form.goalType}
          onChange={(e) => setForm((p) => ({ ...p, goalType: e.target.value as EicGoalType }))}
        >
          <MenuItem value="SHORT_TERM">Short-term</MenuItem>
          <MenuItem value="LONG_TERM">Long-term</MenuItem>
        </TextField>
        <TextField
          label="Goal *" fullWidth size="small" multiline rows={3} sx={{ mb: 2 }}
          value={form.goalText}
          onChange={(e) => setForm((p) => ({ ...p, goalText: e.target.value }))}
          placeholder="e.g. Child will maintain eye contact for 5 seconds on 3 out of 5 trials"
        />
        <TextField
          label="Target Date" type="date" fullWidth size="small"
          InputLabelProps={{ shrink: true }}
          value={form.targetDate}
          onChange={(e) => setForm((p) => ({ ...p, targetDate: e.target.value }))}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleAdd} disabled={saving}>
          {saving ? <CircularProgress size={16} /> : 'Add Goal'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AssessmentEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id     = params.id as string;
  const currentUser = useAuthStore((s) => s.user);

  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canEdit        = hasPermission('EIC:ASSESSMENTS:CREATE');
  const canCountersign = hasPermission('EIC:ASSESSMENTS:COUNTERSIGN');
  


  const [assessment, setAssessment] = useState<EicAssessment | null>(null);
  const [goals,      setGoals]      = useState<EicGoal[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [saveMsg,    setSaveMsg]    = useState<string | null>(null);
  const [goalDialog,   setGoalDialog]   = useState(false);
  const [extendGoal,   setExtendGoal]   = useState<EicGoal | null>(null);
  const [revisionDialog, setRevisionDialog] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
  const [revisionLoading, setRevisionLoading] = useState(false);

  // JSONB sections state
  const [bgHistory,   setBgHistory]   = useState<Record<string, unknown>>({});
  const [clinObs,     setClinObs]     = useState<Record<string, unknown>>({});
  const [formalEval,  setFormalEval]  = useState<Record<string, unknown>>({});
  const [toolScores,  setToolScores]  = useState<Array<{ tool: string; score: string | number; interpretation: string }>>([]);
  const [recommendations, setRecommendations] = useState('');
  const [additionalNotes,  setAdditionalNotes]  = useState('');

  const loadData = useCallback(async () => {
    try {
      // The GET /eic/assessments/:id returns the full entity including JSONB
      const a = await eicApi.getAssessment(id) as any;
      setAssessment(a);
      setBgHistory(a.backgroundHistory ?? {});
      setClinObs(a.clinicalObservations ?? {});
      setFormalEval(a.formalEvaluations ?? {});
      setToolScores(a.assessmentToolScores ?? []);
      setRecommendations(a.recommendations ?? '');
      setAdditionalNotes(a.additionalNotes ?? '');

      // Load goals for this enrollment + discipline
      const g = await eicApi.listGoals(a.enrollmentId, a.discipline);
      // Filter to goals linked to this assessment
      setGoals(g.filter((x: EicGoal) => x.assessmentId === id));
    } catch {
      setError('Failed to load assessment');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    if (!assessment) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await eicApi.updateAssessment(id, {
        backgroundHistory:   bgHistory,
        clinicalObservations: clinObs,
        formalEvaluations:   formalEval,
        assessmentToolScores: toolScores,
        recommendations,
        additionalNotes,
      });
      setSaveMsg('Assessment saved.');
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRequestRevision = async () => {

      if (!revisionReason.trim()) {
          return;
      }

      setRevisionLoading(true);

      try {

          const updated =
              await eicApi.requestRevision(
                  id,
                  revisionReason
              );

          setAssessment(updated);

          setRevisionDialog(false);

          setRevisionReason('');

      } finally {

          setRevisionLoading(false);

      }
  };

  const handleSubmit = async () => {
    await handleSave();
    try {
      const updated = await eicApi.submitAssessment(id);
      setAssessment(updated);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to submit');
    }
  };

  const handleCountersign = async () => {
    try {
      const updated = await eicApi.countersignAssessment(id);
      setAssessment(updated);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to countersign');
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;
  if (error && !assessment) return <Alert severity="error">{error}</Alert>;
  if (!assessment) return null;

  const isDraft             = assessment.status === 'DRAFT';
  const isRevisionRequested = assessment.status === 'REVISION_REQUESTED';
  const isSubmitted         = assessment.status === 'SUBMITTED' || assessment.status === 'UNDER_REVIEW';
  const isOwner =
    assessment.therapistId === currentUser?.hisEmployeeCode;

  console.log('========== OWNER CHECK ==========');

  console.log('Assessment Therapist ID :', assessment.therapistId);

  console.log('Logged User EmployeeCode :', currentUser?.hisEmployeeCode);

  console.log('Assessment Object :', assessment);

  console.log('Current User JSON');

  console.log(JSON.stringify(currentUser, null, 2));

  console.log('Employee Code =', currentUser?.hisEmployeeCode);

  console.log('isOwner :', isOwner);

  console.log('=================================');
  
  const isEditable =
    (isDraft || isRevisionRequested) &&
    isOwner;

  const disc = assessment.discipline;
  const bgFields   = BACKGROUND_FIELDS[disc]   ?? BACKGROUND_FIELDS.default;
  const obsFields  = CLINICAL_OBS_FIELDS[disc] ?? CLINICAL_OBS_FIELDS.default;
  

  const STATUS_COLOUR: Record<string, any> = {
    DRAFT:              'default',
    SUBMITTED:          'info',
    UNDER_REVIEW:       'warning',
    REVISION_REQUESTED: 'error',
    FINALISED:          'success',
  };

  return (
    <Box>
      {/* Header */}
            <PageHeader
        title={`${DISCIPLINE_LABELS[disc]} — Initial Assessment`}
        subtitle={(assessment as any)?.enrollment ? `Patient: ${(assessment as any).enrollment?.patient?.fullName ?? ''} · MRN: ${(assessment as any).enrollment?.patient?.mrn ?? ''}` : undefined}
        icon={<AssignmentIcon />}
        back={`/eic/patients/${(assessment as any)?.enrollment?.patientId ?? ''}`}
        breadcrumbs={[
          { label: 'EIC', href: '/eic' },
          { label: 'Assessments', href: '/eic/assessments' },
          { label: `${DISCIPLINE_LABELS[disc]} Assessment` },
        ]}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {saveMsg && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {saveMsg}
        </Alert>
      )}

      {isRevisionRequested && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography fontWeight={600}>
            Revision Requested
          </Typography>

          <Typography variant="body2" sx={{ mt: 1 }}>
            {assessment.countersignNotes ||
              'Please review and update the assessment, then resubmit.'}
          </Typography>

          {assessment.countersignedAt && (
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
              sx={{ mt: 1 }}
            >
              Requested on{' '}
              {new Date(
                assessment.countersignedAt
              ).toLocaleString()}
            </Typography>
          )}
        </Alert>
      )}

      {/* Clinical sections */}
      <JsonbSection
        title="Background History"
        fields={bgFields}
        data={bgHistory}
        onChange={setBgHistory}
      />
      <JsonbSection
        title="Clinical Observations"
        fields={obsFields}
        data={clinObs}
        onChange={setClinObs}
      />

      {/* Formal evaluations — generic text fields that vary by discipline */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography fontWeight={600}>Formal Evaluations / Standardised Tests</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <TextField
            label="Tests Administered & Results"
            fullWidth
            multiline
            rows={5}
            size="small"
            value={(formalEval.testsResults as string) ?? ''}
            onChange={(e) => setFormalEval({ ...formalEval, testsResults: e.target.value })}
            placeholder={
              disc === 'BT'  ? 'CARS-2, GARS-3, Vineland Adaptive Behaviour Scales…' :
              disc === 'SLP' ? 'GFTA-3, PPVT-5, CELF-5, ROWPVT…' :
              disc === 'OT'  ? 'Beery VMI, Bruininks-Oseretsky, Sensory Profile…' :
              disc === 'SE'  ? 'WISC-V, KABC-II, WJ IV…' :
              'Standardised assessments administered…'
            }
          />
        </AccordionDetails>
      </Accordion>

      <ToolScoresSection scores={toolScores} onChange={setToolScores} />

      {/* Recommendations */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography fontWeight={600}>Recommendations</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <TextField
            fullWidth multiline rows={4} size="small"
            label="Recommendations & Frequency of Therapy"
            disabled={!isEditable}
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            placeholder="e.g. 3× weekly individual BT sessions of 45 min…"
          />
          <TextField
            fullWidth multiline rows={3} size="small" sx={{ mt: 2 }}
            label="Additional Notes"
            disabled={!isEditable}
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
          />
        </AccordionDetails>
      </Accordion>

      {/* Goals panel */}
      <Accordion defaultExpanded sx={{ mt: 1 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography fontWeight={600}>Goals from this Assessment ({goals.length})</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddCircleIcon />}
              onClick={() => setGoalDialog(true)}
              disabled={!isEditable}
            >
              Add Goal
            </Button>
          </Box>

          {goals.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No goals added yet. Goals set here carry forward to sessions and progress reports.
            </Typography>
          ) : (
            <ResponsiveTable minWidth={700}>
            <Table size="small" component={Paper} variant="outlined">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Type</TableCell>
                  <TableCell>Goal</TableCell>
                  <TableCell>Target Date</TableCell>
                  <TableCell>Sessions</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {goals.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <Chip label={g.goalType} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 350 }}>
                      <Typography variant="body2">{g.goalText}</Typography>
                    </TableCell>
                    <TableCell>
                      {g.extendedTargetDate ? (
                        <Box>
                          <Typography variant="body2">{g.extendedTargetDate}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ textDecoration: 'line-through' }}>
                            {g.originalTargetDate}
                          </Typography>
                          <Tooltip title={g.extensionRemarks ?? ''}>
                            <Typography variant="caption" color="warning.main" display="block">
                              Extended ↑
                            </Typography>
                          </Tooltip>
                        </Box>
                      ) : (
                        <Typography variant="body2">{g.targetDate ?? '—'}</Typography>
                      )}
                    </TableCell>
                    <TableCell>{g.sessionCount}</TableCell>
                    <TableCell>
                      <Chip
                        label={g.status}
                        size="small"
                        color={({ ACTIVE: 'success', ACHIEVED: 'info', DISCONTINUED: 'error' } as any)[g.status] ?? 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      {g.status === 'ACTIVE' && g.targetDate && isEditable && (
                        <Tooltip title="Extend target date">
                          <IconButton size="small" color="warning" onClick={() => setExtendGoal(g)} aria-label="Extend target date">
                            <EventBusyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </ResponsiveTable>
          )}
        </AccordionDetails>
      </Accordion>

      {/* Action buttons */}
      <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        {/* Therapist actions: Save / Submit / Resubmit */}
        {isOwner && isEditable && canEdit && (
          <>
            <Button
              variant="outlined"
              startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
              onClick={handleSave}
              disabled={saving}
            >
              Save Draft
            </Button>
            <Button
              variant="contained"
              color={isRevisionRequested ? 'warning' : 'primary'}
              startIcon={<SendIcon />}
              onClick={handleSubmit}
              disabled={saving}
            >
              {isRevisionRequested ? 'Resubmit for Review' : 'Submit for Review'}
            </Button>
          </>
        )}
        {/* Supervisor / Centre-Head actions: Request Revision or Countersign */}
        {isSubmitted && canCountersign && (
          <>
            <Button
                variant="outlined"
                color="error"
                onClick={() => setRevisionDialog(true)}
            >
                Request Revision
            </Button>
            <Button
              variant="contained"
              color="success"
              startIcon={<VerifiedIcon />}
              onClick={handleCountersign}
              disabled={!canCountersign}
            >
              Countersign & Finalise
            </Button>
          </>
        )}
        {assessment.status === 'FINALISED' && (
          <Alert severity="success" sx={{ flex: 1 }}>
            Assessment finalised on {assessment.finalisedAt ? new Date(assessment.finalisedAt).toLocaleDateString() : '—'}
          </Alert>
        )}
      </Box>

      {extendGoal && (
        <ExtendGoalDialog
          goal={extendGoal}
          open={!!extendGoal}
          onClose={() => setExtendGoal(null)}
          onExtended={(updated) => {
            setGoals((prev) => prev.map((g) => g.id === updated.id ? updated : g));
            setExtendGoal(null);
          }}
        />
      )}

      <AddGoalDialog
        assessmentId={id}
        enrollmentId={(assessment as any).enrollmentId}
        discipline={disc}
        open={goalDialog}
        onClose={() => setGoalDialog(false)}
        onAdded={(g) => setGoals((prev) => [...prev, g])}
      />

      <ResponsiveDialog
          open={revisionDialog}
          onClose={() => setRevisionDialog(false)}
          maxWidth="sm"
          fullWidth
      >
          <DialogTitle>
              Request Revision
          </DialogTitle>

          <DialogContent>

              <Typography
                  variant="body2"
                  sx={{ mb: 2 }}
              >
                  Please explain why this
                  assessment should be revised.
              </Typography>

              <TextField
                  fullWidth
                  multiline
                  rows={5}
                  label="Revision Notes"
                  value={revisionReason}
                  onChange={(e) =>
                      setRevisionReason(
                          e.target.value
                      )
                  }
              />

          </DialogContent>

          <DialogActions>

              <Button
                  onClick={() =>
                      setRevisionDialog(false)
                  }
              >
                  Cancel
              </Button>

              <Button
                  variant="contained"
                  color="warning"
                  disabled={
                      revisionLoading ||
                      !revisionReason.trim()
                  }
                  onClick={handleRequestRevision}
              >
                  Request Revision
              </Button>

          </DialogActions>

      </ResponsiveDialog>
    </Box>
  );
}
