/**
 * Display board layout — bare wrapper, no sidebar/nav.
 * The <html>/<body> are handled by the root app/layout.tsx.
 * Designed to run full-screen on a TV via a browser in kiosk mode.
 */
import SessionTimeoutProvider from '@/providers/SessionTimeoutProvider';

export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionTimeoutProvider mode="operational">
      {children}
    </SessionTimeoutProvider>
  );
}
