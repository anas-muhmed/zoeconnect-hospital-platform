import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CardCategory } from '../entities/card-category.entity';
import { AuditService } from '../../audit/audit.service';
import type { UpdateCardCategoryDto } from '../dto/card-config.dto';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';

@Injectable()
export class CardConfigService {
  constructor(
    @InjectRepository(CardCategory) private readonly repo: Repository<CardCategory>,
    private readonly auditService: AuditService,
    /**
     * Stage B (Checkpoint B3.4) — scoped repository for `findAll()`/
     * `findOne()` only. Every write path (`update`, `recalculateTiers`)
     * keeps using `repo` above, unchanged.
     */
    @Inject(getTenantScopedRepositoryToken(CardCategory))
    private readonly scopedRepo: TenantScopedRepository<CardCategory>,
  ) {}

  // A5.5 API Contract Audit: explicit column list excludes tenant_id so
  // GET /loyalty/card-config doesn't leak it -- otherwise a client that
  // round-trips this object into PATCH /loyalty/card-config/:id
  // (strict-whitelist UpdateCardCategoryDto) gets rejected with
  // "property tenantId should not exist".
  findAll(): Promise<CardCategory[]> {
    return this.scopedRepo.find({
      order: { displayOrder: 'ASC' },
      select: [
        'id', 'code', 'name', 'minSpend', 'maxSpend', 'earnRatePer100',
        'pointValuePer100', 'discountThresholds', 'baseDiscountPct',
        'displayOrder', 'colourHex', 'isActive', 'updatedBy', 'updatedAt',
      ],
    });
  }

  async findOne(id: string): Promise<CardCategory> {
    const cat = await this.scopedRepo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException(`Card category ${id} not found`);
    return cat;
  }

  async update(id: string, dto: UpdateCardCategoryDto, updatedBy: string): Promise<CardCategory & { tiersRecalculated?: number }> {
    const cat = await this.findOne(id);

    const oldValue = {
      minSpend:          cat.minSpend,
      maxSpend:          cat.maxSpend,
      earnRatePer100:    cat.earnRatePer100,
      pointValuePer100:  cat.pointValuePer100,
      discountThresholds: cat.discountThresholds,
      colourHex:         cat.colourHex,
    };

    const minSpendChanged = dto.minSpend !== undefined && Number(dto.minSpend) !== Number(cat.minSpend);

    if (dto.minSpend           !== undefined) cat.minSpend           = dto.minSpend;
    if (dto.maxSpend           !== undefined) cat.maxSpend           = dto.maxSpend ?? null;
    if (dto.earnRatePer100     !== undefined) cat.earnRatePer100     = dto.earnRatePer100;
    if (dto.pointValuePer100   !== undefined) cat.pointValuePer100   = dto.pointValuePer100;
    if (dto.discountThresholds !== undefined) cat.discountThresholds = dto.discountThresholds;
    if (dto.colourHex          !== undefined) cat.colourHex          = dto.colourHex;
    if (dto.isActive           !== undefined) cat.isActive           = dto.isActive;
    cat.updatedBy = updatedBy;

    const saved = await this.repo.save(cat);

    await this.auditService.log({
      action: 'CARD_CONFIG_UPDATED',
      module: 'LOYALTY',
      userId: updatedBy,
      entityType: 'card_category',
      entityId: id,
      oldValue,
      newValue: dto as Record<string, unknown>,
    });

    // If minSpend changed, tier thresholds shifted — recalculate all account tiers immediately
    let tiersRecalculated: number | undefined;
    if (minSpendChanged) {
      const result = await this.recalculateTiers();
      tiersRecalculated = result.updated;
    }

    return { ...saved, tiersRecalculated };
  }

  /** Bulk-reassign every loyalty account to the correct tier based on current minSpend thresholds. */
  async recalculateTiers(): Promise<{ updated: number }> {
    const result = await this.repo.query(`
      UPDATE loyalty_accounts
      SET card_category_id = (
        SELECT id FROM card_categories
        WHERE is_active = true
          AND loyalty_accounts.total_lifetime_spend >= min_spend
        ORDER BY min_spend DESC
        LIMIT 1
      )
      WHERE (
        SELECT id FROM card_categories
        WHERE is_active = true
          AND loyalty_accounts.total_lifetime_spend >= min_spend
        ORDER BY min_spend DESC
        LIMIT 1
      ) IS DISTINCT FROM card_category_id
    `);
    return { updated: result[1] ?? 0 };
  }
}
