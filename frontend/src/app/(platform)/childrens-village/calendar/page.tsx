"use client";

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';

import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SyncIcon from '@mui/icons-material/Sync';
import AddIcon from '@mui/icons-material/Add';

import PageHeader from '@/components/PageHeader';

type ViewMode = 'MONTH' | 'WEEK';

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const EVENTS: Record<number, { label: string; color: string; bg: string; border: string }> = {
  15: { label: 'Annual Sports Day', color: 'secondary.dark', bg: 'secondary.50', border: 'secondary.200' },
  18: { label: 'Therapy Camp', color: 'success.dark', bg: 'success.50', border: 'success.200' },
  22: { label: 'Term 1 Exams Start', color: 'error.dark', bg: 'error.50', border: 'error.200' },
};

export default function UnifiedCalendarPage() {
  const [view, setView] = useState<ViewMode>('MONTH');

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Unified Calendar"
        subtitle="Academic days, therapy sessions, assessments, and school events."
        icon={<CalendarMonthIcon />}
        actions={
          <>
            <Button variant="outlined" startIcon={<SyncIcon />}>
              Sync Calendar
            </Button>
            <Button variant="contained" startIcon={<AddIcon />}>
              Add Event
            </Button>
          </>
        }
      />

      <Paper
        elevation={0}
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          p: 2,
          mb: 3,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton size="small" sx={{ border: 1, borderColor: 'divider' }}>
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
          <Typography variant="h6" fontWeight={700}>
            August 2026
          </Typography>
          <IconButton size="small" sx={{ border: 1, borderColor: 'divider' }}>
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Box>

        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_, val) => val && setView(val)}
          sx={{ bgcolor: 'grey.100', p: 0.5, borderRadius: 1.5 }}
        >
          <ToggleButton value="MONTH" sx={{ border: 0, borderRadius: 1 }}>
            Month
          </ToggleButton>
          <ToggleButton value="WEEK" sx={{ border: 0, borderRadius: 1 }}>
            Week
          </ToggleButton>
        </ToggleButtonGroup>
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '1px',
          bgcolor: 'divider',
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        {DAYS_OF_WEEK.map((day) => (
          <Box key={day} sx={{ bgcolor: 'grey.50', py: 1, textAlign: 'center' }}>
            <Typography
              variant="caption"
              fontWeight={700}
              color="text.secondary"
              sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
            >
              {day}
            </Typography>
          </Box>
        ))}

        {Array.from({ length: 35 }).map((_, i) => {
          const date = i - 2; // Offset for August starting on Saturday
          const isValid = date > 0 && date <= 31;
          const event = isValid ? EVENTS[date] : undefined;
          const isToday = date === 14;

          return (
            <Box
              key={i}
              sx={{
                minHeight: 100,
                bgcolor: isValid ? 'background.paper' : 'grey.50',
                p: 1,
              }}
            >
              {isValid && (
                <>
                  <Box sx={{ mb: 0.5 }}>
                    {isToday ? (
                      <Box
                        sx={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          bgcolor: 'primary.main',
                          color: 'primary.contrastText',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Typography variant="caption" fontWeight={700}>
                          {date}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2" fontWeight={500} color="text.primary">
                        {date}
                      </Typography>
                    )}
                  </Box>

                  {event && (
                    <Chip
                      label={event.label}
                      size="small"
                      sx={{
                        bgcolor: event.bg,
                        color: event.color,
                        border: 1,
                        borderColor: event.border,
                        fontSize: 11,
                        height: 22,
                        maxWidth: '100%',
                        mb: 0.5,
                        '& .MuiChip-label': {
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        },
                      }}
                    />
                  )}
                </>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
