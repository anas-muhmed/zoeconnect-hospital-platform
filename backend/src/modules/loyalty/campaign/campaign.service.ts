import {
  Inject, Injectable, Logger, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, IsNull, Or } from 'typeorm';
import { Campaign } from '../entities/campaign.entity';
import { AuditService } from '../../audit/audit.service';
import type { CreateCampaignDto, UpdateCampaignDto } from '../dto/campaign.dto';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(
    @InjectRepository(Campaign) private readonly campaignRepo: Repository<Campaign>,
    private readonly auditService: AuditService,
    /**
     * Stage B (Checkpoint B3.4) — scoped repository for `findAll()`/
     * `findOne()`/`getActiveCampaigns()` only. `getActiveBirthdayCampaigns()`
     * (called exclusively from the birthday-campaign `@Cron` job) and every
     * write path stay on `campaignRepo` above.
     */
    @Inject(getTenantScopedRepositoryToken(Campaign))
    private readonly scopedCampaignRepo: TenantScopedRepository<Campaign>,
    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log(): resolve the ambient tenant
    // (or null if none) at each .create() call site.
    private readonly tenantContext: TenantContextStorage,
  ) {}

  // A5.5 API Contract Audit: explicit column list on both queries below
  // excludes tenant_id so GET /loyalty/campaigns and GET /loyalty/campaigns/:id
  // don't leak it -- otherwise a client that round-trips this object into
  // PATCH /loyalty/campaigns/:id (strict-whitelist UpdateCampaignDto) gets
  // rejected with "property tenantId should not exist".
  private static readonly SELECT_NO_TENANT: (keyof Campaign)[] = [
    'id', 'name', 'campaignType', 'description', 'startDate', 'endDate',
    'eligibleCardCodes', 'earnMultiplier', 'bonusPointsFlat', 'conditions',
    'isActive', 'priority', 'createdBy', 'createdAt', 'updatedAt',
  ];

  // ── CRUD ──────────────────────────────────────────────────────────────────
  async findAll(activeOnly = false): Promise<Campaign[]> {
    const where = activeOnly ? { isActive: true } : {};
    return this.scopedCampaignRepo.find({
      where,
      order: { createdAt: 'DESC' },
      select: CampaignService.SELECT_NO_TENANT,
    });
  }

  async findOne(id: string): Promise<Campaign> {
    const campaign = await this.scopedCampaignRepo.findOne({
      where: { id },
      select: CampaignService.SELECT_NO_TENANT,
    });
    if (!campaign) throw new NotFoundException(`Campaign ${id} not found`);
    return campaign;
  }

  async create(dto: CreateCampaignDto, createdBy: string): Promise<Campaign> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const campaign = this.campaignRepo.create({
      name:               dto.name,
      campaignType:       dto.campaignType,
      earnMultiplier:     dto.multiplier ?? dto.earnMultiplier ?? 1,
      bonusPointsFlat:    dto.bonusPoints ?? dto.bonusPointsFlat ?? 0,
      startDate:          dto.startDate ? new Date(dto.startDate) : new Date(),
      endDate:            dto.endDate ? new Date(dto.endDate) : new Date(Date.now() + 30 * 86400000),
      eligibleCardCodes:  dto.eligibleCardCodes ?? [],
      conditions:         dto.conditions ?? null,
      isActive:           dto.isActive ?? true,
      createdBy,
      tenantId,
    });
    const saved = await this.campaignRepo.save(campaign);

    await this.auditService.log({
      action: 'CAMPAIGN_CREATED',
      module: 'LOYALTY',
      userId: createdBy,
      entityType: 'campaign',
      entityId: saved.id,
      newValue: { name: saved.name, type: saved.campaignType },
    });

    this.logger.log(`Campaign created: "${saved.name}" [${saved.campaignType}]`);
    return saved;
  }

  async update(id: string, dto: UpdateCampaignDto, updatedBy: string): Promise<Campaign> {
    const campaign = await this.findOne(id);

    const patch: Partial<Campaign> = {};
    if (dto.name         !== undefined) patch.name            = dto.name;
    if (dto.campaignType !== undefined) patch.campaignType    = dto.campaignType;
    if ((dto.multiplier ?? dto.earnMultiplier) !== undefined)
      patch.earnMultiplier  = dto.multiplier ?? dto.earnMultiplier;
    if ((dto.bonusPoints ?? dto.bonusPointsFlat) !== undefined)
      patch.bonusPointsFlat = dto.bonusPoints ?? dto.bonusPointsFlat;
    if (dto.startDate    !== undefined) patch.startDate       = new Date(dto.startDate!);
    if (dto.endDate      !== undefined) patch.endDate         = new Date(dto.endDate!);
    if (dto.conditions   !== undefined) patch.conditions      = dto.conditions ?? null;
    if (dto.isActive          !== undefined) patch.isActive           = dto.isActive;
    if (dto.eligibleCardCodes !== undefined) patch.eligibleCardCodes  = dto.eligibleCardCodes;
    await this.campaignRepo.update(id, patch as any);

    await this.auditService.log({
      action: 'CAMPAIGN_UPDATED',
      module: 'LOYALTY',
      userId: updatedBy,
      entityType: 'campaign',
      entityId: id,
      newValue: dto as Record<string, unknown>,
    });

    return this.findOne(id);
  }

  async setActive(id: string, isActive: boolean, updatedBy: string): Promise<Campaign> {
    await this.findOne(id);
    await this.campaignRepo.update(id, { isActive });
    await this.auditService.log({
      action: isActive ? 'CAMPAIGN_ACTIVATED' : 'CAMPAIGN_DEACTIVATED',
      module: 'LOYALTY',
      userId: updatedBy,
      entityType: 'campaign',
      entityId: id,
    });
    return this.findOne(id);
  }

  // ── Active campaigns right now (for point engine) ─────────────────────────
  async getActiveCampaigns(): Promise<Campaign[]> {
    const now = new Date();
    const qb = await this.scopedCampaignRepo.createQueryBuilder('c');
    const campaigns = await qb
      .where('c.is_active = true')
      .andWhere('c.start_date <= :now', { now })
      .andWhere('c.end_date >= :now', { now })
      .getMany();
    // A5.5 API Contract Audit: this feeds GET /loyalty/campaigns/active
    // directly -- strip tenantId post-fetch (query-builder .getMany() makes
    // an explicit .select() column list impractical here).
    campaigns.forEach((c) => delete (c as { tenantId?: string | null }).tenantId);
    return campaigns;
  }

  // ── Birthday campaigns (type = BIRTHDAY, active) ──────────────────────────
  async getActiveBirthdayCampaigns(): Promise<Campaign[]> {
    const now = new Date();
    return this.campaignRepo
      .createQueryBuilder('c')
      .where('c.is_active = true')
      .andWhere("c.campaign_type = 'BIRTHDAY'")
      .andWhere('c.start_date <= :now', { now })
      .andWhere('c.end_date >= :now', { now })
      .getMany();
  }

  // ── Auto-expire campaigns past their end date ────────────────────────────
  async deactivateExpired(): Promise<number> {
    const result = await this.campaignRepo
      .createQueryBuilder()
      .update(Campaign)
      .set({ isActive: false })
      .where('is_active = true')
      .andWhere('end_date IS NOT NULL')
      .andWhere('end_date < :now', { now: new Date() })
      .execute();

    const count = result.affected ?? 0;
    if (count > 0) this.logger.log(`Auto-deactivated ${count} expired campaigns`);
    return count;
  }
}
