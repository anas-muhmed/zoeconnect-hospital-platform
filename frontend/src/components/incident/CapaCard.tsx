import React from 'react';
import { Card, CardContent, CardHeader, Typography, Grid, Chip, Divider, Box, Button } from '@mui/material';
import { IncidentCapa } from '../../types/incident.types';
import { getActionStatusColor, getActionStatusLabel } from '../../lib/utils/incident-formatters';
import { format } from 'date-fns';
import { EmployeeName } from './EmployeeName';

interface CapaCardProps {
  capa: IncidentCapa;
  onUpdateStatus?: (status: string) => void;
  readOnly?: boolean;
}

export const CapaCard: React.FC<CapaCardProps> = ({ capa, onUpdateStatus, readOnly = false }) => {
  const isOverdue = new Date(capa.dueDate) < new Date() && capa.status !== 'COMPLETED';

  return (
    <Card variant="outlined" sx={{ mb: 2, borderColor: isOverdue ? 'error.main' : 'divider' }}>
      <CardHeader
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle1" fontWeight="bold">
              {capa.capaType === 'CORRECTIVE' ? 'Corrective Action' : 'Preventive Action'}
            </Typography>
            {isOverdue && <Chip label="Overdue" color="error" size="small" />}
          </Box>
        }
        action={
          <Chip
            label={getActionStatusLabel(capa.status)}
            color={getActionStatusColor(capa.status)}
            size="small"
          />
        }
        sx={{ pb: 1 }}
      />
      <Divider />
      <CardContent>
        <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
          {capa.title}
        </Typography>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>
          {capa.description}
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={6}>
            <Typography variant="caption" color="text.secondary" display="block">Due Date</Typography>
            <Typography variant="body2" color={isOverdue ? 'error.main' : 'text.primary'} fontWeight={isOverdue ? 'bold' : 'normal'}>
              {format(new Date(capa.dueDate), 'PP')}
            </Typography>
          </Grid>
          <Grid item xs={6}>
            <Typography variant="caption" color="text.secondary" display="block">Priority</Typography>
            <Typography variant="body2">{capa.priorityCode || '—'}</Typography>
          </Grid>
          {capa.department && (
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary" display="block">Department</Typography>
              <Typography variant="body2">{capa.department}</Typography>
            </Grid>
          )}
          <Grid item xs={12}>
             <Typography variant="caption" color="text.secondary" display="block">Owner</Typography>
             <EmployeeName id={capa.ownerId} variant="body2" />
          </Grid>
        </Grid>

        {!readOnly && capa.status !== 'COMPLETED' && onUpdateStatus && (
          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #f0f0f0', display: 'flex', gap: 1 }}>
            {capa.status === 'PENDING' && (
              <Button size="small" variant="outlined" color="primary" onClick={() => onUpdateStatus('IN_PROGRESS')}>
                Start Progress
              </Button>
            )}
            {capa.status === 'IN_PROGRESS' && (
              <Button size="small" variant="contained" color="success" onClick={() => onUpdateStatus('COMPLETED')}>
                Mark Completed
              </Button>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};
