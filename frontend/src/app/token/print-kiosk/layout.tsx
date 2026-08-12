import SessionTimeoutProvider from '@/providers/SessionTimeoutProvider';

export default function TokenPrintKioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionTimeoutProvider mode="operational">
      {children}
    </SessionTimeoutProvider>
  );
}
