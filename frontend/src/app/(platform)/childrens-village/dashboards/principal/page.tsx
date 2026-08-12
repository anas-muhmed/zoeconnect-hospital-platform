"use client";

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import SchoolIcon from '@mui/icons-material/School';
import PageHeader from '@/components/PageHeader';

export default function PrincipalDashboardPage() {
  const metrics = [
    { label: 'Overall Attendance', value: '94.2%', trend: '+1.2%' },
    { label: 'IEP Reviews Pending', value: '12', trend: '-3' },
    { label: 'Behaviour Alerts', value: '5', trend: 'Critical' },
    { label: 'Curriculum On-Track', value: '88%', trend: '+2%' }
  ];

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Principal Dashboard"
        subtitle="High-level academic and operational overview."
        icon={<SchoolIcon />}
        divider
        actions={
          <Button variant="outlined" color="inherit" startIcon={<FileDownloadIcon />}>
            Export Snapshot
          </Button>
        }
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {metrics.map((m, i) => (
          <Grid item key={i} xs={12} sm={6} md={3}>
            <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2.5 }}>
              <Typography variant="caption" color="text.secondary">
                {m.label}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.5 }}>
                <Typography variant="h4" fontWeight={700}>
                  {m.value}
                </Typography>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  color={m.trend.includes('-') || m.trend === 'Critical' ? 'error.main' : 'success.main'}
                >
                  {m.trend}
                </Typography>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2, height: 340, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" fontWeight={700} sx={{ pb: 1 }}>
              Recent System Alerts
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Alert
                severity="error"
                action={
                  <Button color="inherit" size="small">
                    Review
                  </Button>
                }
              >
                [CRITICAL] Behaviour Escalation - Leo M.
              </Alert>
              <Alert
                severity="warning"
                action={
                  <Button color="inherit" size="small">
                    Acknowledge
                  </Button>
                }
              >
                [WARNING] IEP Review Due - Mia T.
              </Alert>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2, height: 340, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" fontWeight={700} sx={{ pb: 1 }}>
              Teacher DLR Completion (Last 7 Days)
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px dashed',
                borderColor: 'divider',
                borderRadius: 1,
                color: 'text.disabled',
              }}
            >
              AI-generated Chart Placeholder
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
