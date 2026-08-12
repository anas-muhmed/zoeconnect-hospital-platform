'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActionArea from '@mui/material/CardActionArea';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';

import ChildCareIcon     from '@mui/icons-material/ChildCare';
import PeopleAltIcon     from '@mui/icons-material/PeopleAlt';
import AssignmentIcon    from '@mui/icons-material/Assignment';
import EventNoteIcon     from '@mui/icons-material/EventNote';
import SummarizeIcon     from '@mui/icons-material/Summarize';
import SchoolIcon        from '@mui/icons-material/School';
import AddCircleIcon     from '@mui/icons-material/AddCircle';
import SyncIcon          from '@mui/icons-material/Sync';
import PersonAddIcon     from '@mui/icons-material/PersonAdd';

import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';

const QUICK_LINKS = [
  {
    label:       'Patients',
    description: 'View & search EIC patients',
    icon:        <PeopleAltIcon fontSize="large" color="primary" />,
    href:        '/eic/patients',
  },
  {
    label:       'Countersign Queue',
    description: 'Review & countersign submitted assessments',
    icon:        <AssignmentIcon fontSize="large" color="primary" />,
    href:        '/eic/assessments',
  },
  {
    label:       'Register Manually',
    description: 'Register a patient when HIS is unavailable',
    icon:        <PersonAddIcon fontSize="large" color="primary" />,
    href:        '/eic/patients/new',
  },
  {
    label:       'Daily Sessions',
    description: 'Log and review therapy sessions',
    icon:        <EventNoteIcon fontSize="large" color="primary" />,
    href:        '/eic/sessions',
  },
  {
    label:       'Progress Reports',
    description: 'Progress reports & sign-offs (3M, 6M, annual)',
    icon:        <SummarizeIcon fontSize="large" color="primary" />,
    href:        '/eic/progress-reports',
  },
  {
    label:       'Preschool',
    description: 'Preschool attendance & daily reports',
    icon:        <SchoolIcon fontSize="large" color="primary" />,
    href:        '/eic/preschool',
  },
  {
    label:       'HIS Sync',
    description: 'Sync patient demographics from Oracle HIS',
    icon:        <SyncIcon fontSize="large" color="primary" />,
    href:        '/eic/sync',
  },
];

export default function EicDashboardPage() {
  const router = useRouter();

  return (
    <Box>
      <PageHeader
        title="Early Intervention Centre"
        subtitle="Therapy management for children with developmental disabilities"
        icon={<ChildCareIcon />}
        actions={
          <Button variant="contained" startIcon={<AddCircleIcon />}
            onClick={() => router.push('/eic/patients/search')}>
            New Admission
          </Button>
        }
      />

      {/* Quick Links */}
      <Grid container spacing={3}>
        {QUICK_LINKS.map((link) => (
          <Grid item xs={12} sm={6} md={4} key={link.label}>
            <Card elevation={1} sx={{ height: '100%' }}>
              <CardActionArea onClick={() => router.push(link.href)} sx={{ height: '100%', p: 1 }}>
                <CardContent>
                  <Box sx={{ mb: 1.5 }}>{link.icon}</Box>
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    {link.label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {link.description}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
