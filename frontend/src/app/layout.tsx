import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v14-appRouter';
import QueryProvider from '@/providers/QueryProvider';
import ThemeProvider from '@/providers/ThemeProvider';
import AuthProvider from '@/providers/AuthProvider';
import SnackbarProvider from '@/providers/SnackbarProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'ZoeConnect — Digital Service Platform',
    template: '%s | ZoeConnect',
  },
  description: 'Digital Service Platform',
  keywords: ['integration', 'automation', 'workflow', 'enterprise', 'ai', 'connectivity', 'digital transformation'],
  robots: { index: false, follow: false },  // Internal system — no indexing
};

// Touch interaction audit, Phase 2: Next.js injects a default
// `width=device-width, initial-scale=1` viewport meta tag automatically,
// but without `viewportFit: 'cover'` the app never opts into drawing under
// a notch/status-bar/home-indicator -- `env(safe-area-inset-*)` CSS values
// stay 0 everywhere regardless of what CSS uses them, which matters most
// for the full-screen kiosk/display/token pages (frontend/src/app/kiosk,
// display, token/kiosk, token/display, token/print-kiosk) that are meant
// to run edge-to-edge on physical tablet/TV hardware. Kept `maximum-scale`
// unset (matches the audit's finding that no pinch-zoom lock exists
// anywhere in this app today) so this doesn't newly block pinch-zoom
// accessibility for anyone.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AppRouterCacheProvider>
          <QueryProvider>
            <ThemeProvider>
              <SnackbarProvider>
                <AuthProvider>
                  {children}
                </AuthProvider>
              </SnackbarProvider>
            </ThemeProvider>
          </QueryProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
