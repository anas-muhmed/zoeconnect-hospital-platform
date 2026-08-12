import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bull';
import { Repository } from 'typeorm';
import { QUEUE_NAMES } from '../../config/redis.config';
import { TenantContextStorage } from '../platform/tenant/context/tenant-context-storage';
import { AuditLog } from './entities/audit-log.entity';

export interface AuditLogPayload {
  action: string;
  module: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  // Stage B (Checkpoint B6) — resolved at enqueue time by log() itself, not
  // passed by callers. See the doc comment on log() below.
  tenantId?: string | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectQueue(QUEUE_NAMES.AUDIT_LOGS) private readonly auditQueue: Queue,
    private readonly tenantContext: TenantContextStorage,
    @InjectRepository(AuditLog) private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  /**
   * Fire-and-forget enqueue — never blocks the HTTP response.
   * Bull persists to Redis; AuditProcessor writes to PostgreSQL.
   *
   * Stage B (Checkpoint B6, first confirmed background-only member of this
   * checkpoint per B1's original scoping note) — `AuditProcessor` is a Bull
   * worker with no HTTP surface at all, so it cannot read
   * `TenantContextStorage`'s ambient AsyncLocalStorage context the way a
   * request-scoped repository call can (the job runs on a separate tick,
   * outside the original request's async call graph entirely). Tenant must
   * therefore be resolved HERE, inside the original request where ambient
   * context (if any) is still live, and carried explicitly through the job
   * payload to the worker. Defensive: not every controller has
   * `TenantContextInterceptor` wired (most B3.1–B3.8 admin CRUD routes do;
   * background/cron-triggered `log()` calls and any route that hasn't opted
   * in yet do not) — `hasContext()`/`isSystemScope()` are checked first
   * rather than assuming a context always exists, so this never throws and
   * simply resolves to `null` when no context is established.
   */
  async log(payload: AuditLogPayload): Promise<void> {
    let tenantId: string | null = null;
    if (TenantContextStorage.hasContext() && !this.tenantContext.isSystemScope()) {
      tenantId = await this.tenantContext.currentTenantId().catch(() => null);
    }
    await this.auditQueue.add('write-audit-log', { ...payload, tenantId }, {
      removeOnComplete: true,
      removeOnFail: 50,           // keep last 50 failed jobs for inspection
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  }

  /**
   * Vendor Portal Connector Management (Task #102, "Onboarding UX,"
   * 2026-07-22) -- the first READ path this service has ever needed. Every
   * caller until now only ever wrote (`log()`); the Vendor Portal
   * Connector page's "recent activity" panel is the first UI surface that
   * needs to look audit history back up.
   *
   * Deliberately a direct repository query, not routed through
   * `TenantScopedRepository`'s ambient-context pattern: this is called from
   * `TenantProvisioningController`, whose callers are platform operators
   * (SUPER_ADMIN JWT or the Vendor Portal service-to-service API key) who
   * are explicitly asking about ONE SPECIFIC tenant by id -- there is no
   * ambient "current tenant" the way there is for a tenant's own logged-in
   * users, so an explicit `tenantId` parameter (not `TenantContextStorage`)
   * is the correct model here, same reasoning as
   * `HisQueryDefinitionPublisherService.publishFull(tenantId, ...)`.
   *
   * `actions`, when given, narrows to specific `action` values (e.g. the
   * connector-lifecycle actions `CONNECTOR_ACTIVATION_CODE_REGENERATED`,
   * `CONNECTOR_RESYNC_TRIGGERED`, `HIS_QUERY_DEFINITIONS_REPUBLISHED`) so
   * the Connector page's activity panel isn't polluted with unrelated
   * tenant-level audit noise (billing changes, user management, etc.) --
   * this table is genuinely shared across every module that calls
   * `log()`, not connector-specific.
   */
  async findRecentForTenant(
    tenantId: string,
    opts: { actions?: string[]; limit?: number } = {},
  ): Promise<AuditLog[]> {
    const qb = this.auditLogRepo.createQueryBuilder('log')
      .where('log.tenantId = :tenantId', { tenantId })
      .orderBy('log.createdAt', 'DESC')
      .limit(opts.limit ?? 50);
    if (opts.actions?.length) {
      qb.andWhere('log.action IN (:...actions)', { actions: opts.actions });
    }
    return qb.getMany();
  }
}
