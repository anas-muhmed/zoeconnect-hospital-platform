'use client';

import Box from '@mui/material/Box';

export default function EicLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {children}
    </Box>
  );
}
