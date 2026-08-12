import SessionTimeoutProvider from '@/providers/SessionTimeoutProvider';

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionTimeoutProvider mode="operational">
      {children}
    </SessionTimeoutProvider>
  );
}
