/**
 * Named display page layout — bare wrapper, no sidebar/nav.
 * Designed to run full-screen on a TV via a browser in kiosk mode.
 */
import SessionTimeoutProvider from '@/providers/SessionTimeoutProvider';

export default function NamedDisplayLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionTimeoutProvider mode="operational">
      {children}
    </SessionTimeoutProvider>
  );
}
