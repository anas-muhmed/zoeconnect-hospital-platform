export function getTokenDisplayUrl(slug: string, deploymentMode?: string, hospitalCode?: string, fullAbsolute: boolean = false): string {
  if (typeof window === 'undefined') return `/display/${slug}`;

  // Self-hosted keeps legacy route
  if (deploymentMode !== 'cloud') {
    return fullAbsolute ? `${window.location.origin}/display/${slug}` : `/display/${slug}`;
  }

  // Cloud mode uses new path architecture
  const tenantCode = hospitalCode || 'default';
  const path = `/token/display/${tenantCode}/${slug}`;
  return fullAbsolute ? `${window.location.origin}${path}` : path;
}
