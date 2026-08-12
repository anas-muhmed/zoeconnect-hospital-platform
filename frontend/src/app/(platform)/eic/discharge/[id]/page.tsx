'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SaveIcon from '@mui/icons-material/Save';
import SendIcon from '@mui/icons-material/Send';
import LogoutIcon from '@mui/icons-material/Logout';
import PrintIcon from '@mui/icons-material/Print';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';

import {
  eicApi,
  type EicDischargeSummary,
  type EicDischargeSection,
  type EicDiscipline,
  DISCIPLINE_LABELS,
} from '@/lib/api/eic.api';
import PageHeader from '@/components/PageHeader';


// ─── Discipline Section Editor ────────────────────────────────────────────────
function DischargeSectionEditor({
  dischargeId,
  section,
  locked,
  onUpdate,
}: {
  dischargeId: string;
  section: EicDischargeSection;
  locked: boolean;
  onUpdate: (updated: EicDischargeSummary) => void;
}) {
  const [form, setForm] = useState({
    overallProgress:    (section.sectionData as any)?.overallProgress ?? '',
    goalsAchieved:      String(section.goalsAchieved ?? ''),
    functionalOutcomes: section.functionalOutcomes   ?? '',
    recommendations:    section.recommendations      ?? '',
  });
  const [saving,     setSaving]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg,        setMsg]        = useState<string | null>(null);
  const [err,        setErr]        = useState<string | null>(null);

  const isSubmitted = section.status === 'SUBMITTED';

  const handleSave = async () => {
    setSaving(true);
    setErr(null);
    try {
      await eicApi.updateDischargeSection(dischargeId, section.discipline, {
        sectionData:        { overallProgress: form.overallProgress || null },
        goalsAchieved:      form.goalsAchieved  ? Number(form.goalsAchieved)  : null,
        functionalOutcomes: form.functionalOutcomes || null,
        recommendations:    form.recommendations    || null,
      });
      setMsg('Saved');
      setTimeout(() => setMsg(null), 2000);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      const updated = await eicApi.submitDischargeSection(dischargeId, section.discipline);
      onUpdate(updated as EicDischargeSummary);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box>
      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
      {msg && <Alert severity="success" sx={{ mb: 2 }}>{msg}</Alert>}

      <Grid container spacing={2}>
        <Grid item xs={6} sm={3} md={2}>
          <TextField
            label="Goals Achieved" type="number" size="small" fullWidth
            value={form.goalsAchieved}
            onChange={(e) => setForm((p) => ({ ...p, goalsAchieved: e.target.value }))}
            disabled={locked || isSubmitted}
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField
            label="Overall Progress" size="small" fullWidth multiline rows={4}
            value={form.overallProgress}
            onChange={(e) => setForm((p) => ({ ...p, overallProgress: e.target.value }))}
            disabled={locked || isSubmitted}
            placeholder="Summary of progress in this discipline since admission…"
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField
            label="Functional Outcomes" size="small" fullWidth multiline rows={4}
            value={form.functionalOutcomes}
            onChange={(e) => setForm((p) => ({ ...p, functionalOutcomes: e.target.value }))}
            disabled={locked || isSubmitted}
            placeholder="Observable functional outcomes at discharge…"
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField
            label="Recommendations" size="small" fullWidth multiline rows={4}
            value={form.recommendations}
            onChange={(e) => setForm((p) => ({ ...p, recommendations: e.target.value }))}
            disabled={locked || isSubmitted}
            placeholder="Post-discharge recommendations, home programme specifics…"
          />
        </Grid>
      </Grid>

      {!locked && !isSubmitted && (
        <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button
            variant="outlined" size="small"
            startIcon={saving ? <CircularProgress size={14} /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving || submitting}
          >
            Save Draft
          </Button>
          <Button
            variant="contained" size="small" color="success"
            startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : <SendIcon />}
            onClick={handleSubmit}
            disabled={saving || submitting}
          >
            Submit Section
          </Button>
        </Box>
      )}

      {isSubmitted && (
        <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mt: 2 }}>
          Section submitted.
        </Alert>
      )}
    </Box>
  );
}

// ─── Sign Dialog ──────────────────────────────────────────────────────────────
function SignDialog({
  open,
  onClose,
  onSign,
}: {
  open: boolean;
  onClose: () => void;
  onSign: (name: string, designation: string) => Promise<void>;
}) {
  const [name,        setName]        = useState('');
  const [designation, setDesignation] = useState('');
  const [signing,     setSigning]     = useState(false);
  const [err,         setErr]         = useState<string | null>(null);

  const handleSign = async () => {
    if (!name.trim() || !designation.trim()) { setErr('Name and designation are required'); return; }
    setSigning(true);
    setErr(null);
    try {
      await onSign(name, designation);
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Failed to sign');
    } finally {
      setSigning(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Sign Discharge Summary</DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          By signing you authorise this discharge summary and confirm the child has been formally discharged.
        </Typography>
        <TextField
          label="Signatory Name *" fullWidth size="small" sx={{ mb: 2, mt: 1 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="Designation *" fullWidth size="small"
          value={designation}
          onChange={(e) => setDesignation(e.target.value)}
          placeholder="e.g. Centre Head"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="warning" onClick={handleSign} disabled={signing}>
          {signing ? <CircularProgress size={16} /> : 'Sign & Discharge'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ─── Print ────────────────────────────────────────────────────────────────────
function handlePrint(discharge: EicDischargeSummary) {
  const win = window.open('', '_blank');
  if (!win) return;

  const sectionRows = (discharge.sections ?? []).map((s) => `
    <section style="margin-bottom:24px; page-break-inside:avoid;">
      <h3 style="margin:0 0 8px; border-bottom:1px solid #ccc; padding-bottom:4px;">
        ${DISCIPLINE_LABELS[s.discipline]} &nbsp;
        <span style="font-size:12px; color:#666;">${s.status}</span>
      </h3>
      <table style="border-collapse:collapse; font-size:13px; margin-bottom:8px;">
        <tr>
        <tr>
          <td style="padding:4px 8px; font-weight:bold;">Goals Achieved</td>
          <td style="padding:4px 8px;">${s.goalsAchieved ?? '—'}</td>
        </tr>
      </table>
      ${(s.sectionData as any)?.overallProgress ? `<p><strong>Overall Progress:</strong> ${(s.sectionData as any).overallProgress}</p>` : ''}
      ${s.functionalOutcomes ? `<p><strong>Functional Outcomes:</strong> ${s.functionalOutcomes}</p>` : ''}
      ${s.recommendations    ? `<p><strong>Recommendations:</strong> ${s.recommendations}</p>`    : ''}
    </section>
  `).join('');

  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Discharge Summary</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 32px; color: #111; }
        h1 { font-size: 20px; }
        .meta { margin-bottom: 16px; font-size: 13px; color: #555; }
        .summary-block { background:#f9f9f9; padding:12px; margin-bottom:16px; border-left:4px solid #ccc; }
        .signature { margin-top:32px; border-top:1px solid #ccc; padding-top:12px; font-size:13px; }
        @media print { body { margin: 16px; } }
      </style>
    </head>
    <body>
      <h1>Discharge Summary</h1>
      <div class="meta">
        <strong>Discharge Reason:</strong> ${discharge.dischargeReason}<br>
        <strong>Discharge Date:</strong> ${discharge.dischargeDate}<br>
        <strong>Status:</strong> ${discharge.status}
      </div>
      ${discharge.overallProgress ? `<div class="summary-block"><strong>Overall Summary:</strong><br>${discharge.overallProgress}</div>` : ''}
      <hr>
      ${sectionRows}
      ${discharge.signatoryName ? `
        <div class="signature">
          <strong>Signed by:</strong> ${discharge.signatoryName} (${discharge.signatoryDesignation})<br>
          <strong>Date:</strong> ${discharge.signedAt ? new Date(discharge.signedAt).toLocaleDateString() : '—'}
        </div>
      ` : ''}
    </body>
    </html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DischargeSummaryPage() {
  const params = useParams();
  const router = useRouter();
  const id     = params.id as string;

  const [discharge, setDischarge] = useState<EicDischargeSummary | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [signOpen,  setSignOpen]  = useState(false);

  // Header edit state
  const [headerForm, setHeaderForm] = useState({
    overallProgress: '',
  });
  const [headerSaving, setHeaderSaving] = useState(false);
  const [headerMsg,    setHeaderMsg]    = useState<string | null>(null);
  const [headerErr,    setHeaderErr]    = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await eicApi.getDischarge(id);
      setDischarge(d);
      setHeaderForm({
        overallProgress: d.overallProgress ?? '',
      });
    } catch {
      setError('Failed to load discharge summary');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSaveHeader = async () => {
    setHeaderSaving(true);
    setHeaderErr(null);
    try {
      const updated = await eicApi.updateDischargeSummaryHeader(id, {
        overallProgress: headerForm.overallProgress || undefined,
      });
      setDischarge(updated);
      setHeaderMsg('Saved');
      setTimeout(() => setHeaderMsg(null), 2000);
    } catch (e: any) {
      setHeaderErr(e?.response?.data?.message ?? 'Save failed');
    } finally {
      setHeaderSaving(false);
    }
  };

  const handleSign = async (name: string, designation: string) => {
    const updated = await eicApi.signDischarge(id, {
      signatoryName: name,
      signatoryDesignation: designation,
    });
    setDischarge(updated);
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;
  if (error || !discharge) return <Alert severity="error">{error ?? 'Not found'}</Alert>;

  const sections     = discharge.sections ?? [];
  const allSubmitted = sections.length > 0 && sections.every((s) => s.status === 'SUBMITTED');
  const canSign      = discharge.status === 'PENDING_SIGNATURE';
  const isLocked     = discharge.status === 'SIGNED';

  const STATUS_COLOUR: Record<string, any> = {
    DRAFT:             'default',
    PENDING_SECTIONS:  'warning',
    PENDING_SIGNATURE: 'info',
    SIGNED:            'success',
  };

  return (
    <Box>
      {/* Header */}
            <PageHeader
        title="Discharge Summary"
        icon={<LogoutIcon />}
        back="/eic/patients"
        breadcrumbs={[
          { label: 'EIC', href: '/eic' },
          { label: 'Patients', href: '/eic/patients' },
          { label: 'Discharge' },
        ]}
      />

      {isLocked && discharge.signatoryName && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Signed by <strong>{discharge.signatoryName}</strong> ({discharge.signatoryDesignation})
          on {discharge.signedAt ? new Date(discharge.signedAt).toLocaleDateString() : '—'}.
          This discharge summary is locked.
        </Alert>
      )}

      {allSubmitted && !canSign && !isLocked && (
        <Alert severity="info" sx={{ mb: 3 }}>
          All sections submitted — discharge summary is awaiting signature.
        </Alert>
      )}

      {/* Overall summary card */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={700}>Overall Summary</Typography>
            {!isLocked && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                {headerMsg && <Typography variant="caption" color="success.main">{headerMsg}</Typography>}
                {headerErr && <Typography variant="caption" color="error">{headerErr}</Typography>}
                <Button
                  variant="outlined" size="small"
                  startIcon={headerSaving ? <CircularProgress size={14} /> : <SaveIcon />}
                  onClick={handleSaveHeader}
                  disabled={headerSaving}
                >
                  Save
                </Button>
              </Box>
            )}
          </Box>
          <TextField
            size="small" fullWidth multiline rows={6}
            value={headerForm.overallProgress}
            onChange={(e) => setHeaderForm((p) => ({ ...p, overallProgress: e.target.value }))}
            disabled={isLocked}
            placeholder="Summarise the child's overall progress across all disciplines, home programme, and follow-up plan…"
          />
        </CardContent>
      </Card>

      <Divider sx={{ mb: 3 }}>
        <Typography variant="caption" color="text.secondary">DISCIPLINE SECTIONS</Typography>
      </Divider>

      {/* Discipline sections */}
      {sections.length === 0 ? (
        <Alert severity="warning">No sections found for this discharge summary.</Alert>
      ) : (
        sections.map((section) => (
          <Accordion
            key={section.id}
            defaultExpanded={section.status !== 'SUBMITTED'}
            variant="outlined"
            sx={{ mb: 1 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                <Typography fontWeight={600}>{DISCIPLINE_LABELS[section.discipline]}</Typography>
                <Box sx={{ ml: 'auto', mr: 1 }}>
                  <Chip
                    label={section.status} size="small"
                    color={section.status === 'SUBMITTED' ? 'success' : 'default'}
                  />
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <DischargeSectionEditor
                dischargeId={id}
                section={section}
                locked={isLocked}
                onUpdate={(updated) => setDischarge(updated)}
              />
            </AccordionDetails>
          </Accordion>
        ))
      )}

      <SignDialog
        open={signOpen}
        onClose={() => setSignOpen(false)}
        onSign={handleSign}
      />
    </Box>
  );
}
