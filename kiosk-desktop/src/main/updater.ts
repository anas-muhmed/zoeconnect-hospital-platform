import { logger } from './logger';

/**
 * Auto-update is explicitly OUT of scope for this task ("Do NOT implement
 * automatic updates now"). This module exists purely so the *shape* of an
 * updater is already wired into the app lifecycle (called once from
 * main/index.ts on startup), so adding real updates later (e.g. via
 * `electron-updater` pointed at a hospital-reachable file share or the
 * same artifact host the main HDSP installer could use) is a matter of
 * filling in `checkForUpdates()`, not restructuring the app.
 *
 * Deliberately does nothing today beyond logging that the check was
 * skipped, so its presence is visible in support logs without it having
 * any network or filesystem side effects.
 */
export function checkForUpdates(): void {
  logger.info('Auto-update check skipped (not implemented in this release)');
}
