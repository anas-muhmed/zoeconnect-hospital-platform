"use client";

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Divider from '@mui/material/Divider';
import AddIcon from '@mui/icons-material/Add';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PageHeader from '@/components/PageHeader';

const STATUS_COLOR: Record<string, 'success' | 'default' | 'error' | 'warning'> = {
  ACTIVE: 'success',
  DRAFT: 'default',
  REVIEW_DUE: 'error',
  UNDER_REVIEW: 'warning',
  ARCHIVED: 'default',
};

export default function IepDashboardPage() {
  const [activeTab, setActiveTab] = useState('active');

  const ieps = [
    { id: 'iep-1', student: 'Leo M.', grade: 'Grade 1', status: 'ACTIVE', version: 2, nextReview: '2026-09-01' },
    { id: 'iep-2', student: 'Mia T.', grade: 'Pre-K', status: 'DRAFT', version: 1, nextReview: '-' },
    { id: 'iep-3', student: 'Noah R.', grade: 'Grade 2', status: 'REVIEW_DUE', version: 1, nextReview: '2026-08-01' },
  ];

  const tabList = ['ACTIVE', 'DRAFT', 'UNDER_REVIEW', 'REVIEW_DUE', 'ARCHIVED'];
  const filtered = ieps.filter((iep) => iep.status.toLowerCase() === activeTab);

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="IEP Management"
        subtitle="Manage Individual Education Plans (IEP), Goals, and Reviews."
        icon={<AssignmentIcon />}
        actions={
          <Button variant="contained" startIcon={<AddIcon />}>
            New IEP
          </Button>
        }
      />

      <Divider sx={{ mb: 3 }} />

      {/* Status filter chips */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
        {tabList.map((tab) => (
          <Chip
            key={tab}
            label={tab.replace('_', ' ')}
            clickable
            onClick={() => setActiveTab(tab.toLowerCase())}
            color={activeTab === tab.toLowerCase() ? 'primary' : 'default'}
            variant={activeTab === tab.toLowerCase() ? 'filled' : 'outlined'}
            sx={{ fontWeight: 600 }}
          />
        ))}
      </Box>

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell><b>Student</b></TableCell>
                <TableCell><b>Grade/Level</b></TableCell>
                <TableCell><b>Version</b></TableCell>
                <TableCell><b>Next Review</b></TableCell>
                <TableCell><b>Status</b></TableCell>
                <TableCell align="right"><b>Actions</b></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((iep) => (
                <TableRow key={iep.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{iep.student}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">{iep.grade}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">v{iep.version}.0</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      color={iep.status === 'REVIEW_DUE' ? 'error.main' : 'text.secondary'}
                      fontWeight={iep.status === 'REVIEW_DUE' ? 600 : 400}
                    >
                      {iep.nextReview}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={iep.status.replace('_', ' ')}
                      size="small"
                      color={STATUS_COLOR[iep.status] ?? 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Link href="#" underline="hover" sx={{ fontSize: 14, fontWeight: 600, mr: 2 }}>
                      View
                    </Link>
                    <Link href="#" underline="hover" sx={{ fontSize: 14, fontWeight: 600 }}>
                      Review
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    No IEPs found in {activeTab.replace('_', ' ')} status.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
