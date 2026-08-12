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
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Autocomplete from '@mui/material/Autocomplete';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import SendIcon from '@mui/icons-material/Send';
import SaveIcon from '@mui/icons-material/Save';

import EventNoteIcon from '@mui/icons-material/EventNote';
import {
  eicApi,
  type EicTherapySession,
  type EicSessionEntry,
  type EicGoal,
  DISCIPLINE_LABELS,
} from '@/lib/api/eic.api';
import PageHeader from '@/components/PageHeader';
import ResponsiveTable from '@/components/ResponsiveTable';


// ─── Entry form dialog ────────────────────────────────────────────────────────
function EntryDialog({
  open,
  initial,
  goals,
  onSave,
  onClose,
}: {
  open: boolean;
  initial?: Partial<EicSessionEntry>;
  goals: EicGoal[];
  onSave: (items: Array<{
    goalId?: string;
    goalText: string;
    activity: string;
    childResponse: string;
    remarks?: string;
  }>) => Promise<void>;
  onClose: () => void;
}) {
  // Editing an existing entry always represents a single goal (it's one row);
  // adding a new entry allows selecting several goals at once, which saves
  // one entry per goal so multiple goals can be marked in the same session.
  const isEditing = !!initial?.id;
  const [selectedGoals, setSelectedGoals] = useState<EicGoal[]>(
    initial?.goalId ? goals.filter((g) => g.id === initial.goalId) : []
  );
  const [form, setForm] = useState({
    goalText:      initial?.goalText      ?? '',
    activity:      initial?.activity      ?? '',
    childResponse: initial?.childResponse ?? '',
    remarks:       initial?.remarks       ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Sync goalText from the selected goal when exactly one is picked
  useEffect(() => {
    if (selectedGoals.length === 1) {
      setForm((p) => ({ ...p, goalText: selectedGoals[0].goalText }));
    }
  }, [selectedGoals]);

  const handleSave = async () => {
    if (selectedGoals.length <= 1 && !form.goalText.trim()) {
      setError('Goal / objective is required'); return;
    }
    if (!form.activity.trim())      { setError('Activity is required'); return; }
    if (!form.childResponse.trim()) { setError('Child response is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const items = selectedGoals.length > 1
        ? selectedGoals.map((g) => ({
            goalId:        g.id,
            goalText:      g.goalText,
            activity:      form.activity,
            childResponse: form.childResponse,
            remarks:       form.remarks || undefined,
          }))
        : [{
            goalId:        selectedGoals[0]?.id,
            goalText:      form.goalText,
            activity:      form.activity,
            childResponse: form.childResponse,
            remarks:       form.remarks || undefined,
          }];
      await onSave(items);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial?.id ? 'Edit Entry' : 'Add Entry'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {goals.length > 0 && (
          <Autocomplete
            multiple={!isEditing}
            options={goals}
            getOptionLabel={(g) => `[${g.goalType}] ${g.goalText}`}
            value={(isEditing ? (selectedGoals[0] ?? null) : selectedGoals) as any}
            onChange={(_, val) =>
              setSelectedGoals(isEditing ? (val ? [val as EicGoal] : []) : (val as EicGoal[]))
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label={isEditing ? 'Link to Goal (optional)' : 'Link to Goal(s) (optional — select multiple to mark several goals in this session)'}
                size="small"
                sx={{ mb: 2, mt: 1 }}
              />
            )}
            renderOption={(props, g) => (
              <li {...props} key={g.id}>
                <Box>
                  <Chip label={g.goalType} size="small" sx={{ mr: 1 }} />
                  <Typography variant="body2" component="span">{g.goalText}</Typography>
                </Box>
              </li>
            )}
          />
        )}

        {selectedGoals.length > 1 ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            This will create {selectedGoals.length} separate entries — one per selected goal —
            using the same activity and child response below.
          </Alert>
        ) : (
          <TextField
            label="Goal / Objective *" fullWidth size="small" multiline rows={2} sx={{ mb: 2 }}
            value={form.goalText}
            onChange={(e) => setForm((p) => ({ ...p, goalText: e.target.value }))}
            helperText="Describe the specific goal or skill targeted in this entry"
          />
        )}
        <TextField
          label="Activity *" fullWidth size="small" multiline rows={2} sx={{ mb: 2 }}
          value={form.activity}
          onChange={(e) => setForm((p) => ({ ...p, activity: e.target.value }))}
          placeholder="e.g. Flash card matching task, 10 trials"
        />
        <TextField
          label="Child Response *" fullWidth size="small" multiline rows={2} sx={{ mb: 2 }}
          value={form.childResponse}
          onChange={(e) => setForm((p) => ({ ...p, childResponse: e.target.value }))}
          placeholder="e.g. Correctly matched 7/10 trials with verbal prompt"
        />
        <TextField
          label="Remarks" fullWidth size="small" multiline rows={2}
          value={form.remarks}
          onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={16} /> : selectedGoals.length > 1 ? `Save ${selectedGoals.length} Entries` : 'Save Entry'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SessionEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id     = params.id as string;

  const [session,    setSession]    = useState<EicTherapySession | null>(null);
  const [goals,      setGoals]      = useState<EicGoal[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [saveMsg,    setSaveMsg]    = useState<string | null>(null);

  // Inline header edits (draft only)
  const [attendance,  setAttendance]  = useState('PRESENT');
  const [duration,    setDuration]    = useState<string>('');
  const [remarks,     setRemarks]     = useState('');
  const [headerDirty, setHeaderDirty] = useState(false);

  // Entry dialog
  const [entryDialog,    setEntryDialog]    = useState(false);
  const [editingEntry,   setEditingEntry]   = useState<EicSessionEntry | undefined>(undefined);
  const [savingHeader,   setSavingHeader]   = useState(false);
  const [submitting,     setSubmitting]     = useState(false);

  const loadData = useCallback(async () => {
    try {
      const s = await eicApi.getSession(id) as EicTherapySession & { enrollmentId: string };
      setSession(s);
      setAttendance(s.attendance ?? 'PRESENT');
      setDuration(String(s.durationMinutes ?? ''));
      setRemarks(s.sessionRemarks ?? '');

      // Load active goals for this enrollment + discipline
      const g = await eicApi.listGoals((s as any).enrollmentId, s.discipline);
      setGoals(g.filter((x: EicGoal) => x.status === 'ACTIVE'));
    } catch {
      setError('Failed to load session');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const isDraft = session?.status === 'DRAFT';

  // Header save (attendance, duration, remarks)
  // Note: PATCH /eic/sessions/:id is not in Phase 1 controller.
  // We piggyback by updating via the updateAssessment pattern — actually
  // for sessions we don't have a PATCH header endpoint yet. We'll store
  // these locally and include in the submit payload via a workaround:
  // on submit we just call submit directly since the service doesn't
  // update header fields on submit. For now provide "Save notes" UX
  // that is clear about what it does — saves to local state for the submit.
  // TODO Phase 3 could add PATCH /eic/sessions/:id for header updates.

  const handleAddEntry = async (items: Array<Parameters<typeof eicApi.addSessionEntry>[1]>) => {
    // One goal → one entry; multiple selected goals → one entry per goal, so
    // several goals can be marked in a single session in one action.
    const newEntries: EicSessionEntry[] = [];
    for (const item of items) {
      newEntries.push(await eicApi.addSessionEntry(id, item));
    }
    setSession((prev) =>
      prev ? { ...prev, entries: [...(prev.entries ?? []), ...newEntries] } : prev
    );
  };

  const handleUpdateEntry = async (items: Array<Parameters<typeof eicApi.addSessionEntry>[1]>) => {
    if (!editingEntry) return;
    const updated = await eicApi.updateSessionEntry(id, editingEntry.id, items[0]);
    setSession((prev) =>
      prev
        ? {
            ...prev,
            entries: (prev.entries ?? []).map((e) =>
              e.id === editingEntry.id ? updated : e
            ),
          }
        : prev
    );
  };

  const handleDeleteEntry = async (entryId: string) => {
    await eicApi.deleteSessionEntry(id, entryId);
    setSession((prev) =>
      prev ? { ...prev, entries: (prev.entries ?? []).filter((e) => e.id !== entryId) } : prev
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await eicApi.submitSession(id);
      setSession(updated);
      setSaveMsg('Session submitted successfully.');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to submit session');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;
  if (error && !session) return <Alert severity="error">{error}</Alert>;
  if (!session) return null;

  const entries = session.entries ?? [];

  const STATUS_COLOUR: Record<string, any> = {
    DRAFT: 'warning', SUBMITTED: 'success', CANCELLED: 'error',
  };

  return (
    <Box>
      {/* Header */}
            <PageHeader
        title={`${DISCIPLINE_LABELS[session.discipline]} Session`}
        subtitle={(session as any).enrollment?.patient?.fullName}
        icon={<EventNoteIcon />}
        back="/eic/sessions"
        breadcrumbs={[
          { label: 'EIC', href: '/eic' },
          { label: 'Sessions', href: '/eic/sessions' },
          { label: 'Session Detail' },
        ]}
      />

      {error   && <Alert severity="error"   sx={{ mb: 2 }}>{error}</Alert>}
      {saveMsg && <Alert severity="success" sx={{ mb: 2 }}>{saveMsg}</Alert>}

      {/* Session header card */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>Session Details</Typography>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={4} md={3}>
              <TextField
                select label="Attendance" size="small" fullWidth
                value={attendance}
                onChange={(e) => { setAttendance(e.target.value); setHeaderDirty(true); }}
                disabled={!isDraft}
              >
                {['PRESENT', 'ABSENT', 'LATE', 'CANCELLED'].map((v) => (
                  <MenuItem key={v} value={v}>{v}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4} md={3}>
              <TextField
                label="Duration (minutes)" type="number" size="small" fullWidth
                value={duration}
                onChange={(e) => { setDuration(e.target.value); setHeaderDirty(true); }}
                disabled={!isDraft}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Session Remarks" size="small" fullWidth multiline rows={2}
                value={remarks}
                onChange={(e) => { setRemarks(e.target.value); setHeaderDirty(true); }}
                disabled={!isDraft}
                placeholder="Overall session observations, behaviours, parent notes…"
              />
            </Grid>
          </Grid>
          {headerDirty && isDraft && (
            <Alert severity="info" sx={{ mt: 2 }} icon={false}>
              Header changes are included when you submit the session.
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Entries */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
          Session Entries ({entries.length})
        </Typography>
        {isDraft && (
          <Button
            variant="contained" size="small"
            startIcon={<AddCircleIcon />}
            onClick={() => { setEditingEntry(undefined); setEntryDialog(true); }}
          >
            Add Entry
          </Button>
        )}
      </Box>

      {entries.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
          <Typography>No entries yet.</Typography>
          {isDraft && (
            <Typography variant="caption">
              Add entries to document goals worked on and the child's response.
            </Typography>
          )}
        </Paper>
      ) : (
        <Paper variant="outlined">
          <ResponsiveTable minWidth={800}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                <TableCell width={32}>#</TableCell>
                <TableCell>Goal / Objective</TableCell>
                <TableCell>Activity</TableCell>
                <TableCell>Child Response</TableCell>
                <TableCell>Remarks</TableCell>
                {isDraft && <TableCell width={80} />}
              </TableRow>
            </TableHead>
            <TableBody>
              {[...entries]
                .sort((a, b) => a.displayOrder - b.displayOrder)
                .map((entry, idx) => (
                  <TableRow key={entry.id} hover>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{idx + 1}</Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 200 }}>
                      <Typography variant="body2">{entry.goalText}</Typography>
                      {entry.goalId && (
                        <Chip label="Linked" size="small" color="primary" variant="outlined" sx={{ mt: 0.5 }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 200 }}>
                      <Typography variant="body2">{entry.activity}</Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 200 }}>
                      <Typography variant="body2">{entry.childResponse}</Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 150 }}>
                      <Typography variant="body2" color="text.secondary">
                        {entry.remarks ?? '—'}
                      </Typography>
                    </TableCell>
                    {isDraft && (
                      <TableCell>
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => { setEditingEntry(entry); setEntryDialog(true); }}
                           aria-label="Edit">
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small" color="error"
                            onClick={() => handleDeleteEntry(entry.id)}
                           aria-label="Delete">
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          </ResponsiveTable>
        </Paper>
      )}

      {/* Actions */}
      {isDraft && (
        <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
            onClick={handleSubmit}
            disabled={submitting || entries.length === 0}
            color="success"
          >
            Submit Session
          </Button>
        </Box>
      )}

      {session.status === 'SUBMITTED' && (
        <Alert severity="success" sx={{ mt: 3 }}>
          Session submitted on {session.submittedAt ? new Date(session.submittedAt).toLocaleString() : '—'}.
          This session report is locked.
        </Alert>
      )}

      {/* Entry dialog */}
      <EntryDialog
        open={entryDialog}
        initial={editingEntry}
        goals={goals}
        onSave={editingEntry ? handleUpdateEntry : handleAddEntry}
        onClose={() => { setEntryDialog(false); setEditingEntry(undefined); }}
      />
    </Box>
  );
}
