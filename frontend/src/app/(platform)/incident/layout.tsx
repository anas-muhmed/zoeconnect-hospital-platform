import React from 'react';
import { Box } from '@mui/material';
import ModuleGate from '@/components/ModuleGate';

export default function IncidentLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ p: 3, maxWidth: 1600, margin: '0 auto', width: '100%' }}>
      <ModuleGate requiredModule="INCIDENT" moduleLabel="Incident Management">
        {children}
      </ModuleGate>
    </Box>
  );
}
