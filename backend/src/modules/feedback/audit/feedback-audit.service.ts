import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeedbackAuditLog, FeedbackAuditAction } from '../entities/feedback-audit-log.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';

@Injectable()
export class FeedbackAuditService {
  constructor(
    @InjectRepository(FeedbackAuditLog)
    private readonly auditRepo: Repository<FeedbackAuditLog>,

    /**
     * Stage B (Checkpoint B3.7) — scoped repository for `listForEntity()`/
     * `listRecent()` only (both session-resolved-only, `FeedbackAuditController`).
     * `log()` (the write, called from every service across the module including
     * the anonymous public chain) stays on the raw repository, unchanged.
     */
    @Inject(getTenantScopedRepositoryToken(FeedbackAuditLog))
    private readonly scopedAuditRepo: TenantScopedRepository<FeedbackAuditLog>,
  ) {}

  /** Fire-and-forget audit write -- never throws, so a logging failure can't block the actual operation. */
  async log(entry: {
    entityType: string;
    entityId: string | null;
    action: FeedbackAuditAction;
    changedBy: string;
    branchId?: string | null;
    summary?: string | null;
    // Stage B (Checkpoint B5) — optional. Only the anonymous public chain
    // (FeedbackPublicService.submit(), FeedbackComplaintService.submitPublic())
    // passes this explicitly, since it's the only caller with no request.user
    // for a scoped-repository/interceptor-based approach to apply to.
    // Every other (session-resolved) caller across the module does not pass
    // it yet — logged as a deferred B5 sub-item, not silently dropped;
    // `log()` itself stays on the raw repository either way.
    tenantId?: string | null;
  }): Promise<void> {
    try {
      const row = this.auditRepo.create({
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        changedBy: entry.changedBy,
        branchId: entry.branchId ?? null,
        summary: entry.summary ?? null,
        tenantId: entry.tenantId ?? null,
      });
      await this.auditRepo.save(row);
    } catch {
      // Auditing must never break the underlying Feedback operation.
    }
  }

  private static readonly SELECT = [
    'id', 'branchId', 'entityType', 'entityId', 'action', 'summary', 'changedBy', 'changedAt',
  ] as const;

  // A5.5 API Contract Audit: explicit select excludes tenantId.
  async listForEntity(entityType: string, entityId: string): Promise<FeedbackAuditLog[]> {
    return this.scopedAuditRepo.find({
      where: { entityType, entityId },
      order: { changedAt: 'DESC' },
      select: [...FeedbackAuditService.SELECT],
    });
  }

  // A5.5 API Contract Audit: admin GET /feedback/audit-logs -- explicit select excludes tenantId.
  async listRecent(branchId?: string, limit = 100): Promise<FeedbackAuditLog[]> {
    const where: any = {};
    if (branchId) where.branchId = branchId;
    return this.scopedAuditRepo.find({
      where,
      order: { changedAt: 'DESC' },
      take: limit,
      select: [...FeedbackAuditService.SELECT],
    });
  }
}
