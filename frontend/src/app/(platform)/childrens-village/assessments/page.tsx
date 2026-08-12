"use client";

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import AssignmentIcon from '@mui/icons-material/Assignment';
import SettingsIcon from '@mui/icons-material/Settings';
import AddIcon from '@mui/icons-material/Add';

import PageHeader from '@/components/PageHeader';

type TabValue = 'ALL' | 'DRAFT' | 'COMPLETED';

const ASSESSMENTS = [
  {
    id: 1,
    student: 'Alexander Chen',
    template: 'Sensory Profile (HDSP Standard)',
    date: '14 Aug 2026',
    assessor: 'Sarah Jenkins',
    score: '85/100',
    status: 'COMPLETED' as const,
  },
  {
    id: 2,
    student: 'Mia Santos',
    template: 'ADL Assessment (Custom)',
    date: '15 Aug 2026',
    assessor: 'David Ross',
    score: '--',
    status: 'DRAFT' as const,
  },
];

const STATUS_COLOR: Record<string, 'success' | 'warning'> = {
  COMPLETED: 'success',
  DRAFT: 'warning',
};

export default function AssessmentsPage() {
  const [activeTab, setActiveTab] = useState<TabValue>('ALL');

  const filtered = ASSESSMENTS.filter((a) => activeTab === 'ALL' || a.status === activeTab);

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Assessment Management"
        subtitle="Manage hybrid templates and track student clinical assessments."
        icon={<AssignmentIcon />}
        actions={
          <>
            <Button variant="outlined" startIcon={<SettingsIcon />}>
              Manage Templates
            </Button>
            <Button variant="contained" startIcon={<AddIcon />}>
              New Assessment
            </Button>
          </>
        }
      />

      <Tabs
        value={activeTab}
        onChange={(_, val) => setActiveTab(val)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="All Assessments" value="ALL" />
        <Tab label="Drafts" value="DRAFT" />
        <Tab label="Completed" value="COMPLETED" />
      </Tabs>

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell><b>Student Name</b></TableCell>
                <TableCell><b>Template</b></TableCell>
                <TableCell><b>Date Conducted</b></TableCell>
                <TableCell><b>Assessor</b></TableCell>
                <TableCell><b>Score</b></TableCell>
                <TableCell><b>Status</b></TableCell>
                <TableCell align="right"></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    No assessments found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {row.student}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {row.template}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {row.date}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {row.assessor}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        color={row.score === '--' ? 'text.disabled' : 'text.primary'}
                      >
                        {row.score}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={row.status}
                        size="small"
                        color={STATUS_COLOR[row.status]}
                        sx={{ fontWeight: 700, fontSize: 11 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" variant="text">
                        {row.status === 'DRAFT' ? 'Resume' : 'View'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
