/**
 * Canonical CMS Digital Signage player URL: ALWAYS tenant-scoped, regardless
 * of deployment mode (cloud vs self-hosted) -- deployment mode governs
 * deployment-specific behavior elsewhere in the app, but never whether a
 * display's URL is tenant-scoped. Both deployment modes are served by the
 * same backend route (`CmsPublicPlayerController`, `GET/POST
 * /player/:tenantCode/:slug/*`), which resolves `tenantCode` -> `tenantId`
 * and looks the display up by the composite `(tenantId, slug)` key -- see
 * `CmsDisplayService.findBySlug()`.
 *
 * Single source of truth shared by the CMS Displays page and CMS Monitoring
 * page (and any future CMS admin surface that needs to show/link a player
 * URL) so the two can't drift back into duplicated, inconsistent
 * deployment-mode branching.
 *
 * `tenantCode` should come from the current tenant's own license/context
 * (e.g. `licenseStatus.hospitalCode`) -- never a hardcoded `"default"`. If
 * it isn't available yet, this returns `null` so callers can render a
 * loading state instead of a URL that would resolve to the wrong tenant.
 */
export function getCmsPlayerUrl(
  slug: string,
  tenantCode: string | null | undefined,
  fullAbsolute: boolean = false,
): string | null {
  if (!tenantCode) return null;

  const path = `/player/${tenantCode}/${slug}`;
  if (!fullAbsolute) return path;
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}
