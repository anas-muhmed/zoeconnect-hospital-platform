"use client";

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import HealingIcon from '@mui/icons-material/Healing';
import PageHeader from '@/components/PageHeader';

export default function TherapistDashboardPage() {
  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Therapist Dashboard"
        subtitle="Therapy carryover, IEP goals, and Home Programs."
        icon={<HealingIcon />}
        divider
      />

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2, height: 340, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" fontWeight={700} sx={{ pb: 1 }}>
              My Caseload (IEP Goals)
            </Typography>
            <Divider sx={{ mb: 1 }} />
            <List dense sx={{ overflowY: 'auto' }}>
              <ListItem
                sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 1 }}
                secondaryAction={<Chip label="Active" size="small" color="primary" variant="outlined" />}
              >
                <ListItemText primary="Leo M. (Speech)" />
              </ListItem>
            </List>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2, height: 340, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" fontWeight={700} sx={{ pb: 1 }}>
              Home Program Completion
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
              Analytics Placeholder
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2, height: 340, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" fontWeight={700} sx={{ pb: 1 }}>
              Behaviour Alerts
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
              No active alerts
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
