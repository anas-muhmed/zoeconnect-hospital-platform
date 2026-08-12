'use client';

import { SnackbarProvider as NotistackProvider } from 'notistack';

export default function SnackbarProvider({ children }: { children: React.ReactNode }) {
  return (
    <NotistackProvider
      maxSnack={4}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      autoHideDuration={4000}
    >
      {children}
    </NotistackProvider>
  );
}
