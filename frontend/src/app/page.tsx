import { redirect } from 'next/navigation';

/**
 * Root page — redirects to login.
 * Once authenticated, users are redirected to /dashboard.
 */
export default function RootPage() {
  redirect('/login');
}
