import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { IncidentTimelineEvent } from '../../types/incident.types';
import { format } from 'date-fns';

interface IncidentTimelineProps {
  events: IncidentTimelineEvent[];
}

export const IncidentTimeline: React.FC<IncidentTimelineProps> = ({ events }) => {
  if (!events || events.length === 0) {
    return <Typography color="text.secondary">No timeline events recorded.</Typography>;
  }

  return (
    <Box sx={{ position: 'relative', ml: 2, borderLeft: '2px solid', borderColor: 'divider', pl: 3 }}>
      {events.map((event) => (
        <Box key={event.id} sx={{ position: 'relative', mb: 3 }}>
          <Box sx={{
            position: 'absolute',
            left: -33,
            top: 4,
            width: 12,
            height: 12,
            borderRadius: '50%',
            bgcolor: 'primary.main',
            border: '2px solid white',
            boxShadow: '0 0 0 2px #ccc'
          }} />
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="subtitle2" fontWeight="bold">
                {event.eventType}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {event.occurredAt && !isNaN(new Date(event.occurredAt).getTime()) 
                  ? format(new Date(event.occurredAt), 'PPp') 
                  : 'Unknown Date'}
              </Typography>
            </Box>
            <Typography variant="body2">{event.description}</Typography>
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                By: {event.actorName || 'System'}
              </Typography>
            </Box>
            {event.metadata && Object.keys(event.metadata).length > 0 && (
              <Box sx={{ mt: 1, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                {Object.entries(event.metadata).map(([key, value]) => (
                  <Typography key={key} variant="caption" display="block" color="text.secondary">
                    <strong>{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</strong> {String(value)}
                  </Typography>
                ))}
              </Box>
            )}
          </Paper>
        </Box>
      ))}
    </Box>
  );
};
