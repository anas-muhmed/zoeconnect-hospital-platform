import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { LicenseService } from '../../modules/licensing/license.service';

/**
 * "Critical subsystems, not just infrastructure" readiness follow-up
 * (2026-08). Postgres/Redis being reachable doesn't prove the licensing
 * subsystem actually works end-to-end -- it has its own DB reads, its own
 * Redis-backed cache, and its own tenant-resolution logic.
 *
 * CRITICAL FIX (passive-health follow-up, 2026-08): this used to call the
 * real `LicenseService.getStatus()` on every check -- a genuine DB/Redis
 * round-trip on Docker's own HEALTHCHECK cadence (every 15s per
 * container). At any real scale (multiple tenants, multiple backend
 * replicas) that's a permanent background query load that exists solely
 * because Docker wants a health answer, unrelated to actual traffic. Now
 * reads `LicenseService.getHealthSnapshot()` -- a synchronous, zero-I/O
 * getter backed by state that's only ever updated as a side effect of
 * REAL business traffic (the one-time boot check in onModuleInit(), and
 * getStatus()'s own normal call path), never by this health check itself.
 * "Health" no longer triggers "work."
 *
 * Failure conditions are narrow, on purpose: only `!initialized` (the
 * subsystem never completed its one-time boot verification -- a real,
 * structural problem) counts as unhealthy. A `lastSuccessfulCheck` that's
 * old or `null` is reported as informational detail, not a failure --
 * a backend with no recent license-checking traffic is a normal, healthy
 * state, not a degraded one.
 */
@Injectable()
export class LicenseHealthIndicator extends HealthIndicator {
  constructor(private readonly licenseService: LicenseService) {
    super();
  }

  isHealthy(key: string): HealthIndicatorResult {
    const snapshot = this.licenseService.getHealthSnapshot();

    if (!snapshot.initialized) {
      const result = this.getStatus(key, false, {
        error: 'License subsystem never completed its boot-time initialization (onModuleInit) -- the repository may be unreachable or trial-activation failed at startup.',
      });
      throw new HealthCheckError('License service check failed', result);
    }

    return this.getStatus(key, true, {
      initialized: true,
      lastSuccessfulCheck: snapshot.lastSuccessfulCheck ? snapshot.lastSuccessfulCheck.toISOString() : 'never (no real request has exercised this subsystem yet)',
      staleSeconds: snapshot.staleSeconds,
    });
  }
}
