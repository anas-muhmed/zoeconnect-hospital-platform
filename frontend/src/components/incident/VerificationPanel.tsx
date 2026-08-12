import React from 'react';
import { Card, CardContent, Typography, Box, Divider, Chip, Button } from '@mui/material';
import { IncidentVerification } from '../../types/incident.types';
import { getVerificationOutcomeColor, getVerificationOutcomeLabel } from '../../lib/utils/incident-formatters';
import { format } from 'date-fns';
import { EmployeeName } from './EmployeeName';

interface VerificationPanelProps {
  verifications: IncidentVerification[];
  onVerify?: () => void;
  canVerify?: boolean;
}

export const VerificationPanel: React.FC<VerificationPanelProps> = ({ verifications, onVerify, canVerify = false }) => {
  return (
    <Card variant="outlined">
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Verification History</Typography>
        {canVerify && (
          <Button variant="contained" size="small" onClick={onVerify}>
            Add Verification
          </Button>
        )}
      </Box>
      <Divider />
      <CardContent>
        {verifications.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No verifications have been recorded yet.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {verifications.map((v) => (
              <Box key={v.id} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Box>
                    <Typography component="div" variant="subtitle2" fontWeight="bold">
                      Verified by <EmployeeName id={v.verifiedById} component="span" variant="subtitle2" fontWeight="bold" />
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {format(new Date(v.verifiedAt), 'PP p')}
                    </Typography>
                  </Box>
                  <Chip 
                    label={getVerificationOutcomeLabel(v.outcome)} 
                    color={getVerificationOutcomeColor(v.outcome)}
                    size="small"
                  />
                </Box>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>
                  {v.notes}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};
