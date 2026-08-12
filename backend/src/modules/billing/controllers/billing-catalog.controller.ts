import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { ModuleCatalogService } from '../services/module-catalog.service';
import { BillingSubscriptionService } from '../services/billing-subscription.service';
import { BillingSubscriptionChangeService } from '../services/billing-subscription-change.service';
import { ModuleCatalogEntryResponseDto, ModuleLicenseState } from '../dto/module-catalog-entry-response.dto';

@ApiTags('Billing')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingCatalogController {
  constructor(
    private readonly catalog: ModuleCatalogService,
    private readonly subscriptionService: BillingSubscriptionService,
    private readonly changeService: BillingSubscriptionChangeService,
  ) {}

  @Get('modules')
  @ApiOperation({ summary: "List the module catalog with this tenant's per-module license state (Subscription Change Management) -- LICENSED reflects that module's OWN periodEnd, not just the subscription's overall status." })
  async listModules(@CurrentUser() actor: User): Promise<ModuleCatalogEntryResponseDto[]> {
    const [catalog, subscription] = await Promise.all([
      this.catalog.listCatalog(),
      this.subscriptionService.findLatestForTenant(actor.tenantId),
    ]);

    if (!subscription) {
      return catalog.map((m) => ModuleCatalogEntryResponseDto.from(m, m.isCore ? 'LICENSED' : 'NOT_LICENSED'));
    }

    const isOpenSubscription = subscription.status !== 'CANCELLED';
    const [items, pendingChanges] = await Promise.all([
      this.subscriptionService.listItems(subscription.id),
      isOpenSubscription ? this.changeService.listPendingForSubscription(subscription.id) : Promise.resolve([]),
    ]);
    const itemByCode = new Map(items.map((i) => [i.moduleCode, i]));
    const pendingByCode = new Map(pendingChanges.map((c) => [c.moduleCode, c]));
    const now = Date.now();

    return catalog.map((m) => {
      if (m.isCore) return ModuleCatalogEntryResponseDto.from(m, 'LICENSED');

      const pending = pendingByCode.get(m.code);
      if (pending) {
        const state: ModuleLicenseState = pending.action === 'ADD' ? 'PENDING_ADD' : 'PENDING_REMOVAL';
        return ModuleCatalogEntryResponseDto.from(m, state, pending.effectiveDate);
      }

      const item = itemByCode.get(m.code);
      if (item) {
        // Per-module prepayment: LICENSED only while both the subscription
        // is open AND this specific item's own periodEnd hasn't passed --
        // a module's prepaid months can run out independently of the rest
        // of the subscription (see BillingSubscriptionItem.periodEnd).
        const isCurrentlyLicensed = isOpenSubscription && item.periodEnd.getTime() > now;
        return ModuleCatalogEntryResponseDto.from(m, isCurrentlyLicensed ? 'LICENSED' : 'EXPIRED', null, item.periodEnd);
      }

      return ModuleCatalogEntryResponseDto.from(m, 'NOT_LICENSED');
    });
  }
}
