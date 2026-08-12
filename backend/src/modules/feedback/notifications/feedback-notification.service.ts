import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeedbackNotification, FeedbackNotificationType } from '../entities/feedback-notification.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class FeedbackNotificationService {
  private readonly logger = new Logger(FeedbackNotificationService.name);

  constructor(
    @InjectRepository(FeedbackNotification)
    private readonly notificationRepo: Repository<FeedbackNotification>,

    /**
     * Stage B (Checkpoint B3.7) — scoped repository for `list()`/
     * `unreadCount()` only (both session-resolved-only, `FeedbackNotificationController`).
     * `create()` (fire-and-forget write from `FeedbackComplaintService.submitPublic()`,
     * chain-resolved) and `markRead()`/`markAllRead()` (bulk writes) stay raw.
     */
    @Inject(getTenantScopedRepositoryToken(FeedbackNotification))
    private readonly scopedNotificationRepo: TenantScopedRepository<FeedbackNotification>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring audit.service.ts's pattern.
    private readonly tenantContext: TenantContextStorage,
  ) {}

  /**
   * Fire-and-forget, like FeedbackAuditService.log -- a notification
   * failing to write should never break the complaint submission that
   * triggered it.
   *
   * `tenantId` (2026-08 fix): optional explicit override. Its only current
   * caller (FeedbackComplaintService.submitPublic()) runs inside a fully
   * anonymous public request with no admin session, so this method's own
   * `tenantContext.currentTenantIdOrNull()` fallback would silently
   * resolve to `null` there (the AsyncLocalStorage context
   * TenantContextInterceptor populates is simply never set for that
   * request) -- previously left every complaint-triggered notification
   * with tenant_id = null instead of a mis-stamped-but-wrong value like
   * FeedbackSubmission/FeedbackAnswer had. The caller already has the
   * correct tenant resolved (from the submission it just loaded), so it's
   * passed straight through here rather than re-derived.
   */
  async create(data: { branchId: string | null; type: FeedbackNotificationType; complaintId: string | null; message: string; tenantId?: string | null }): Promise<void> {
    try {
      const tenantId = data.tenantId !== undefined ? data.tenantId : await this.tenantContext.currentTenantIdOrNull();
      await this.notificationRepo.save(this.notificationRepo.create({
        branchId: data.branchId, type: data.type, complaintId: data.complaintId, message: data.message, isRead: false,
        tenantId,
      }));
    } catch (err) {
      this.logger.warn(`Failed to record notification (non-critical): ${(err as Error).message}`);
    }
  }

  // A5.5 API Contract Audit: admin GET /feedback/notifications -- explicit select excludes tenantId.
  list(branchId?: string | null, unreadOnly?: boolean): Promise<FeedbackNotification[]> {
    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (unreadOnly) where.isRead = false;
    return this.scopedNotificationRepo.find({
      where, order: { createdAt: 'DESC' }, take: 100,
      select: ['id', 'branchId', 'type', 'complaintId', 'message', 'isRead', 'createdAt'],
    });
  }

  unreadCount(branchId?: string | null): Promise<number> {
    const where: any = { isRead: false };
    if (branchId) where.branchId = branchId;
    return this.scopedNotificationRepo.count({ where });
  }

  async markRead(id: string): Promise<void> {
    await this.notificationRepo.update({ id }, { isRead: true });
  }

  async markAllRead(branchId?: string | null): Promise<void> {
    const where: any = { isRead: false };
    if (branchId) where.branchId = branchId;
    await this.notificationRepo.update(where, { isRead: true });
  }
}
