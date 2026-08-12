import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BillingSubscriptionChange, SubscriptionChangeAction } from '../entities/billing-subscription-change.entity';
import { BillingSubscriptionItem } from '../entities/billing-subscription-item.entity';
import { BillingSubscription } from '../entities/billing-subscription.entity';
import { BillingSubscriptionService } from './billing-subscription.service';
import { ModuleCatalogService } from './module-catalog.service';

const OPEN_SUBSCRIPTION_STATUSES = ['ACTIVE', 'PAST_DUE', 'CANCEL_AT_PERIOD_END'];

/**
 * ZoeConnect Billing -- Subscription Change Management.
 *
 * The purchase/duplicate-purchase problem this exists to solve: once a
 * tenant has a paid, active subscription, adding one more module mid-cycle
 * has no honest way to bill correctly without proration (charging a
 * partial-period amount for the new module) -- and this phase's explicit
 * scope EXCLUDES proration, immediate upgrades, and seat/quantity
 * licensing. Rather than either (a) silently re-running a full checkout
 * that would double-charge/duplicate `billing_subscription_items`, or (b)
 * inventing partial-period math nobody asked for yet, every ADD/REMOVE for
 * an ALREADY-SUBSCRIBED tenant is recorded here as PENDING and deferred to
 * the tenant's own renewal date -- no payment happens now, and
 * `billing_subscription_items` is never touched until then. A tenant with
 * no existing paid subscription (TRIAL, or CANCELLED with nothing to
 * defer against) still goes through the normal BillingQuoteService /
 * BillingCheckoutService / Razorpay flow for their first purchase (or a
 * "Renew" after full cancellation) -- this service is never involved in
 * that path.
 */
@Injectable()
export class BillingSubscriptionChangeService {
  constructor(
    @InjectRepository(BillingSubscriptionChange) private readonly changeRepo: Repository<BillingSubscriptionChange>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly subscriptionService: BillingSubscriptionService,
    private readonly catalog: ModuleCatalogService,
  ) {}

  /**
   * Schedules an ADD or REMOVE for the tenant's current subscription,
   * effective at that subscription's `currentPeriodEnd` (snapshotted onto
   * the row immediately -- see entity doc comment). Throws on every
   * "duplicate purchase" / invalid-state shape the module cards need to
   * prevent: no open subscription to attach to, module already licensed
   * (ADD) or not currently licensed (REMOVE), core modules can't be
   * removed, and at most one PENDING change per module at a time (also
   * enforced at the DB level by a partial unique index, in case of a
   * concurrent duplicate request racing this check).
   */
  async createChange(tenantId: string, actorUserId: string, moduleCode: string, action: SubscriptionChangeAction): Promise<BillingSubscriptionChange> {
    const code = moduleCode.trim().toUpperCase();
    const subscription = await this.subscriptionService.findCurrentForTenant(tenantId);
    if (!subscription || !OPEN_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
      throw new BadRequestException('No active subscription to modify. Purchase a subscription first.');
    }
    if (!subscription.currentPeriodEnd) {
      throw new BadRequestException('Your subscription has no billing period to schedule this change against.');
    }

    const [modules, currentItemCodes, existingPending] = await Promise.all([
      this.catalog.findByCodes([code]),
      this.subscriptionService.listItemModuleCodes(subscription.id),
      this.changeRepo.findOne({ where: { subscriptionId: subscription.id, moduleCode: code, status: 'PENDING' } }),
    ]);

    const module = modules[0];
    if (!module) throw new BadRequestException(`Unknown module code: ${code}`);
    if (module.isCore) throw new BadRequestException(`${module.name} is a core module and cannot be added or removed.`);

    if (existingPending) {
      throw new BadRequestException(`${module.name} already has a pending ${existingPending.action.toLowerCase()} scheduled for ${existingPending.effectiveDate.toDateString()}.`);
    }

    const isCurrentlyLicensed = currentItemCodes.includes(code);
    if (action === 'ADD') {
      if (isCurrentlyLicensed) {
        throw new BadRequestException(`${module.name} is already licensed on your subscription. Manage it from My Subscription instead of purchasing it again.`);
      }
      if (!module.isActive || !module.isPurchasable) {
        throw new BadRequestException(`${module.name} is not currently available for purchase.`);
      }
    } else {
      if (!isCurrentlyLicensed) {
        throw new BadRequestException(`${module.name} is not currently licensed on your subscription.`);
      }
    }

    const change = this.changeRepo.create({
      tenantId,
      subscriptionId: subscription.id,
      moduleCode: code,
      action,
      effectiveDate: subscription.currentPeriodEnd,
      status: 'PENDING',
      createdBy: actorUserId,
    });
    try {
      return await this.changeRepo.save(change);
    } catch (err) {
      // Lost a race against a concurrent identical request -- the DB's
      // partial unique index caught what the findOne() check above didn't.
      throw new BadRequestException(`A pending change for ${module.name} was just created by another request. Please refresh and try again.`);
    }
  }

  /** Tenant-scoped, newest first. Includes APPLIED/CANCELLED history, not just PENDING -- callers filter as needed (the "Pending Changes" UI section shows PENDING only). */
  async listForTenant(tenantId: string): Promise<BillingSubscriptionChange[]> {
    return this.changeRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  /** PENDING changes only, for the current subscription -- used by the catalog controller to compute each module's card state. */
  async listPendingForSubscription(subscriptionId: string): Promise<BillingSubscriptionChange[]> {
    return this.changeRepo.find({ where: { subscriptionId, status: 'PENDING' } });
  }

  async cancelChange(changeId: string, tenantId: string): Promise<BillingSubscriptionChange> {
    const change = await this.changeRepo.findOne({ where: { id: changeId } });
    if (!change) throw new NotFoundException('Pending change not found');
    if (change.tenantId !== tenantId) throw new ForbiddenException('This change does not belong to your tenant');
    if (change.status !== 'PENDING') {
      throw new BadRequestException(`This change is already ${change.status.toLowerCase()} and can no longer be cancelled.`);
    }
    change.status = 'CANCELLED';
    return this.changeRepo.save(change);
  }

  /**
   * Renewal-flow foundation (per the approved RENEWAL FLOW spec, steps
   * 1-3 + 6-7): atomically applies every due PENDING change for a
   * subscription into `billing_subscription_items`, then marks each
   * APPLIED. Deliberately stops short of invoice generation and
   * subscription-period renewal (spec steps 4-5) -- this codebase has no
   * recurring/auto-charge billing execution yet (RazorpayPaymentProvider
   * only ever facilitates a single checkout-initiated payment; there is
   * no cron or webhook that fires "a subscription's period just ended,
   * charge it again"), so wiring steps 4-5 here would fabricate behavior
   * the payment layer can't actually back up. Not exposed via any
   * controller endpoint in this phase (none was requested) -- reserved as
   * the hook a future renewal-execution job calls once that
   * infrastructure exists, exactly the same "written now, wired to a
   * scheduler later" pattern as
   * BillingSubscriptionService.expireLapsedSubscription().
   */
  async applyDueChanges(subscriptionId: string): Promise<{ applied: number }> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const changeRepo = manager.getRepository(BillingSubscriptionChange);
      const itemRepo = manager.getRepository(BillingSubscriptionItem);

      const due = await changeRepo
        .createQueryBuilder('c')
        .where('c.subscription_id = :subscriptionId', { subscriptionId })
        .andWhere('c.status = :status', { status: 'PENDING' })
        .andWhere('c.effective_date <= :now', { now: new Date() })
        .getMany();

      if (due.length === 0) return { applied: 0 };

      const codes = due.map((c) => c.moduleCode);
      const modules = await this.catalog.findByCodes(codes);
      const moduleByCode = new Map(modules.map((m) => [m.code, m]));

      for (const change of due) {
        if (change.action === 'REMOVE') {
          await itemRepo.delete({ subscriptionId, moduleCode: change.moduleCode });
        } else {
          const module = moduleByCode.get(change.moduleCode);
          if (!module) continue; // module was deactivated/removed from the catalog since scheduling -- skip rather than fail the whole batch
          const existing = await itemRepo.findOne({ where: { subscriptionId, moduleCode: change.moduleCode } });
          if (existing) continue; // already licensed by some other path -- nothing to do
          const subscription = await manager.getRepository(BillingSubscription).findOne({ where: { id: subscriptionId } });
          const billingCycle = subscription?.billingCycle ?? 'MONTHLY';
          const price = billingCycle === 'MONTHLY' ? module.monthlyPrice : (module.yearlyPrice ?? module.monthlyPrice);
          await itemRepo.save(itemRepo.create({
            subscriptionId, moduleCode: change.moduleCode, quantity: 1, unitPrice: price ?? 0, billingCycle,
          }));
        }
        change.status = 'APPLIED';
        await changeRepo.save(change);
      }

      return { applied: due.length };
    });
  }
}
