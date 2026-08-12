/**
 * Build/version metadata (readiness follow-up, 2026-08). Mirrors the
 * hospital backend's `common/build-info.ts` -- see that file's own
 * comment for the full rationale. `APP_VERSION` / `RELEASE_ID` are
 * populated by docker-compose.yml from deploy.sh/rollback.sh's already-
 * exported VENDOR_BACKEND_VERSION / SHORT_SHA.
 */
export const STARTED_AT = new Date();

export function getBuildInfo() {
  return {
    version: process.env.APP_VERSION ?? 'unknown',
    release: process.env.RELEASE_ID ?? 'unknown',
    startedAt: STARTED_AT.toISOString(),
    uptime: formatUptime(Date.now() - STARTED_AT.getTime()),
  };
}

export function formatUptime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h${minutes}m`;
  if (minutes > 0) return `${minutes}m${seconds}s`;
  return `${seconds}s`;
}
