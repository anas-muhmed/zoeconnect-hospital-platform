import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { HisSyncService } from './his-sync.service';
import { LicenseService } from '../../licensing/license.service';

// ─────────────────────────────────────────────────────────────────────────────
//  HIS Sync Scheduler
//
//  Uses a plain setInterval rather than @nestjs/schedule Cron so the interval
//  is self-throttling: the next tick only fires AFTER the current sync
//  completes.  This prevents overlapping Oracle queries if a cycle takes
//  longer than the interval (e.g., large batch of bills on first boot).
//
//  Interval: HIS_SYNC_INTERVAL_MS env var (default 10 000 ms = 10 seconds)
//  Set to 5000 for near-real-time on fast networks; increase to 30 000 on
//  slower hospital LANs or when Oracle load is a concern.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class HisSyncScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(HisSyncScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  /** Logged once per unlicensed streak so a missing LOYALTY license doesn't spam the log every tick. */
  private loggedUnlicensedSkip = false;

  constructor(
    private readonly syncService: HisSyncService,
    private readonly licenseService: LicenseService,
  ) {}

  // Called once NestJS has fully initialised all modules
  onApplicationBootstrap(): void {
    const intervalMs = parseInt(process.env['HIS_SYNC_INTERVAL_MS'] ?? '10000', 10);

    this.logger.log(
      `HIS real-time sync started — polling every ${intervalMs / 1000}s. ` +
      `Set HIS_SYNC_INTERVAL_MS in .env to change.`,
    );

    // Run once immediately on boot, then on each interval
    this.tick().catch(() => {/* first-tick errors already logged inside tick() */});

    this.timer = setInterval(() => {
      this.tick().catch(() => {/* errors logged inside tick() */});
    }, intervalMs);
  }

  // Graceful shutdown — stop the timer before the process exits
  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.log('HIS sync scheduler stopped.');
    }
  }

  // ── Single poll tick ──────────────────────────────────────────────────────
  private async tick(): Promise<void> {
    // This entire sync converts HIS bills into loyalty points (writes to
    // loyalty_accounts/loyalty_transactions -- see his-sync.service.ts's
    // header comment) -- it is a LOYALTY-only feature, but this scheduler
    // used to run it unconditionally regardless of license state. On a
    // PLATFORM+QUEUE-only license (no LOYALTY), every tick was hitting
    // Oracle for nothing, permanently failing with whatever billing table
    // isn't configured/doesn't exist, and consuming Oracle connection pool
    // capacity every HIS_SYNC_INTERVAL_MS for a feature the hospital isn't
    // even licensed to use. Checked fresh (cheaply, via LicenseService's own
    // cache) on every tick rather than once at boot, so this correctly
    // starts syncing the moment LOYALTY is licensed/activated, and stops
    // again if it lapses -- no restart required either way.
    const licensed = await this.licenseService.isModuleLicensed('LOYALTY');
    if (!licensed) {
      if (!this.loggedUnlicensedSkip) {
        this.logger.log('LOYALTY module not licensed — HIS bill-to-loyalty sync paused.');
        this.loggedUnlicensedSkip = true;
      }
      return;
    }
    this.loggedUnlicensedSkip = false;

    // Guard against overlapping cycles (in case Oracle is slow)
    if (this.running) {
      this.logger.debug('Previous HIS sync cycle still running — skipping tick');
      return;
    }

    this.running = true;
    try {
      await this.syncService.syncNewBills();
    } catch (err) {
      // Errors inside syncNewBills are caught per-bill; this catches
      // unexpected top-level failures (e.g., Redis down)
      this.logger.error(`HIS sync tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
