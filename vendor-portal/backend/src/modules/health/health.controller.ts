import { Controller, Get, ServiceUnavailableException, HttpException } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheckResult,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MailHealthIndicator } from './mail.health';
import { getBuildInfo } from '../../common/build-info';

/**
 * CRITICAL FIX (split-state deployment incident, 2026-08): vendor-backend
 * previously had NO application-level health endpoint at all -- its only
 * signal was Dockerfile.vendor-backend's bare TCP-connect HEALTHCHECK,
 * which reports "healthy" the instant the HTTP listener binds, completely
 * blind to whether vendor-postgres is actually reachable. That mirrors
 * exactly the failure mode the hospital backend had with a liveness-only
 * check (see backend/src/app.controller.ts's own comment): a container can
 * look "healthy" to Docker/Compose while every real dependency underneath
 * it is broken.
 *
 * FOLLOW-UP (readiness-should-check-more-than-infrastructure, 2026-08):
 * mirrors the same infrastructure/application split app.controller.ts now
 * uses in the hospital backend. vendor-backend's application surface is
 * much smaller (no scheduler, no queues, no Oracle transport here), but it
 * does have exactly one real external dependency -- outbound OTP email via
 * MailService/Resend.
 *
 * CRITICAL FIX #2 (readiness-semantics audit, 2026-08): the FOLLOW-UP above
 * was wrong to treat mail as a blocking "application" dependency on the
 * same level as the database. PRODUCTION INCIDENT: a deploy where
 * RESEND_API_KEY/MAIL_FROM_ADDRESS were never configured never became
 * Ready (503 on /api/health/ready) even though the application itself had
 * started successfully and the database was fully reachable -- Compose's
 * `depends_on: condition: service_healthy` then blocked vendor-frontend
 * and nginx from ever starting, over an integration nothing but the
 * public sign-up OTP flow (see MailService's own header -- it has exactly
 * one caller, PublicSignupModule's signup-otp.service.ts) actually needs.
 * Every other Vendor Portal capability -- authentication, license
 * management, hospital data, the vendor gateway -- functions completely
 * normally with mail unconfigured; only OTP-based self-signup would fail,
 * and it fails with its own clear error at the moment it's actually used
 * (see MailService.sendOtpEmail()'s throw), not by taking the whole
 * service down at startup.
 *
 * That makes mail an OPTIONAL INTEGRATION, not a startup dependency, by
 * the same test this endpoint already applies to infrastructure: "can the
 * application do its job without this." Reclassified accordingly --
 * `infrastructure` (postgresql) is the only check that can still produce
 * HTTP 503 here. `integrations` (mail) is still checked and still fully
 * reported in the response body every time, so a missing Resend config is
 * never silently invisible -- it just no longer blocks Docker Compose's
 * `service_healthy` gate or this deployment pipeline's readiness poll.
 * Database connectivity and application process startup remain fully
 * blocking, exactly as required; this service has no Redis dependency
 * (see package.json -- no redis/ioredis package) so there is nothing else
 * to add to the blocking set today. If a FUTURE integration is added that
 * the application genuinely cannot function without (unlike mail), add it
 * to the `infrastructure` check array, not `integrations` -- the dividing
 * line is exactly that question, not "is it external" or "does it have a
 * HealthIndicator at all."
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly mailHealth: MailHealthIndicator,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get('live')
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async readiness() {
    // Infrastructure -- BLOCKS readiness (HTTP 503 on failure). Reserved
    // for dependencies the application genuinely cannot function without
    // at all. Currently just the database; see this controller's own
    // header comment for why mail does NOT belong here.
    let infrastructure: HealthCheckResult['details'];
    let infraOk = true;
    try {
      const result = await this.health.check([
        () => this.db.pingCheck('postgresql', { connection: this.dataSource }),
      ]);
      infrastructure = result.details;
    } catch (err) {
      infraOk = false;
      const response = err instanceof HttpException ? (err.getResponse() as any) : undefined;
      infrastructure = response?.details ?? { error: err instanceof Error ? err.message : 'infrastructure check threw unexpectedly' };
    }

    // Integrations -- ALWAYS checked and ALWAYS reported, but NEVER blocks
    // readiness. A missing/broken integration here means one specific
    // capability (currently: sign-up OTP email) won't work -- it does NOT
    // mean the application isn't ready to serve traffic. See this
    // controller's own header comment (readiness-semantics audit,
    // 2026-08) for the incident this fixes.
    let integrations: HealthCheckResult['details'];
    let integrationsOk = true;
    try {
      const result = await this.health.check([
        () => this.mailHealth.isHealthy('mail'),
      ]);
      integrations = result.details;
    } catch (err) {
      integrationsOk = false;
      const response = err instanceof HttpException ? (err.getResponse() as any) : undefined;
      integrations = response?.details ?? { error: err instanceof Error ? err.message : 'integrations check threw unexpectedly' };
    }

    const body = {
      // Only `infrastructure` affects this value -- an unconfigured/broken
      // OPTIONAL integration is surfaced via `degraded` below, never by
      // flipping this to anything that would cause a 503.
      status: infraOk ? 'ready' : 'not_ready',
      // Names every currently-degraded OPTIONAL integration (empty array
      // when none) -- lets an operator see "mail is unconfigured" directly
      // in the response body without it ever having caused a failed
      // deployment or an unhealthy container.
      degraded: integrationsOk ? [] : ['mail'],
      ...getBuildInfo(),
      infrastructure,
      integrations,
      timestamp: new Date().toISOString(),
    };

    // CRITICAL: only infrastructure can produce a 503 here. integrationsOk
    // is deliberately NOT part of this condition -- seeing that variable
    // referenced here again in a future edit is exactly the mistake this
    // whole fix corrects; see the header comment before ever changing this.
    if (!infraOk) {
      throw new ServiceUnavailableException(body);
    }
    return body;
  }
}
