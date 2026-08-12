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
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import PrintIcon from '@mui/icons-material/Print';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

import {
  eicApi,
  type EicProgressReport,
  type EicDisciplineProgressSection,
  type EicDiscipline,
  DISCIPLINE_LABELS,
} from '@/lib/api/eic.api';
import PageHeader from '@/components/PageHeader';


// ─── Section Editor ───────────────────────────────────────────────────────────
function SectionEditor({
  reportId,
  section,
  locked,
  onUpdate,
}: {
  reportId: string;
  section: EicDisciplineProgressSection;
  locked: boolean;
  onUpdate: (updated: EicProgressReport) => void;
}) {
  const [form, setForm] = useState({
    functionalProgress: section.functionalProgress ?? '',
    recommendations: section.recommendations ?? '',
    futurePlan: section.sectionData?.futurePlan ?? '',
    therapistName: section.therapistName ?? '',
    goalNotes: section.sectionData?.goals?.reduce((acc: any, g: any) => {
      acc[g.goalId] = { progressNote: g.progressNote || '', outcomeNote: g.outcomeNote || '' };
      return acc;
    }, {}) || {}
  });
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const isSubmitted = section.status === 'SUBMITTED';

  const buildPayload = () => ({
    functionalProgress: form.functionalProgress || null,
    recommendations: form.recommendations || null,
    therapistName: form.therapistName || null,
    sectionData: {
      ...section.sectionData,
      futurePlan: form.futurePlan || null,
      goals: section.sectionData?.goals?.map((g: any) => ({
        ...g,
        progressNote: form.goalNotes[g.goalId]?.progressNote || '',
        outcomeNote: form.goalNotes[g.goalId]?.outcomeNote || '',
      }))
    }
  });

  const handleSave = async () => {
    setSaving(true);
    setErr(null);
    try {
      await eicApi.updateProgressSection(reportId, section.discipline, buildPayload());
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
      // Save latest values first
      await eicApi.updateProgressSection(
        reportId,
        section.discipline,
        buildPayload()
      );

      // Now submit
      const updated =
        await eicApi.submitProgressSection(
          reportId,
          section.discipline
        );

      onUpdate(updated as EicProgressReport);

    } catch (e: any) {
      setErr(
        e?.response?.data?.message ??
        'Submit failed'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box>
      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
      {msg && <Alert severity="success" sx={{ mb: 2 }}>{msg}</Alert>}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Left Column: Assessment & Recommendations */}
        <Grid item xs={12} md={7}>
          {section.sectionData?.assessmentSnapshot ? (
            <Accordion variant="outlined" defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <HistoryEduIcon color="primary" fontSize="small" />
                  <Typography variant="subtitle2" fontWeight={600} color="primary.main">
                    Clinical Context (Read Only)
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0, pb: 3, px: 3 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 3 }}>
                  This information is copied from the latest assessment and goals at the time this report was created.
                </Typography>

                <Card variant="outlined" sx={{ mb: 3, height: '100%' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="subtitle2" fontWeight={700}>Assessment Summary</Typography>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        {section.sectionData.assessmentSnapshot.assessmentDate}
                      </Typography>
                    </Box>

                    <Box sx={{ mb: 3 }}>
                      {typeof section.sectionData.assessmentSnapshot.clinicalObservations === 'object'
                        ? Object.entries(section.sectionData.assessmentSnapshot.clinicalObservations || {}).map(([k, v]) => (
                          <Box key={k} sx={{ mb: 1.5 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize', fontWeight: 600 }}>
                              {k.replace(/([A-Z])/g, ' $1').trim()}
                            </Typography>
                            <Typography variant="body2">{String(v)}</Typography>
                          </Box>
                        ))
                        : (
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                            {section.sectionData.assessmentSnapshot.clinicalObservations || 'No clinical observations available.'}
                          </Typography>
                        )
                      }
                    </Box>

                    <Box sx={{ pb: 1, borderBottom: '1px solid', borderColor: 'divider', mb: 2 }}>
                      <Typography variant="subtitle2" fontWeight={700}>Recommendations</Typography>
                    </Box>
                    <Box>
                      {typeof section.sectionData.assessmentSnapshot.recommendations === 'object'
                        ? Object.entries(section.sectionData.assessmentSnapshot.recommendations || {}).map(([k, v]) => (
                          <Box key={k} sx={{ mb: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize', fontWeight: 600 }}>
                              {k.replace(/([A-Z])/g, ' $1').trim()}
                            </Typography>
                            <Typography variant="body2" sx={{ display: 'flex', gap: 1 }}>
                              <span style={{ color: '#aaa' }}>•</span> {String(v)}
                            </Typography>
                          </Box>
                        ))
                        : (
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', display: 'flex', gap: 1 }}>
                            {section.sectionData.assessmentSnapshot.recommendations ? (
                              <><span style={{ color: '#aaa' }}>•</span> {section.sectionData.assessmentSnapshot.recommendations}</>
                            ) : 'None'}
                          </Typography>
                        )
                      }
                    </Box>
                  </CardContent>
                </Card>
              </AccordionDetails>
            </Accordion>
          ) : (
            <Alert severity="info" sx={{ height: '100%', display: 'flex', alignItems: 'center' }}>
              No finalized initial assessment found for {section.discipline}.
            </Alert>
          )}
        </Grid>

        {/* Right Column: Treatment Summary & Goals */}
        <Grid item xs={12} md={5}>
          {section.sectionData && (
            <>
                {section.sectionData.treatmentSummary && (
                  <Card variant="outlined" sx={{ mb: 3 }}>
                    <CardContent>
                      <Box sx={{ mb: 2, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="subtitle2" fontWeight={700}>Treatment Summary</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Sessions Planned</Typography>
                          <Typography variant="body2" fontWeight={600}>{section.sectionData.treatmentSummary.planned}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Sessions Attended</Typography>
                          <Typography variant="body2" fontWeight={600}>{section.sectionData.treatmentSummary.attended}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Absent</Typography>
                          <Typography variant="body2" fontWeight={600}>{section.sectionData.treatmentSummary.absent}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Cancelled</Typography>
                          <Typography variant="body2" fontWeight={600}>{section.sectionData.treatmentSummary.cancelled}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, pt: 1, borderTop: '1px dashed #ccc' }}>
                          <Typography variant="body2" color="text.secondary" fontWeight={600}>Attendance %</Typography>
                          <Typography variant="body2" fontWeight={700} color={section.sectionData.treatmentSummary.attendancePercent >= 80 ? 'success.main' : 'warning.main'}>
                            {section.sectionData.treatmentSummary.attendancePercent}%
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                )}

                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Box sx={{ mb: 2, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="subtitle2" fontWeight={700}>Current Goals</Typography>
                    </Box>

                    {section.sectionData.goals && section.sectionData.goals.length > 0 ? (
                      <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {section.sectionData.goals.map((g: any, i: number) => {
                          const statusColor = g.status === 'ACHIEVED' ? '#1976d2' : g.status === 'ACTIVE' ? '#2e7d32' : '#9e9e9e';
                          const statusDot = g.status === 'ACHIEVED' ? '🔵' : g.status === 'ACTIVE' ? '🟢' : '⚪';
                          
                          return (
                            <Box key={g.goalId}>
                              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                                <Typography sx={{ fontSize: '0.85rem', mt: 0.2 }}>{statusDot}</Typography>
                                <Box>
                                  <Typography variant="body2" fontWeight={600}>Goal {i + 1}</Typography>
                                  <Typography variant="body2" sx={{ mb: 0.5 }}>{g.description}</Typography>
                                  <Typography variant="caption" sx={{ color: statusColor, fontWeight: 600, fontSize: '0.65rem', letterSpacing: 0.5 }}>
                                    {g.status}
                                  </Typography>
                                </Box>
                              </Box>
                              
                              <Box sx={{ pl: 3 }}>
                                <TextField
                                  label="Progress Notes"
                                  multiline minRows={2} size="small" fullWidth
                                  sx={{ mb: g.status === 'ACHIEVED' ? 1.5 : 0 }}
                                  value={form.goalNotes[g.goalId]?.progressNote || ''}
                                  onChange={(e) => setForm(p => ({
                                    ...p,
                                    goalNotes: { ...p.goalNotes, [g.goalId]: { ...p.goalNotes[g.goalId], progressNote: e.target.value } }
                                  }))}
                                  disabled={locked || isSubmitted}
                                />
                                {g.status === 'ACHIEVED' && (
                                  <TextField
                                    label="Outcome"
                                    multiline minRows={1} size="small" fullWidth
                                    value={form.goalNotes[g.goalId]?.outcomeNote || ''}
                                    onChange={(e) => setForm(p => ({
                                      ...p,
                                      goalNotes: { ...p.goalNotes, [g.goalId]: { ...p.goalNotes[g.goalId], outcomeNote: e.target.value } }
                                    }))}
                                    disabled={locked || isSubmitted}
                                  />
                                )}
                              </Box>
                            </Box>
                          );
                        })}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>No goals recorded.</Typography>
                    )}

                    {section.sectionData.goalSummary && (
                      <Box sx={{ bgcolor: '#f5f5f5', p: 1.5, borderRadius: 1 }}>
                        <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', mb: 1, display: 'block' }}>
                          Goal Summary
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2" color="text.secondary">Active</Typography>
                          <Typography variant="body2" fontWeight={600}>{section.sectionData.goalSummary.active}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2" color="text.secondary">Achieved</Typography>
                          <Typography variant="body2" fontWeight={600}>{section.sectionData.goalSummary.achieved}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Discontinued</Typography>
                          <Typography variant="body2" fontWeight={600}>{section.sectionData.goalSummary.discontinued}</Typography>
                        </Box>
                      </Box>
                    )}
                  </CardContent>
                </Card>
            </>
          )}
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}>
          <TextField
            label="Therapist Name" size="small" fullWidth
            value={form.therapistName}
            onChange={(e) => setForm((p) => ({ ...p, therapistName: e.target.value }))}
            disabled={locked || isSubmitted}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            label="Overall Clinical Progress" size="small" fullWidth multiline rows={4}
            value={form.functionalProgress}
            onChange={(e) => setForm((p) => ({ ...p, functionalProgress: e.target.value }))}
            disabled={locked || isSubmitted}
            placeholder="Describe observable functional improvements over the period…"
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            label="Updated Recommendations" size="small" fullWidth multiline rows={4}
            value={form.recommendations}
            onChange={(e) => setForm((p) => ({ ...p, recommendations: e.target.value }))}
            disabled={locked || isSubmitted}
            placeholder="Next period goals, home activities, referrals…"
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            label="Future Treatment Plan" size="small" fullWidth multiline rows={4}
            value={form.futurePlan}
            onChange={(e) => setForm((p) => ({ ...p, futurePlan: e.target.value }))}
            disabled={locked || isSubmitted}
            placeholder="Plan for the next review, new goals, etc..."
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

      {isSubmitted && section.submittedAt && (
        <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mt: 2 }}>
          Submitted on {new Date(section.submittedAt).toLocaleString()}
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
  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [signing, setSigning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      <DialogTitle>Sign Progress Report</DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          By signing you confirm this progress report has been reviewed and is accurate.
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
          placeholder="e.g. Centre Head, Senior Therapist"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="success" onClick={handleSign} disabled={signing}>
          {signing ? <CircularProgress size={16} /> : 'Sign Report'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ─── Print layout ─────────────────────────────────────────────────────────────
function handlePrint(report: EicProgressReport) {
  const win = window.open('', '_blank');
  if (!win) return;

  const sectionRows = (report.sections ?? []).map((s) => `
    <section style="margin-bottom:24px; page-break-inside:avoid;">
      <h3 style="margin:0 0 8px; border-bottom:1px solid #ccc; padding-bottom:4px;">
        ${DISCIPLINE_LABELS[s.discipline]} &nbsp;
        <span style="font-size:12px; color:#666;">${s.status}</span>
        ${s.therapistName ? `— <em>${s.therapistName}</em>` : ''}
      </h3>
      <table style="border-collapse:collapse; width:100%; font-size:13px; margin-bottom:8px;">
        <tr>
          <td style="padding:4px 8px; font-weight:bold; width:180px;">Sessions Held</td>
          <td style="padding:4px 8px;">${s.sectionData?.treatmentSummary?.attended ?? s.sessionsHeld ?? '—'}</td>
          <td style="padding:4px 8px; font-weight:bold; width:180px;">Attendance</td>
          <td style="padding:4px 8px;">${s.sectionData?.treatmentSummary?.attendancePercent ?? '—'}%</td>
          <td style="padding:4px 8px; font-weight:bold; width:180px;">Goals Achieved</td>
          <td style="padding:4px 8px;">${s.sectionData?.goalSummary?.achieved ?? s.goalsAchieved ?? '—'}</td>
        </tr>
      </table>
      ${s.functionalProgress ? `<p><strong>Overall Clinical Progress:</strong> ${s.functionalProgress}</p>` : ''}
      ${s.recommendations ? `<p><strong>Updated Recommendations:</strong> ${s.recommendations}</p>` : ''}
      ${s.sectionData?.futurePlan ? `<p><strong>Future Treatment Plan:</strong> ${s.sectionData.futurePlan}</p>` : ''}
    </section>
  `).join('');

  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Progress Report #${report.reportNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 32px; color: #111; }
        h1 { font-size: 20px; }
        h2 { font-size: 16px; color: #444; }
        .meta { margin-bottom: 16px; font-size: 13px; color: #555; }
        .signature { margin-top: 32px; border-top: 1px solid #ccc; padding-top: 12px; font-size: 13px; }
        @media print { body { margin: 16px; } }
      </style>
    </head>
    <body>
      <h1>Progress Report #${report.reportNumber}</h1>
      <div class="meta">
        <strong>Period:</strong> ${report.periodFrom} to ${report.periodTo} &nbsp;&nbsp;
        <strong>Status:</strong> ${report.status}
      </div>
      <hr>
      ${sectionRows}
      ${report.signatoryName ? `
        <div class="signature">
          <strong>Signed by:</strong> ${report.signatoryName} (${report.signatoryDesignation})<br>
          <strong>Date:</strong> ${report.signedAt ? new Date(report.signedAt).toLocaleDateString() : '—'}
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
export default function ProgressReportPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [report, setReport] = useState<EicProgressReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await eicApi.getProgressReport(id);
      setReport(r);
    } catch {
      setError('Failed to load progress report');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSign = async (name: string, designation: string) => {
    const updated = await eicApi.signProgressReport(id, {
      signatoryName: name,
      signatoryDesignation: designation,
    });
    setReport(updated);
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;
  if (error || !report) return <Alert severity="error">{error ?? 'Not found'}</Alert>;

  const sections = report.sections ?? [];
  const allSubmitted = sections.length > 0 && sections.every((s) => s.status === 'SUBMITTED');
  const canSign = report.status === 'PENDING_SIGNATURE';
  const isLocked = report.status === 'SIGNED' || report.status === 'PUBLISHED';

  const STATUS_COLOUR: Record<string, any> = {
    IN_PROGRESS: 'warning',
    PENDING_SIGNATURE: 'info',
    SIGNED: 'success',
    PUBLISHED: 'success',
  };

  return (
    <Box>
      {/* Header */}
      <PageHeader
        title={`Progress Report #${report.reportNumber}`}
        subtitle={(report as any).enrollment?.patient?.fullName}
        icon={<HistoryEduIcon />}
        back="/eic/progress-reports"
        breadcrumbs={[
          { label: 'EIC', href: '/eic' },
          { label: 'Progress Reports', href: '/eic/progress-reports' },
          { label: `Report #${report.reportNumber}` },
        ]}
      />

      {isLocked && report.signatoryName && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Signed by <strong>{report.signatoryName}</strong> ({report.signatoryDesignation})
          on {report.signedAt ? new Date(report.signedAt).toLocaleDateString() : '—'}.
          This report is locked.
        </Alert>
      )}

      {allSubmitted && !canSign && !isLocked && (
        <Alert severity="info" sx={{ mb: 3 }}>
          All sections submitted — report is awaiting signature.
        </Alert>
      )}

      {/* Summary card */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent sx={{ py: '12px !important' }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Grid container spacing={3}>
              <Grid item>
                <Typography variant="caption" color="text.secondary">
                  Period
                </Typography>

                <Typography variant="body2" fontWeight={500}>
                  {report.periodFrom} → {report.periodTo}
                </Typography>
              </Grid>

              <Grid item>
                <Typography variant="caption" color="text.secondary">
                  Sections
                </Typography>

                <Typography variant="body2" fontWeight={500}>
                  {sections.filter((s) => s.status === 'SUBMITTED').length}
                  {' / '}
                  {sections.length} submitted
                </Typography>
              </Grid>
            </Grid>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {isLocked && (
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={<PrintIcon />}
                  onClick={() => handlePrint(report)}
                >
                  Print Report
                </Button>
              )}

              {canSign && (
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<HistoryEduIcon />}
                  onClick={() => setSignOpen(true)}
                >
                  Sign Report
                </Button>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Sections */}
      {sections.length === 0 ? (
        <Alert severity="warning">No sections found for this report.</Alert>
      ) : (
        sections.map((section) => (
          <Accordion key={section.id} defaultExpanded={section.status !== 'SUBMITTED'} variant="outlined" sx={{ mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                <Typography fontWeight={600}>{DISCIPLINE_LABELS[section.discipline]}</Typography>
                {section.therapistName && (
                  <Typography variant="caption" color="text.secondary">— {section.therapistName}</Typography>
                )}
                <Box sx={{ ml: 'auto', mr: 1 }}>
                  <Chip
                    label={section.status} size="small"
                    color={section.status === 'SUBMITTED' ? 'success' : 'default'}
                  />
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <SectionEditor
                reportId={id}
                section={section}
                locked={isLocked}
                onUpdate={(updated) => setReport(updated)}
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
