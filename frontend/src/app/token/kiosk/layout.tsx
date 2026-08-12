import SessionTimeoutProvider from '@/providers/SessionTimeoutProvider';

export default function TokenKioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionTimeoutProvider mode="operational">
      {children}
    </SessionTimeoutProvider>
  );
}
