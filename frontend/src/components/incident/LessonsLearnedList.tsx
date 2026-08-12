import React from 'react';
import { Box, Typography, Paper, Stack } from '@mui/material';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import { format } from 'date-fns';
import Link from 'next/link';

interface LessonsLearnedListProps {
  // Raw SQL query result — key casing/aliasing isn't guaranteed (e.g.
  // "incident_id" vs "cl_incident_id" depending on TypeORM's auto-alias
  // behavior for un-aliased select columns), so we normalize defensively.
  data: Record<string, any>[];
}

function pick(row: Record<string, any>, ...keys: string[]): any {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return row[k];
  }
  return undefined;
}

export const LessonsLearnedList: React.FC<LessonsLearnedListProps> = ({ data }) => {
  const rows = data.map((row) => ({
    incidentId: pick(row, 'incident_id', 'cl_incident_id', 'incidentId'),
    lessonsLearned: pick(row, 'lessons_learned', 'cl_lessons_learned', 'lessonsLearned'),
    closedAt: pick(row, 'closed_at', 'cl_closed_at', 'closedAt'),
  }));

  return (
    <Stack spacing={1.5}>
      {rows.map((row, idx) => (
        <Paper
          key={row.incidentId || idx}
          component={row.incidentId ? Link : 'div'}
          href={row.incidentId ? `/incident/${row.incidentId}` : undefined}
          variant="outlined"
          sx={{
            p: 1.5,
            display: 'flex',
            gap: 1.5,
            textDecoration: 'none',
            color: 'inherit',
            transition: 'background-color 0.15s ease',
            '&:hover': row.incidentId ? { bgcolor: 'action.hover' } : undefined,
          }}
        >
          <LightbulbOutlinedIcon fontSize="small" sx={{ color: 'warning.main', mt: 0.3, flexShrink: 0 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {row.lessonsLearned}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Closed {row.closedAt ? format(new Date(row.closedAt), 'PP') : '—'}
            </Typography>
          </Box>
        </Paper>
      ))}
    </Stack>
  );
};
