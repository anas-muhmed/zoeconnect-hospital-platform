"use client";

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import PageHeader from '@/components/PageHeader';

export default function AdminDashboardPage() {
  const metrics = [
    { label: 'Active Students', value: '412', trend: '+15 this year' },
    { label: 'Capacity', value: '85%', trend: 'Approaching limit' },
    { label: 'License Status', value: 'Active', trend: 'Expires 2027' },
    { label: 'System Health', value: '100%', trend: 'All systems go' }
  ];

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Administrator Dashboard"
        subtitle="System configuration, admissions, and capacity."
        icon={<AdminPanelSettingsIcon />}
        divider
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {metrics.map((m, i) => (
          <Grid item key={i} xs={12} sm={6} md={3}>
            <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2.5 }}>
              <Typography variant="caption" color="text.secondary">
                {m.label}
              </Typography>
              <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5 }}>
                {m.value}
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                {m.trend}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
        <Typography variant="h6" fontWeight={700} sx={{ pb: 1 }}>
          Recent Admissions
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell><b>Student</b></TableCell>
                <TableCell><b>Date</b></TableCell>
                <TableCell><b>Assigned Grade</b></TableCell>
                <TableCell><b>Status</b></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>
                    New Student A
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    2026-08-01
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    Grade 1
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip label="Enrolled" size="small" color="success" variant="outlined" />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
