'use client';

import { useQuery } from '@tanstack/react-query';
import { licenseApi } from '@/lib/api/license.api';
import ModuleNotLicensed from './ModuleNotLicensed';

interface ModuleGateProps {
  /** License module code, e.g. 'INCIDENT' — must match @RequireModule(...) on the backend. */
  requiredModule: string;
  /** Human-readable name shown in the "not licensed" panel, e.g. "Incident Management". */
  moduleLabel: string;
  children: React.ReactNode;
}

/**
 * Client-side counterpart to the backend's LicenseGuard/@RequireModule.
 * Wrap a module's layout with this so navigating directly to a route
 * (URL bar, bookmark, back-button, deep link — i.e. not through the
 * dashboard tile, whose `requiresModule` check already hides the entry
 * point) shows a proper "Module Not Licensed" panel instead of the page
 * rendering, firing off queries, and every one of them failing with a
 * raw 403/503.
 *
 * Reads the same `['license-status']` query already cached by
 * LicenseBanner, so this doesn't add an extra network round-trip in the
 * common case where that banner has already mounted.
 */
export default function ModuleGate({ requiredModule, moduleLabel, children }: ModuleGateProps) {
  const { data: status, isLoading } = useQuery({
    queryKey: ['license-status'],
    queryFn: licenseApi.getStatus,
    staleTime: 60_000,
  });

  // While resolving, render nothing rather than flashing the gate panel.
  if (isLoading || !status) return null;

  if (!status.isValid) {
    return <ModuleNotLicensed moduleLabel={moduleLabel} reason="expired" />;
  }

  if (!status.licensedModules.includes(requiredModule)) {
    return <ModuleNotLicensed moduleLabel={moduleLabel} reason="not-licensed" />;
  }

  return <>{children}</>;
}
