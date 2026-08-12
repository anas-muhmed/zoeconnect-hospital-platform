import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Token Queue | ZoeConnect',
};

export default function TokenLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
