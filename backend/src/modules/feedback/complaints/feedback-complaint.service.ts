import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeedbackComplaint } from '../entities/feedback-complaint.entity';
import { FeedbackSubmission } from '../entities/feedback-submission.entity';
import { FeedbackCampaign } from '../entities/feedback-campaign.entity';
import { SubmitComplaintDto, UpdateComplaintDto } from '../dto/feedback-complaint.dto';
import { FeedbackAuditService } from '../audit/feedback-audit.service';
import { FeedbackNotificationService } from '../notifications/feedback-notification.service';
import { NotificationService } from '../../notifications/notification.service';
import { FeedbackSettingsService } from '../settings/feedback-settings.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { ChainTenantResolver } from '../../platform/tenant/resolvers/chain-tenant.resolver';

@Injectable()
export class FeedbackComplaintService {
  private readonly logger = new Logger(FeedbackComplaintService.name);

  constructor(
    @InjectRepository(FeedbackComplaint)
    private readonly complaintRepo: Repository<FeedbackComplaint>,
    @InjectRepository(FeedbackSubmission)
    private readonly submissionRepo: Repository<FeedbackSubmission>,
    private readonly auditService: FeedbackAuditService,
    private readonly notificationFeedService: FeedbackNotificationService,
    private readonly settingsService: FeedbackSettingsService,
    @Optional() private readonly notificationService: NotificationService | null,

    /**
     * Stage B (Checkpoint B3.7) — scoped repository for `list()`/`findOne()`
     * only. `submitPublic()` (chain-resolved, a write) does its own direct
     * `submissionRepo.findOne()` lookup rather than going through this
     * service, so there's no shared call site.
     */
    @Inject(getTenantScopedRepositoryToken(FeedbackComplaint))
    private readonly scopedComplaintRepo: TenantScopedRepository<FeedbackComplaint>,

    // Stage B (Checkpoint B5) — submitPublic() is reachable from the fully
    // anonymous FeedbackPublicController (no request.user), so tenant must
    // be resolved directly here from the already-verified submission's
    // branchId, same chain-derived pattern as FeedbackPublicService.submit().
    private readonly chainResolver: ChainTenantResolver,
  ) {}

  /**
   * Called from the public portal (FeedbackPublicController), not an admin
   * route -- so it takes the already-resolved campaign/branch rather than
   * trusting anything from the request beyond the submissionId, and
   * verifies that submission really belongs to the campaign the token
   * resolved to (stops someone crafting a request against an arbitrary
   * submissionId from a different campaign/branch).
   */
  async submitPublic(dto: SubmitComplaintDto, campaign: FeedbackCampaign): Promise<FeedbackComplaint> {
    const submission = await this.submissionRepo.findOne({ where: { id: dto.submissionId } });
    if (!submission || submission.campaignId !== campaign.id) {
      throw new NotFoundException('Submission not found for this feedback link');
    }

    // CRITICAL FIX (production incident, 2026-08, same class of bug as
    // FeedbackPublicService.submit()): `submission` (loaded above) already
    // carries the tenant it was actually filed under -- since submit()'s
    // own fix now stamps that correctly from the QR code's tenantId, this
    // just needs to reuse it instead of re-deriving via the resolver (which
    // -- see ChainTenantResolver's own doc comment -- currently always
    // returns the seeded 'default' tenant regardless of branchId). Falls
    // back to the resolver only for a submission written before this fix
    // (submission.tenantId === null / still mis-stamped to 'default' from
    // the old bug) so a complaint filed against an old submission doesn't
    // hard-fail -- it will inherit whatever the resolver returns today,
    // same best-effort behavior as before this fix existed.
    let tenantId: string;
    if (submission.tenantId) {
      tenantId = submission.tenantId;
    } else {
      tenantId = await this.chainResolver.resolveDefaultTenantIgnoringBranch(submission.branchId);
    }
    const complaint = this.complaintRepo.create({
      branchId: submission.branchId,
      submissionId: submission.id,
      formId: submission.formId,
      campaignId: submission.campaignId,
      category: dto.category,
      description: dto.description,
      contactName: dto.contactName ?? null,
      contactPhone: dto.contactPhone ?? null,
      contactEmail: dto.contactEmail ?? null,
      status: 'NEW',
      tenantId,
    });
    const saved = await this.complaintRepo.save(complaint);
    await this.auditService.log({
      entityType: 'feedback_complaint', entityId: saved.id, action: 'CREATE',
      changedBy: 'public', branchId: saved.branchId, summary: `Complaint (${saved.category}) received for campaign "${campaign.name}"`,
      tenantId,
    });

    // Best-effort in-app alert for staff -- see FeedbackNotificationService.create's doc comment on why this can never fail the actual complaint submission.
    // Explicit tenantId (2026-08 fix): this call runs inside the same
    // anonymous public request as the complaint itself, so
    // FeedbackNotificationService's own `tenantContext.currentTenantIdOrNull()`
    // has no admin session to read from and would silently write `null` --
    // pass the tenantId we already resolved above instead of relying on that.
    await this.notificationFeedService.create({
      branchId: saved.branchId,
      type: 'NEW_COMPLAINT',
      complaintId: saved.id,
      message: `New ${saved.category} complaint for "${campaign.name}"`,
      tenantId,
    });

    return saved;
  }

  private static readonly SELECT = [
    'id', 'branchId', 'submissionId', 'formId', 'campaignId', 'category', 'description',
    'contactName', 'contactPhone', 'contactEmail', 'status', 'assignedTo', 'resolutionNotes',
    'resolvedAt', 'createdAt', 'updatedAt',
  ] as const;

  // A5.5 API Contract Audit: admin GET /feedback/complaints -- explicit select excludes tenantId.
  async list(branchId?: string | null, status?: string, campaignId?: string): Promise<FeedbackComplaint[]> {
    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (status) where.status = status;
    if (campaignId) where.campaignId = campaignId;
    return this.scopedComplaintRepo.find({
      where, order: { createdAt: 'DESC' }, take: 500, select: [...FeedbackComplaintService.SELECT],
    });
  }

  // A5.5 API Contract Audit: admin GET /feedback/complaints/:id -- also backs
  // update() as a write-adjacent read; it doesn't read complaint.tenantId.
  async findOne(id: string): Promise<FeedbackComplaint> {
    const complaint = await this.scopedComplaintRepo.findOne({ where: { id }, select: [...FeedbackComplaintService.SELECT] });
    if (!complaint) throw new NotFoundException(`Complaint "${id}" not found`);
    return complaint;
  }

  async update(id: string, dto: UpdateComplaintDto, updatedBy: string): Promise<FeedbackComplaint> {
    const complaint = await this.findOne(id);
    const wasAlreadyResolved = complaint.status === 'RESOLVED' || complaint.status === 'CLOSED';
    if (dto.status !== undefined) {
      complaint.status = dto.status;
      if ((dto.status === 'RESOLVED' || dto.status === 'CLOSED') && !complaint.resolvedAt) {
        complaint.resolvedAt = new Date();
      }
      if (dto.status === 'NEW' || dto.status === 'IN_PROGRESS') {
        complaint.resolvedAt = null;
      }
    }
    if (dto.assignedTo !== undefined) complaint.assignedTo = dto.assignedTo;
    if (dto.resolutionNotes !== undefined) complaint.resolutionNotes = dto.resolutionNotes;

    const saved = await this.complaintRepo.save(complaint);
    await this.auditService.log({
      entityType: 'feedback_complaint', entityId: id, action: 'UPDATE',
      changedBy: updatedBy, branchId: saved.branchId, summary: `Updated complaint (status: ${saved.status})`,
    });

    // Best-effort "your complaint was resolved" WhatsApp notification -- only fires on the
    // NEW->RESOLVED/CLOSED transition (not repeated on every later edit), only if the patient
    // left a phone number, and only if a real approved template has been configured (now DB-
    // configurable via settings.complaintResolvedWhatsappTemplate, formerly an env var -- unset/
    // blank means the feature is a no-op, not broken, same as before). Reuses the exact
    // fire-and-forget pattern loyalty's EnrollmentService uses for its welcome message.
    const justResolved = !wasAlreadyResolved && (saved.status === 'RESOLVED' || saved.status === 'CLOSED');
    if (justResolved && saved.contactPhone && this.notificationService) {
      const settings = await this.settingsService.get(saved.branchId);
      const templateName = settings.complaintResolvedWhatsappTemplate;
      if (templateName) {
        this.notificationService.send({
          phone: saved.contactPhone,
          channel: 'WHATSAPP',
          eventType: 'CUSTOM',
          templateName,
          languageCode: 'en_US',
          templateParams: [saved.category],
          metadata: { feedbackComplaintId: saved.id },
        }).catch(err =>
          this.logger.warn(`Complaint-resolved WhatsApp notification failed (non-critical): ${(err as Error).message}`),
        );
      }
    }

    return saved;
  }
}
