import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { EntitlementSyncPort } from './entitlement-sync.port';
import { BillingSubscription } from '../entities/billing-subscription.entity';

/**
 * Retained after Phase 4 purely as a documented fallback binding for
 * tests/tooling that want to exercise the billing flow WITHOUT touching
 * `subscription_licenses` at all. Production `billing.module.ts` binds
 * `ENTITLEMENT_SYNC` to the real `BillingEntitlementSyncService` now.
 */
@Injectable()
export class NoOpEntitlementSync implements EntitlementSyncPort {
  private readonly logger = new Logger(NoOpEntitlementSync.name);

  async syncTenantEntitlements(tenantId: string, subscription: BillingSubscription, moduleCodes: string[], _manager?: EntityManager): Promise<void> {
    this.logger.warn(
      `ENTITLEMENT SYNC IS A NO-OP (test/tooling binding) -- tenantId=${tenantId} subscriptionId=${subscription.id} modules=${moduleCodes.join(',')} were NOT written to subscription_licenses.`,
    );
  }
}
