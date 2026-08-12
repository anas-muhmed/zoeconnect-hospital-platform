import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require('qrcode');
import { FeedbackQrCode } from '../entities/feedback-qr-code.entity';
import { FeedbackCampaign } from '../entities/feedback-campaign.entity';
import { CreateQrCodeDto, UpdateQrCodeDto } from '../dto/feedback-qr.dto';
import { FeedbackAuditService } from '../audit/feedback-audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class FeedbackQrService {
  constructor(
    @InjectRepository(FeedbackQrCode)
    private readonly qrRepo: Repository<FeedbackQrCode>,
    @InjectRepository(FeedbackCampaign)
    private readonly campaignRepo: Repository<FeedbackCampaign>,
    private readonly auditService: FeedbackAuditService,
    private readonly configService: ConfigService,

    /**
     * Stage B (Checkpoint B3.7) — scoped repository for `list()`/`findOne()`
     * only (the latter also reused write-adjacently by `create()`/`update()`/
     * `regenerate()`/`remove()`/`renderSvg()`/`renderPngDataUrl()`, all
     * session-resolved). The anonymous public chain resolves QR codes via
     * its own direct `qrRepo.findOne({where:{token}})`, never through this
     * service, so there's no shared call site.
     */
    @Inject(getTenantScopedRepositoryToken(FeedbackQrCode))
    private readonly scopedQrRepo: TenantScopedRepository<FeedbackQrCode>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring audit.service.ts's pattern.
    private readonly tenantContext: TenantContextStorage,
  ) {}

  private publicBaseUrl(): string {
    return this.configService.get<string>('app.frontendUrl', 'http://localhost:3000');
  }

  /** crypto.randomBytes (not the uuid package) -- same secure-token pattern as password-reset.service.ts. */
  private generateToken(): string {
    return crypto.randomBytes(24).toString('base64url');
  }

  private static readonly SELECT = [
    'id', 'branchId', 'campaignId', 'token', 'targetType', 'targetRef', 'label',
    'isActive', 'expiresAt', 'createdBy', 'createdAt', 'updatedAt',
  ] as const;

  // A5.5 API Contract Audit: admin GET /feedback/qr-codes -- explicit select excludes tenantId.
  async list(branchId?: string | null, campaignId?: string): Promise<FeedbackQrCode[]> {
    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (campaignId) where.campaignId = campaignId;
    return this.scopedQrRepo.find({ where, order: { createdAt: 'DESC' }, select: [...FeedbackQrService.SELECT] });
  }

  // A5.5 API Contract Audit: admin GET /feedback/qr-codes/:id -- also backs
  // update()/regenerate()/remove()/renderSvg()/renderPngDataUrl() as a
  // write-adjacent read; none of those read qr.tenantId.
  async findOne(id: string): Promise<FeedbackQrCode> {
    const qr = await this.scopedQrRepo.findOne({ where: { id }, select: [...FeedbackQrService.SELECT] });
    if (!qr) throw new NotFoundException(`QR code "${id}" not found`);
    return qr;
  }

  private async _campaignOrThrow(campaignId: string): Promise<FeedbackCampaign> {
    const campaign = await this.campaignRepo.findOne({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException(`Campaign "${campaignId}" not found`);
    return campaign;
  }

  async create(dto: CreateQrCodeDto & { branchId: string | null }, createdBy: string): Promise<FeedbackQrCode> {
    const campaign = await this._campaignOrThrow(dto.campaignId);
    // Regenerate on unlikely collision -- unique index is the real guarantee, this just avoids a round-trip failure.
    let token = this.generateToken();
    while (await this.qrRepo.findOne({ where: { token } })) {
      token = this.generateToken();
    }
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const qr = this.qrRepo.create({
      branchId: dto.branchId,
      campaignId: campaign.id,
      token,
      targetType: dto.targetType as FeedbackQrCode['targetType'],
      targetRef: dto.targetRef ?? null,
      label: dto.label,
      isActive: true,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      createdBy,
      tenantId,
    });
    const saved = await this.qrRepo.save(qr);
    await this.auditService.log({
      entityType: 'feedback_qr_code', entityId: saved.id, action: 'CREATE',
      changedBy: createdBy, branchId: saved.branchId, summary: `Generated QR code "${saved.label}" for campaign "${campaign.name}"`,
    });
    return saved;
  }

  async update(id: string, dto: UpdateQrCodeDto, updatedBy: string): Promise<FeedbackQrCode> {
    const qr = await this.findOne(id);
    if (dto.label !== undefined) qr.label = dto.label;
    if (dto.targetType !== undefined) qr.targetType = dto.targetType as FeedbackQrCode['targetType'];
    if (dto.targetRef !== undefined) qr.targetRef = dto.targetRef;
    if (dto.isActive !== undefined) qr.isActive = dto.isActive;
    if (dto.expiresAt !== undefined) qr.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    const saved = await this.qrRepo.save(qr);
    await this.auditService.log({
      entityType: 'feedback_qr_code', entityId: id, action: 'UPDATE',
      changedBy: updatedBy, branchId: saved.branchId, summary: `Updated QR code "${saved.label}"`,
    });
    return saved;
  }

  /**
   * Rotates the token (old QR image stops resolving) while keeping the same
   * row/campaign association -- used when a printed code is compromised or
   * lost, without losing its history/label.
   */
  async regenerate(id: string, updatedBy: string): Promise<FeedbackQrCode> {
    const qr = await this.findOne(id);
    let token = this.generateToken();
    while (await this.qrRepo.findOne({ where: { token } })) {
      token = this.generateToken();
    }
    qr.token = token;
    const saved = await this.qrRepo.save(qr);
    await this.auditService.log({
      entityType: 'feedback_qr_code', entityId: id, action: 'UPDATE',
      changedBy: updatedBy, branchId: saved.branchId, summary: `Regenerated token for QR code "${saved.label}"`,
    });
    return saved;
  }

  async remove(id: string, changedBy: string): Promise<void> {
    const qr = await this.findOne(id);
    await this.qrRepo.remove(qr);
    await this.auditService.log({
      entityType: 'feedback_qr_code', entityId: id, action: 'DELETE',
      changedBy, branchId: qr.branchId, summary: `Deleted QR code "${qr.label}"`,
    });
  }

  /** Builds the public portal URL -- the *token* only, never any internal id. */
  publicUrl(qr: FeedbackQrCode): string {
    return `${this.publicBaseUrl()}/feedback/f/${qr.token}`;
  }

  async renderSvg(id: string): Promise<string> {
    const qr = await this.findOne(id);
    return QRCode.toString(this.publicUrl(qr), { type: 'svg', errorCorrectionLevel: 'M' });
  }

  async renderPngDataUrl(id: string): Promise<string> {
    const qr = await this.findOne(id);
    return QRCode.toDataURL(this.publicUrl(qr), { errorCorrectionLevel: 'M' });
  }
}
