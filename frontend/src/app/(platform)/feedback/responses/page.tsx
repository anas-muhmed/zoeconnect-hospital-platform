'use client';

/**
 * Minimal admin visibility into submissions -- lets Phase 2 be verified
 * end-to-end (QR -> public portal -> submission actually lands). A full
 * analytics dashboard/report builder is a later phase.
 */

import { useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface Submission {
  id: string;
  formId: string;
  campaignId: string;
  overallRating: number | null;
  status: string;
  submittedAt: string;
  language: string | null;
}

interface Answer {
  id: string;
  questionTextSnapshot: string;
  questionType: string;
  value: unknown;
  /** Human-readable rendering resolved at submission time (e.g. an option's label, not its raw code) -- null for submissions received before this existed. */
  displayValue: string | null;
}

/** Prefers the snapshotted displayValue; falls back to the raw value for older submissions that predate it. */
function renderAnswerValue(a: Answer): string {
  if (a.displayValue) return a.displayValue;
  return Array.isArray(a.value) ? a.value.join(', ') : String(a.value ?? '');
}

function SubmissionRow({ submission }: { submission: Submission }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery<{ submission: Submission; answers: Answer[] }>({
    queryKey: ['feedback-response-detail', submission.id],
    queryFn: () => apiClient.get(`/feedback/responses/${submission.id}`).then(r => r.data),
    enabled: open,
  });

  return (
    <Paper sx={{ p: 2, mb: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="body2" color="text.secondary">
            {new Date(submission.submittedAt).toLocaleString()}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
            <Chip size="small" label={submission.status} />
            {submission.overallRating !== null && <Chip size="small" color="primary" label={`Rating: ${submission.overallRating}`} />}
            {submission.language && <Chip size="small" variant="outlined" label={submission.language.toUpperCase()} />}
          </Box>
        </Box>
        <IconButton size="small" onClick={() => setOpen(o => !o)}>
          {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>
      <Collapse in={open}>
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {!data && <CircularProgress size={20} />}
          {data?.answers.map(a => (
            <Box key={a.id}>
              <Typography variant="body2" fontWeight={600}>{a.questionTextSnapshot}</Typography>
              <Typography variant="body2" color="text.secondary">
                {renderAnswerValue(a) || <em>No answer</em>}
              </Typography>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Paper>
  );
}

export default function FeedbackResponsesPage() {
  const { data: submissions = [], isLoading } = useQuery<Submission[]>({
    queryKey: ['feedback-responses'],
    queryFn: () => apiClient.get('/feedback/responses').then(r => r.data),
  });

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading responses...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>Feedback Responses</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Submissions received through the public feedback portal, most recent first.
      </Typography>

      {submissions.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">No submissions yet. Generate a QR code and try the public portal end-to-end.</Typography>
        </Paper>
      )}

      {submissions.map(s => <SubmissionRow key={s.id} submission={s} />)}
    </Box>
  );
}
