import { Inject, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeedbackCampaign } from '../entities/feedback-campaign.entity';
import { FeedbackForm } from '../entities/feedback-form.entity';
import { FeedbackQrCode } from '../entities/feedback-qr-code.entity';
import { CreateCampaignDto, UpdateCampaignDto } from '../dto/feedback-campaign.dto';
import { FeedbackAuditService } from '../audit/feedback-audit.service';
import { FeedbackSettingsService } from '../settings/feedback-settings.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class FeedbackCampaignService {
  constructor(
    @InjectRepository(FeedbackCampaign)
    private readonly campaignRepo: Repository<FeedbackCampaign>,
    @InjectRepository(FeedbackForm)
    private readonly formRepo: Repository<FeedbackForm>,
    @InjectRepository(FeedbackQrCode)
    private readonly qrRepo: Repository<FeedbackQrCode>,
    private readonly auditService: FeedbackAuditService,
    private readonly settingsService: FeedbackSettingsService,

    /**
     * Stage B (Checkpoint B3.7) — scoped repository for `list()`/`findOne()`
     * only. Both are session-resolved-only: the anonymous public chain
     * (`FeedbackPublicService._resolveChain()`) reads `FeedbackCampaign`
     * directly via its own raw `campaignRepo.findOne()`, never through this
     * service, so there's no shared call site here (unlike `FeedbackForm`).
     */
    @Inject(getTenantScopedRepositoryToken(FeedbackCampaign))
    private readonly scopedCampaignRepo: TenantScopedRepository<FeedbackCampaign>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring audit.service.ts's pattern.
    private readonly tenantContext: TenantContextStorage,
  ) {}

  private static readonly SELECT = [
    'id', 'branchId', 'formId', 'name', 'description', 'isActive',
    'googleReviewEnabled', 'googleReviewUrl', 'googleReviewThreshold',
    'googleReviewThankYouMessage', 'googleReviewInvitationMessage',
    'createdBy', 'createdAt', 'updatedAt',
  ] as const;

  // A5.5 API Contract Audit: admin GET /feedback/campaigns -- explicit select excludes tenantId.
  async list(branchId?: string | null): Promise<FeedbackCampaign[]> {
    return this.scopedCampaignRepo.find({
      where: branchId ? { branchId } : {},
      order: { createdAt: 'DESC' },
      select: [...FeedbackCampaignService.SELECT],
    });
  }

  // A5.5 API Contract Audit: admin GET /feedback/campaigns/:id -- also backs
  // update()/remove() as a write-adjacent read; neither reads campaign.tenantId.
  async findOne(id: string): Promise<FeedbackCampaign> {
    const campaign = await this.scopedCampaignRepo.findOne({
      where: { id },
      select: [...FeedbackCampaignService.SELECT],
    });
    if (!campaign) throw new NotFoundException(`Campaign "${id}" not found`);
    return campaign;
  }

  private async _formOrThrow(formId: string): Promise<FeedbackForm> {
    const form = await this.formRepo.findOne({ where: { id: formId } });
    if (!form) throw new NotFoundException(`Feedback form "${formId}" not found`);
    // Archived forms are dead content -- a campaign pointing at one would silently
    // serve a retired form to anyone scanning its QR codes (spec review item:
    // "Archive forms cannot be used by QR campaigns").
    if (form.status === 'ARCHIVED') {
      throw new ConflictException(`Form "${form.name}" is archived and cannot be assigned to a campaign`);
    }
    return form;
  }

  async create(dto: CreateCampaignDto & { branchId: string | null }, createdBy: string): Promise<FeedbackCampaign> {
    const form = await this._formOrThrow(dto.formId);
    const settings = await this.settingsService.get(dto.branchId);
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const campaign = this.campaignRepo.create({
      branchId: dto.branchId,
      formId: form.id,
      name: dto.name,
      description: dto.description ?? null,
      isActive: true,
      createdBy,
      googleReviewEnabled: dto.googleReviewEnabled ?? false,
      googleReviewUrl: dto.googleReviewUrl ?? null,
      googleReviewThreshold: dto.googleReviewThreshold ?? settings.defaultGoogleReviewThreshold,
      googleReviewThankYouMessage: dto.googleReviewThankYouMessage ?? null,
      googleReviewInvitationMessage: dto.googleReviewInvitationMessage ?? null,
      tenantId,
    });
    const saved = await this.campaignRepo.save(campaign);
    await this.auditService.log({
      entityType: 'feedback_campaign', entityId: saved.id, action: 'CREATE',
      changedBy: createdBy, branchId: saved.branchId, summary: `Created campaign "${saved.name}" for form "${form.name}"`,
    });
    return saved;
  }

  async update(id: string, dto: UpdateCampaignDto, updatedBy: string): Promise<FeedbackCampaign> {
    const campaign = await this.findOne(id);
    if (dto.formId !== undefined) {
      const form = await this._formOrThrow(dto.formId);
      campaign.formId = form.id;
    }
    if (dto.name !== undefined) campaign.name = dto.name;
    if (dto.description !== undefined) campaign.description = dto.description;
    if (dto.isActive !== undefined) campaign.isActive = dto.isActive;
    if (dto.googleReviewEnabled !== undefined) campaign.googleReviewEnabled = dto.googleReviewEnabled;
    if (dto.googleReviewUrl !== undefined) campaign.googleReviewUrl = dto.googleReviewUrl;
    if (dto.googleReviewThreshold !== undefined) campaign.googleReviewThreshold = dto.googleReviewThreshold;
    if (dto.googleReviewThankYouMessage !== undefined) campaign.googleReviewThankYouMessage = dto.googleReviewThankYouMessage;
    if (dto.googleReviewInvitationMessage !== undefined) campaign.googleReviewInvitationMessage = dto.googleReviewInvitationMessage;
    const saved = await this.campaignRepo.save(campaign);
    await this.auditService.log({
      entityType: 'feedback_campaign', entityId: id, action: 'UPDATE',
      changedBy: updatedBy, branchId: saved.branchId, summary: `Updated campaign "${saved.name}"`,
    });
    return saved;
  }

  async remove(id: string, changedBy: string): Promise<void> {
    const campaign = await this.findOne(id);
    const qrCount = await this.qrRepo.count({ where: { campaignId: id } });
    if (qrCount > 0) {
      throw new ConflictException(`Cannot delete campaign "${campaign.name}" -- ${qrCount} QR code(s) still reference it. Delete or reassign them first.`);
    }
    await this.campaignRepo.remove(campaign);
    await this.auditService.log({
      entityType: 'feedback_campaign', entityId: id, action: 'DELETE',
      changedBy, branchId: campaign.branchId, summary: `Deleted campaign "${campaign.name}"`,
    });
  }
}
