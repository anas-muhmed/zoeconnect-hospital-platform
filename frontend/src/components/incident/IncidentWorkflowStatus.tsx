import React from 'react';
import { Box, Paper, Typography, Chip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { IncidentTimelineEvent } from '../../types/incident.types';
import { deriveWorkflowStepStates, getNextStepMessage } from '../../lib/utils/incident-workflow';

interface IncidentWorkflowStatusProps {
  status: string;
  timelineEvents: IncidentTimelineEvent[];
}

export const IncidentWorkflowStatus: React.FC<IncidentWorkflowStatusProps> = ({ status, timelineEvents }) => {
  const steps = deriveWorkflowStepStates(status, timelineEvents);
  const current = steps.find((s) => s.state === 'current');
  const pending = steps.filter((s) => s.state === 'pending');
  const nextStepMessage = getNextStepMessage(status);

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 3 }}>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Workflow Status
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
        {steps.map((step, i) => (
          <React.Fragment key={step.key}>
            <Chip
              size="small"
              icon={
                step.state === 'completed'
                  ? <CheckCircleIcon fontSize="small" />
                  : step.state === 'pending'
                    ? <RadioButtonUncheckedIcon fontSize="small" />
                    : undefined
              }
              label={step.label + (step.state === 'skipped' ? ' (skipped)' : step.optional && step.state === 'pending' ? ' (optional)' : '')}
              color={step.state === 'completed' ? 'success' : step.state === 'current' ? 'primary' : 'default'}
              variant={step.state === 'current' ? 'filled' : 'outlined'}
              sx={{
                opacity: step.state === 'skipped' ? 0.5 : 1,
                fontWeight: step.state === 'current' ? 700 : 400,
              }}
            />
            {i < steps.length - 1 && (
              <ArrowForwardIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
            )}
          </React.Fragment>
        ))}
      </Box>

      <Typography variant="body2">
        <Box component="span" fontWeight={600}>Current stage:</Box> {current?.label ?? status}
      </Typography>
      <Typography variant="body2" color="primary.main" sx={{ mt: 0.5 }}>
        <Box component="span" fontWeight={600}>Next step:</Box> {nextStepMessage}
      </Typography>
      {pending.length > 0 && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
          Still pending: {pending.map((s) => s.label).join(' → ')}
        </Typography>
      )}
    </Paper>
  );
};
