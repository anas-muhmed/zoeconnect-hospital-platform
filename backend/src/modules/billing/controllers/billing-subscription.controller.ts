import { Controller, Get, Inject, Post, UseGuards, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { BillingSubscriptionService } from '../services/billing-subscription.service';
import { ModuleCatalogService } from '../services/module-catalog.service';
import { CancelSubscriptionDto } from '../dto/cancel-subscription.dto';
import { SubscriptionResponseDto } from '../dto/subscription-response.dto';
import { SubscriptionItemResponseDto } from '../dto/subscription-item-response.dto';
import { ENTITLEMENT_SYNC, EntitlementSyncPort } from '../entitlements/entitlement-sync.port';
import { BillingEntitlementSyncService } from '../entitlements/billing-entitlement-sync.service';

/**
 * cancel()/reactivate() both change `billing_subscriptions.status` and
 * then immediately re-run entitlement sync -- a status-only change (e.g.
 * ACTIVE -> CANCEL_AT_PERIOD_END) still needs `subscription_licenses` to
 * reflect the new status even though the module list itself is
 * unchanged (BillingEntitlementSyncService.toLegacyStatus() maps
 * CANCEL_AT_PERIOD_END to 'active' -- modules stay granted until the
 * period actually ends -- while CANCELLED maps to 'canceled', which
 * revokes every module). Kept in the controller rather than
 * BillingSubscriptionService itself, preserving that service's Phase 2
 * boundary: it still never imports/depends on the entitlement layer.
 */
@ApiTags('Billing')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('billing/subscription')
export class BillingSubscriptionController {
  constructor(
    private readonly subscriptionService: BillingSubscriptionService,
    private readonly catalog: ModuleCatalogService,
    @Inject(ENTITLEMENT_SYNC) private readonly entitlementSync: EntitlementSyncPort,
    private readonly entitlementSyncOps: BillingEntitlementSyncService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get (or lazily create, e.g. a fresh tenant's first access) the tenant's current billing subscription, including its current modules and billing mode (Subscription Change Management)" })
  async getCurrent(@CurrentUser() actor: User): Promise<SubscriptionResponseDto> {
    const [sub, billingMode] = await Promise.all([
      this.subscriptionService.getOrCreateForTenant(actor.tenantId),
      this.subscriptionService.determineBillingMode(actor.tenantId),
    ]);
    const items = await this.buildItemDtos(sub.id);
    return SubscriptionResponseDto.from(sub, items, billingMode);
  }

  /**
   * Joins billing_subscription_items with the module catalog for display
   * names -- items store only moduleCode, never a denormalized name, so
   * the catalog lookup happens here rather than duplicating module names
   * into billing's own tables.
   */
  private async buildItemDtos(subscriptionId: string): Promise<SubscriptionItemResponseDto[]> {
    const items = await this.subscriptionService.listItems(subscriptionId);
    if (items.length === 0) return [];
    const modules = await this.catalog.findByCodes(items.map((i) => i.moduleCode));
    const nameByCode = new Map(modules.map((m) => [m.code, m.name]));
    return items.map((i) => ({
      moduleCode: i.moduleCode,
      moduleName: nameByCode.get(i.moduleCode) ?? i.moduleCode,
      unitPrice: i.unitPrice,
      billingCycle: i.billingCycle,
      periodEnd: i.periodEnd,
    }));
  }

  @Post('cancel')
  @ApiOperation({ summary: 'Cancel the subscription -- at period end (default) or immediately.' })
  async cancel(@Body() dto: CancelSubscriptionDto, @CurrentUser() actor: User): Promise<SubscriptionResponseDto> {
    const sub = await this.subscriptionService.cancel(actor.tenantId, dto.atPeriodEnd ?? true);
    const moduleCodes = await this.subscriptionService.listActiveItemModuleCodes(sub.id);
    await this.entitlementSync.syncTenantEntitlements(actor.tenantId, sub, moduleCodes);
    return SubscriptionResponseDto.from(sub);
  }

  @Post('reactivate')
  @ApiOperation({ summary: 'Undo a pending CANCEL_AT_PERIOD_END cancellation' })
  async reactivate(@CurrentUser() actor: User): Promise<SubscriptionResponseDto> {
    const sub = await this.subscriptionService.reactivate(actor.tenantId);
    const moduleCodes = await this.subscriptionService.listActiveItemModuleCodes(sub.id);
    await this.entitlementSync.syncTenantEntitlements(actor.tenantId, sub, moduleCodes);
    return SubscriptionResponseDto.from(sub);
  }

  @Post('rebuild-entitlements')
  @ApiOperation({ summary: "Support/ops tool: recompute this tenant's subscription_licenses row purely from billing_subscriptions/billing_subscription_items. Safe to call any number of times (idempotent projection rebuild)." })
  async rebuildEntitlements(@CurrentUser() actor: User): Promise<{ ok: true }> {
    await this.entitlementSyncOps.rebuildTenant(actor.tenantId);
    return { ok: true };
  }
}
