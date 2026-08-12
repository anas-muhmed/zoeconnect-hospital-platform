'use client';

import Box from '@mui/material/Box';
import { usePathname } from 'next/navigation';
import BillingSubNav from './_components/BillingSubNav';

/**
 * Shared shell for the three billing user journeys (Subscribe / My
 * Subscription / Billing History). The bare `/settings/billing` route
 * itself is redirect-only (see page.tsx) and never renders real content,
 * so the sub-nav is hidden there to avoid a flash of tabs immediately
 * followed by a redirect.
 */
export default function BillingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showSubNav = pathname !== '/settings/billing';

  return (
    <Box sx={{ minHeight: '100%' }}>
      {showSubNav && <BillingSubNav />}
      {children}
    </Box>
  );
}
