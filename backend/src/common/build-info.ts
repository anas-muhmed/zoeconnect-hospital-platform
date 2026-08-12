/**
 * Build/version metadata (readiness follow-up, 2026-08). Once there's more
 * than one backend replica, knowing WHICH release/image actually answered
 * a given readiness probe is genuinely useful debugging information --
 * captured once at module load (process boot), never recomputed per
 * request.
 *
 * `APP_VERSION` / `RELEASE_ID` are populated by docker-compose.yml from
 * deploy.sh/rollback.sh's already-exported BACKEND_VERSION / SHORT_SHA
 * (see that compose file's matching comment on hdsp-backend). Both fall
 * back to 'unknown' for local/non-Docker runs where those env vars were
 * never set -- never throws, never blocks boot.
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
