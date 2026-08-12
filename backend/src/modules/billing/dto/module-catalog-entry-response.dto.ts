import { ApiProperty } from '@nestjs/swagger';
import type { ModuleCatalogEntry } from '../services/module-catalog.service';

export type ModuleLicenseState = 'NOT_LICENSED' | 'LICENSED' | 'PENDING_ADD' | 'PENDING_REMOVAL' | 'EXPIRED';

/**
 * Subscription Change Management. The global catalog (ModuleCatalogEntry,
 * from ModuleCatalogService.listCatalog(), 30s-cached and tenant-agnostic
 * on purpose) is extended per-request with a TENANT-SPECIFIC overlay --
 * this DTO, not the cached catalog service, is where "does THIS tenant
 * already own this module" lives. Computed fresh in
 * BillingCatalogController on every call (no caching -- entitlement state
 * must never be stale), from the tenant's current subscription items +
 * pending changes only, never trusted from the client.
 */
export class ModuleCatalogEntryResponseDto implements ModuleCatalogEntry {
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true }) shortDescription: string | null;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty({ nullable: true }) icon: string | null;
  @ApiProperty({ nullable: true }) category: string | null;
  @ApiProperty({ nullable: true }) monthlyPrice: number | null;
  @ApiProperty({ nullable: true }) yearlyPrice: number | null;
  @ApiProperty() isCore: boolean;
  @ApiProperty() isPurchasable: boolean;
  @ApiProperty() isAvailable: boolean;
  @ApiProperty({ type: [String] }) features: string[];
  @ApiProperty({ enum: ['NOT_LICENSED', 'LICENSED', 'PENDING_ADD', 'PENDING_REMOVAL', 'EXPIRED'] })
  licenseState: ModuleLicenseState;
  @ApiProperty({ nullable: true }) pendingEffectiveDate: Date | null;
  /** Per-module prepayment: this module's OWN paid-through date (billing_subscription_items.periodEnd), only set when licenseState is LICENSED or EXPIRED -- lets the UI show "Licensed until {date}" and offer "buy more months" without a second round trip. */
  @ApiProperty({ nullable: true }) licensedUntil: Date | null;

  static from(
    entry: ModuleCatalogEntry, licenseState: ModuleLicenseState,
    pendingEffectiveDate: Date | null = null, licensedUntil: Date | null = null,
  ): ModuleCatalogEntryResponseDto {
    const dto = new ModuleCatalogEntryResponseDto();
    Object.assign(dto, entry);
    dto.licenseState = licenseState;
    dto.pendingEffectiveDate = pendingEffectiveDate;
    dto.licensedUntil = licensedUntil;
    return dto;
  }
}
