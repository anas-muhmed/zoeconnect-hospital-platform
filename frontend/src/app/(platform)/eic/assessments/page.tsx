'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableBody from '@mui/material/TableBody';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditNoteIcon    from '@mui/icons-material/EditNote';
import OpenInNewIcon   from '@mui/icons-material/OpenInNew';
import RefreshIcon     from '@mui/icons-material/Refresh';
import AssignmentIcon  from '@mui/icons-material/Assignment';

import { eicApi, type EicAssessment, DISCIPLINE_LABELS } from '@/lib/api/eic.api';
import PageHeader from '@/components/PageHeader';
import ResponsiveTable from '@/components/ResponsiveTable';

// ── Status chip ────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; color: 'warning' | 'info' | 'error' | 'success' }> = {
    SUBMITTED:          { label: 'Submitted',     color: 'warning' },
    UNDER_REVIEW:       { label: 'Under Review',  color: 'info' },
    REVISION_REQUESTED: { label: 'Revision Req.', color: 'error' },
    FINALISED:          { label: 'Finalised',     color: 'success' },
  };
  const cfg = map[status] ?? { label: status, color: 'warning' };
  return <Chip label={cfg.label} color={cfg.color} size="small" />;
}

// ── Countersign dialog ─────────────────────────────────────────────────────────

function ReviewDialog({
  open, assessment, onClose, onDone,
}: {
  open: boolean;
  assessment: EicAssessment | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [notes,  setNotes]  = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [mode,   setMode]   = useState<'approve' | 'revise'>('approve');

  useEffect(() => {
    if (open) { setNotes(''); setError(null); setSaving(false); setMode('approve'); }
  }, [open]);

  const handleAction = async () => {
    if (!assessment) return;
    if (mode === 'revise' && !notes.trim()) {
      setError('Revision notes are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (mode === 'approve') {
        await eicApi.countersignAssessment(assessment.id, notes || undefined);
      } else {
        await eicApi.requestRevision(assessment.id, notes);
      }
      onDone();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Action failed');
      setSaving(false);
    }
  };

  if (!assessment) return null;
  const patientName = (assessment as any).enrollment?.patient?.fullName ?? '—';
  const discipline  = DISCIPLINE_LABELS[assessment.discipline] ?? assessment.discipline;

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Review Assessment</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          <strong>{patientName}</strong> — {discipline} ({assessment.assessmentType})
          &nbsp;·&nbsp; by {assessment.therapistName}
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Button
            variant={mode === 'approve' ? 'contained' : 'outlined'} color="success" size="small"
            startIcon={<CheckCircleIcon />} onClick={() => setMode('approve')}
          >
            Countersign
          </Button>
          <Button
            variant={mode === 'revise' ? 'contained' : 'outlined'} color="warning" size="small"
            startIcon={<EditNoteIcon />} onClick={() => setMode('revise')}
          >
            Request Revision
          </Button>
        </Box>

        <TextField
          label={mode === 'approve' ? 'Notes (optional)' : 'Revision Notes *'}
          multiline rows={3} fullWidth size="small"
          value={notes} onChange={(e) => setNotes(e.target.value)}
        />
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained" color={mode === 'approve' ? 'success' : 'warning'}
          onClick={handleAction} disabled={saving}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {mode === 'approve' ? 'Countersign & Finalise' : 'Send for Revision'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EicAssessmentsQueuePage() {
  const router = useRouter();
  const [queue,    setQueue]    = useState<EicAssessment[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [selected, setSelected] = useState<EicAssessment | null>(null);
  const [dlgOpen,  setDlgOpen]  = useState(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await eicApi.listAssessmentsAwaitingReview();
      setQueue(data);
    } catch {
      setError('Failed to load countersign queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const handleDone = () => { setDlgOpen(false); setSelected(null); loadQueue(); };

  return (
    <Box>
      <PageHeader
        title="Assessment Countersign Queue"
        subtitle="Assessments submitted by therapists awaiting Centre Head countersignature or revision."
        icon={<AssignmentIcon />}
        back="/eic"
        breadcrumbs={[
          { label: 'Early Intervention', href: '/eic' },
          { label: 'Assessments' },
        ]}
        actions={
          <>
            {!loading && (
              <Chip
                label={`${queue.length} pending`}
                color={queue.length > 0 ? 'warning' : 'success'}
                size="small"
              />
            )}
            <Tooltip title="Refresh" arrow>
              <span>
                <IconButton onClick={loadQueue} disabled={loading} size="small"
                  sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }} aria-label="Refresh">
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : queue.length === 0 ? (
        <Card>
          <CardContent>
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
              <Typography variant="h6" fontWeight={600}>Queue is clear</Typography>
              <Typography variant="body2" color="text.secondary">
                No assessments are awaiting countersignature.
              </Typography>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <ResponsiveTable minWidth={1000}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Patient</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>MRN</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Discipline</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Therapist</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Submitted</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {queue.map((a) => {
                const patient     = (a as any).enrollment?.patient;
                const submittedAt = a.submittedAt
                  ? new Date(a.submittedAt as unknown as string).toLocaleDateString('en-GB', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })
                  : '—';

                return (
                  <TableRow key={a.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{patient?.fullName ?? '—'}</Typography>
                      {patient?.fatherName && (
                        <Typography variant="caption" color="text.secondary">F: {patient.fatherName}</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">{patient?.mrn ?? '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{DISCIPLINE_LABELS[a.discipline] ?? a.discipline}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{a.assessmentType}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{a.therapistName}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{submittedAt}</Typography>
                    </TableCell>
                    <TableCell><StatusChip status={a.status} /></TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        <Tooltip title="Open assessment">
                          <IconButton size="small" onClick={() => router.push(`/eic/assessments/${a.id}`)} aria-label="Open assessment">
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Button
                          size="small" variant="contained"
                          onClick={() => { setSelected(a); setDlgOpen(true); }}
                        >
                          Review
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </ResponsiveTable>
        </Card>
      )}

      <ReviewDialog
        open={dlgOpen}
        assessment={selected}
        onClose={() => { setDlgOpen(false); setSelected(null); }}
        onDone={handleDone}
      />
    </Box>
  );
}
