"use client";

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';

import AssessmentIcon from '@mui/icons-material/Assessment';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

import PageHeader from '@/components/PageHeader';

const REPORTS = [
  { value: 'STUDENT_PROGRESS', label: 'Student Progress' },
  { value: 'CLASS_REGISTER', label: 'Class Register' },
  { value: 'ATTENDANCE_SUMMARY', label: 'Attendance Summary' },
];

const REPORT_TITLES: Record<string, string> = {
  STUDENT_PROGRESS: 'Student Progress Report',
  CLASS_REGISTER: 'Class Register',
  ATTENDANCE_SUMMARY: 'Attendance Summary',
};

export default function ReportBuilderPage() {
  const [selectedReport, setSelectedReport] = useState('STUDENT_PROGRESS');

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Report Builder"
        subtitle="Generate dynamic operational and analytical reports."
        icon={<AssessmentIcon />}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 3fr' }, gap: 3 }}>
        {/* Sidebar */}
        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2, alignSelf: 'start' }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
            Available Reports
          </Typography>
          <Divider sx={{ mb: 1 }} />
          <List dense disablePadding>
            {REPORTS.map((r) => (
              <ListItemButton
                key={r.value}
                selected={selectedReport === r.value}
                onClick={() => setSelectedReport(r.value)}
                sx={{
                  borderRadius: 1,
                  mb: 0.5,
                  '&.Mui-selected': {
                    bgcolor: 'primary.50',
                    color: 'primary.main',
                  },
                }}
              >
                <ListItemText
                  primaryTypographyProps={{
                    fontSize: 14,
                    fontWeight: selectedReport === r.value ? 600 : 400,
                  }}
                  primary={r.label}
                />
              </ListItemButton>
            ))}
          </List>
        </Paper>

        {/* Main Content */}
        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6" fontWeight={700}>
              {REPORT_TITLES[selectedReport]}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" variant="outlined" startIcon={<FileDownloadIcon />}>
                Export CSV
              </Button>
              <Button size="small" variant="outlined" startIcon={<PictureAsPdfIcon />}>
                Export PDF
              </Button>
            </Box>
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
              gap: 2,
              mb: 3,
              alignItems: 'end',
            }}
          >
            <TextField select size="small" label="Academic Year" defaultValue="2026-2027" fullWidth>
              <MenuItem value="2026-2027">2026-2027</MenuItem>
            </TextField>
            <TextField select size="small" label="Grade" defaultValue="All Grades" fullWidth>
              <MenuItem value="All Grades">All Grades</MenuItem>
              <MenuItem value="Grade 1">Grade 1</MenuItem>
            </TextField>
            <Button variant="contained" startIcon={<PlayArrowIcon />} fullWidth>
              Run Report
            </Button>
          </Box>

          <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ bgcolor: 'grey.50', px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="body2" fontWeight={600} color="text.secondary">
                Preview (Top 50 rows)
              </Typography>
            </Box>
            <Box sx={{ p: 5, textAlign: 'center' }}>
              <Typography variant="body2" color="text.disabled">
                Click &apos;Run Report&apos; to generate data preview.
              </Typography>
            </Box>
          </Paper>
        </Paper>
      </Box>
    </Box>
  );
}
