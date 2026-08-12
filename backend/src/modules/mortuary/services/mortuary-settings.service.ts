import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MortuarySystemSettings } from '../entities/mortuary-system-settings.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { getMinimumAdvance, computeStayCharge, MortuaryPricingSettings, StayCharge } from '../utils/billing-math.util';
import { UpdateMortuaryBillingSettingsDto } from '../dto/update-mortuary-billing-settings.dto';
import { UpdateMortuaryNameDto } from '../dto/update-mortuary-name.dto';

const PRICING_MODELS = ['tiered_flat_hourly', 'flat_daily', 'free'] as const;

/**
 * Mortuary integration (Phase 2, Stage C). Ports `config/pricing.js` (the
 * get-or-create-with-defaults behavior) and `settingsController.js`'s
 * billing/name update handlers.
 *
 * Explicitly NOT ported here: `uploadMortuaryLogo`/`getMortuaryLogo`
 * (Stage E, object-repository) — see Stage C report.
 */
@Injectable()
export class MortuarySettingsService {
  constructor(
    @InjectRepository(MortuarySystemSettings)
    private readonly settingsRepo: Repository<MortuarySystemSettings>,
    @Inject(getTenantScopedRepositoryToken(MortuarySystemSettings))
    private readonly scopedSettingsRepo: TenantScopedRepository<MortuarySystemSettings>,
  ) {}

  /**
   * Source: `getHospitalSettings()` — fetches a tenant's settings row,
   * creating one with safe defaults if it doesn't exist yet (e.g. a tenant
   * provisioned before any Mortuary-specific settings write happened).
   */
  async getOrCreate(tenantId: string): Promise<MortuarySystemSettings> {
    const existing = await this.scopedSettingsRepo.findOneBy({ tenantId });
    if (existing) return existing;

    const created = this.settingsRepo.create({
      tenantId,
      firstDayCharge: '2100.00',
      hourlyChargeAfter24hrs: '130.00',
    });
    return this.settingsRepo.save(created);
  }

  private toPricingSettings(settings: MortuarySystemSettings): MortuaryPricingSettings {
    return {
      pricingModel: settings.pricingModel,
      dailyRate: Number(settings.dailyRate ?? 0),
      firstDayCharge: Number(settings.firstDayCharge),
      hourlyChargeAfter24hrs: Number(settings.hourlyChargeAfter24hrs),
    };
  }

  async getMinimumAdvance(tenantId: string): Promise<number> {
    const settings = await this.getOrCreate(tenantId);
    return getMinimumAdvance(this.toPricingSettings(settings));
  }

  async computeStayCharge(tenantId: string, totalHours: number): Promise<StayCharge> {
    const settings = await this.getOrCreate(tenantId);
    return computeStayCharge(this.toPricingSettings(settings), totalHours);
  }

  async getStaffDiscountPercent(tenantId: string): Promise<number> {
    const settings = await this.getOrCreate(tenantId);
    return Number(settings.staffDiscountPercent ?? 100);
  }

  /** Source: `updateBillingSettings`. Pricing-model fields optional so a caller sending only the two legacy fields doesn't reset model/discount. */
  async updateBillingSettings(tenantId: string, dto: UpdateMortuaryBillingSettingsDto, updatedBy: string): Promise<MortuarySystemSettings> {
    const existing = await this.getOrCreate(tenantId);

    const resolvedModel = dto.pricingModel ?? existing.pricingModel;
    if (!PRICING_MODELS.includes(resolvedModel)) {
      throw new BadRequestException('Invalid pricingModel');
    }

    const resolvedDailyRate = dto.dailyRate ?? Number(existing.dailyRate ?? 0);
    if (Number.isNaN(resolvedDailyRate) || resolvedDailyRate < 0) {
      throw new BadRequestException('dailyRate must be a non-negative number');
    }

    const resolvedStaffDiscount = dto.staffDiscountPercent ?? Number(existing.staffDiscountPercent ?? 100);
    if (Number.isNaN(resolvedStaffDiscount) || resolvedStaffDiscount < 0 || resolvedStaffDiscount > 100) {
      throw new BadRequestException('staffDiscountPercent must be between 0 and 100');
    }

    await this.settingsRepo.update(
      { id: existing.id },
      {
        firstDayCharge: dto.firstDayCharge.toFixed(2),
        hourlyChargeAfter24hrs: dto.hourlyChargeAfter24hrs.toFixed(2),
        updatedBy,
        pricingModel: resolvedModel,
        dailyRate: resolvedDailyRate.toFixed(2),
        staffDiscountPercent: resolvedStaffDiscount.toFixed(2),
      },
    );
    return this.getOrCreate(tenantId);
  }

  /** Source: `updateMortuaryName`. */
  async updateName(tenantId: string, dto: UpdateMortuaryNameDto, updatedBy: string): Promise<MortuarySystemSettings> {
    const existing = await this.getOrCreate(tenantId);
    await this.settingsRepo.update({ id: existing.id }, { mortuaryName: dto.mortuaryName.trim(), updatedBy });
    return this.getOrCreate(tenantId);
  }
}
