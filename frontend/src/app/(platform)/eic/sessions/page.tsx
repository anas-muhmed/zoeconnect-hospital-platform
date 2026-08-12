'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActionArea from '@mui/material/CardActionArea';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

import EventNoteIcon from '@mui/icons-material/EventNote';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditNoteIcon from '@mui/icons-material/EditNote';

import {
  eicApi,
  type EicTherapySession,
  type EicDiscipline,
  DISCIPLINE_LABELS,
} from '@/lib/api/eic.api';
import PageHeader from '@/components/PageHeader';

const STATUS_COLOUR: Record<string, any> = {
  DRAFT:     'warning',
  SUBMITTED: 'success',
  CANCELLED: 'error',
};

function fmt(date: Date) {
  return date.toISOString().split('T')[0];
}

function shiftDate(date: string, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return fmt(d);
}

function displayDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

export default function EicSessionsPage() {
  const router = useRouter();
  const today  = fmt(new Date());

  const [date,       setDate]       = useState(today);
  const [discipline, setDiscipline] = useState<EicDiscipline | ''>('');
  const [sessions,   setSessions]   = useState<EicTherapySession[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  const load = useCallback(async (d: string, disc?: EicDiscipline) => {
    setLoading(true);
    setError(null);
    try {
      const data = await eicApi.listSessionsByDate(d, disc);
      setSessions(data);
    } catch {
      setError('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date, discipline || undefined);
  }, [date, discipline, load]);

  const grouped = sessions.reduce<Record<string, EicTherapySession[]>>((acc, s) => {
    const key = s.discipline;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const draftCount     = sessions.filter((s) => s.status === 'DRAFT').length;
  const submittedCount = sessions.filter((s) => s.status === 'SUBMITTED').length;

  return (
    <Box>
      <PageHeader
        title="Daily Sessions"
        subtitle="Therapy session log by date and discipline"
        icon={<EventNoteIcon />}
        back="/eic"
        breadcrumbs={[
          { label: 'Early Intervention', href: '/eic' },
          { label: 'Daily Sessions' },
        ]}
      />

      {/* Date nav */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent sx={{ py: '12px !important' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton size="small" onClick={() => setDate((d) => shiftDate(d, -1))}>
              <ChevronLeftIcon />
            </IconButton>
            <Typography fontWeight={600} sx={{ flex: 1, textAlign: 'center' }}>
              {displayDate(date)}
              {date === today && (
                <Chip label="Today" size="small" color="primary" sx={{ ml: 1 }} />
              )}
            </Typography>
            <IconButton
              size="small"
              onClick={() => setDate((d) => shiftDate(d, 1))}
              disabled={date >= today}
            >
              <ChevronRightIcon />
            </IconButton>
            <Tooltip title="Jump to today">
              <IconButton size="small" onClick={() => setDate(today)} disabled={date === today} aria-label="Jump to today">
                <TodayIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <TextField
              type="date"
              size="small"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              inputProps={{ max: today }}
              sx={{ width: 160 }}
            />
            <TextField
              select size="small" value={discipline}
              onChange={(e) => setDiscipline(e.target.value as EicDiscipline | '')}
              sx={{ width: 200 }}
              label="Discipline"
            >
              <MenuItem value="">All disciplines</MenuItem>
              {(Object.entries(DISCIPLINE_LABELS) as [EicDiscipline, string][]).map(([d, label]) => (
                <MenuItem key={d} value={d}>{label}</MenuItem>
              ))}
            </TextField>
          </Box>
        </CardContent>
      </Card>

      {/* Summary chips */}
      {!loading && sessions.length > 0 && (
        <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
          <Chip label={`${sessions.length} total`} size="small" />
          <Chip label={`${submittedCount} submitted`} size="small" color="success" icon={<CheckCircleIcon />} />
          {draftCount > 0 && (
            <Chip label={`${draftCount} pending submission`} size="small" color="warning" icon={<EditNoteIcon />} />
          )}
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : sessions.length === 0 ? (
        <Box sx={{ textAlign: 'center', mt: 8, color: 'text.secondary' }}>
          <EventNoteIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
          <Typography>No sessions recorded for this date.</Typography>
          <Typography variant="caption">
            Sessions are created from a patient's enrollment page.
          </Typography>
        </Box>
      ) : (
        <Box>
          {(Object.entries(grouped) as [EicDiscipline, EicTherapySession[]][]).map(([disc, list]) => (
            <Box key={disc} sx={{ mb: 3 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                {DISCIPLINE_LABELS[disc]} ({list.length})
              </Typography>
              <Grid container spacing={2}>
                {list.map((session) => (
                  <Grid item xs={12} sm={6} md={4} key={session.id}>
                    <Card
                      variant="outlined"
                      sx={{
                        borderLeft: 4,
                        borderColor: session.status === 'SUBMITTED'
                          ? 'success.main'
                          : session.status === 'CANCELLED'
                          ? 'error.main'
                          : 'warning.main',
                      }}
                    >
                      <CardActionArea onClick={() => router.push(`/eic/sessions/${session.id}`)}>
                        <CardContent>
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="body2" fontWeight={600}>
                              {session.therapistName}
                            </Typography>
                            <Chip
                              label={session.status}
                              size="small"
                              color={STATUS_COLOUR[session.status]}
                            />
                          </Box>
                          {session.durationMinutes && (
                            <Typography variant="caption" color="text.secondary">
                              {session.durationMinutes} min
                            </Typography>
                          )}
                          <Typography variant="caption" color="text.secondary" display="block">
                            Attendance: {session.attendance}
                          </Typography>
                          {session.entries && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              {session.entries.length} {session.entries.length === 1 ? 'entry' : 'entries'}
                            </Typography>
                          )}
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  </Grid>
                ))}
              </Grid>
              <Divider sx={{ mt: 2 }} />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
