import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { BillingSubscription, BillingSubscriptionStatus, SubscriptionBillingMode, OPEN_SUBSCRIPTION_STATUSES } from '../entities/billing-subscription.entity';
import { BillingSubscriptionItem } from '../entities/billing-subscription-item.entity';
import { BillingCycle, QuoteModuleBreakdownLine } from '../entities/billing-quote.entity';

/**
 * ZoeConnect Billing. Owns ONLY the billing lifecycle of
 * `billing_subscriptions` (+ its own `billing_subscription_items` child
 * table) -- trial bootstrap, activation bookkeeping, renewal-period
 * tracking, cancellation, expiration. It never imports or depends on
 * `SubscriptionLicense`/`subscription_licenses` or any module
 * entitlement -- that projection is BillingEntitlementSyncService's job
 * (modules/billing/entitlements), which reads the state this service
 * writes and pushes it downstream, one-way. Keeping this boundary means a
 * bug in billing-period bookkeeping can never accidentally revoke or
 * grant module access, and vice versa.
 *
 * Trial bootstrap reuses the existing `LICENSE_TRIAL_DAYS` env var
 * (already read the same way by `TenantProvisioningService` for cloud
 * self-hosted trial licensing) rather than introducing a second,
 * independently configurable trial length for billing -- one trial
 * duration, one config key.
 */
@Injectable()
export class BillingSubscriptionService {
  private readonly logger = new Logger(BillingSubscriptionService.name);

  constructor(
    @InjectRepository(BillingSubscription) private readonly subscriptionRepo: Repository<BillingSubscription>,
    @InjectRepository(BillingSubscriptionItem) private readonly itemRepo: Repository<BillingSubscriptionItem>,
    private readonly config: ConfigService,
  ) {}

  /**
   * Returns the tenant's current (non-CANCELLED) billing subscription,
   * creating a TRIAL row on first access if none exists yet. Relies on
   * the DB's partial unique index (`UQ_billing_subscriptions_tenant_active`,
   * one non-CANCELLED row per tenant) to make concurrent first-access
   * calls safe -- a losing concurrent insert fails the unique constraint
   * and simply re-reads the winner's row instead of erroring out.
   */
  async getOrCreateForTenant(tenantId: string): Promise<BillingSubscription> {
    const existing = await this.findCurrentForTenant(tenantId);
    if (existing) return existing;

    const trialDays = this.config.get<number>('LICENSE_TRIAL_DAYS', 30);
    const now = new Date();
    const currentPeriodEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    const currency = this.config.get<string>('billing.currency', 'INR');

    try {
      const created = this.subscriptionRepo.create({
        tenantId,
        status: 'TRIAL',
        billingCycle: 'MONTHLY',
        currency,
        startDate: now,
        currentPeriodStart: now,
        currentPeriodEnd,
      });
      return await this.subscriptionRepo.save(created);
    } catch (err) {
      // Unique violation (Postgres code 23505) -- a concurrent request won the race and already created it.
      const existingAfterRace = await this.findCurrentForTenant(tenantId);
      if (existingAfterRace) return existingAfterRace;
      throw err;
    }
  }

  async findCurrentForTenant(tenantId: string): Promise<BillingSubscription | null> {
    return this.subscriptionRepo
      .createQueryBuilder('s')
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.status != :cancelled', { cancelled: 'CANCELLED' })
      .getOne();
  }

  /**
   * Subscription Change Management: unlike findCurrentForTenant(), this
   * INCLUDES a CANCELLED row -- needed so the billing catalog can tell
   * "never had this module" (NOT_LICENSED) apart from "had it, but the
   * whole subscription lapsed" (EXPIRED, offer "Renew"). Most-recent by
   * createdAt, since a tenant can only ever have one non-CANCELLED
   * subscription at a time but may have cancelled-and-restarted history.
   */
  async findLatestForTenant(tenantId: string): Promise<BillingSubscription | null> {
    return this.subscriptionRepo
      .createQueryBuilder('s')
      .where('s.tenant_id = :tenantId', { tenantId })
      .orderBy('s.created_at', 'DESC')
      .getOne();
  }

  /**
   * Subscription Change Management: determines which of the three billing
   * journeys (see SubscriptionBillingMode doc comment) the Subscribe page
   * should present. Deliberately based on findLatestForTenant(), NOT
   * getOrCreateForTenant()'s result -- a tenant whose only subscription
   * was fully CANCELLED has getOrCreateForTenant() silently hand them a
   * brand-new TRIAL row (existing pre-change-management behavior, left
   * alone here), which would make them look like a NEW_SUBSCRIPTION
   * tenant even though they have real billing history and should see
   * "Reactivate", not "Subscribe".
   */
  async determineBillingMode(tenantId: string): Promise<SubscriptionBillingMode> {
    const latest = await this.findLatestForTenant(tenantId);
    if (!latest) return 'NEW_SUBSCRIPTION';

    if (OPEN_SUBSCRIPTION_STATUSES.includes(latest.status)) return 'ACTIVE_SUBSCRIPTION';

    // CANCELLED with a `provider` set means it was activated by a real
    // payment at some point (activateFromPayment() is the only writer of
    // that column) -- a genuine lapsed paid subscription, not a trial
    // that was cancelled before ever being paid for.
    if (latest.status === 'CANCELLED' && latest.provider) return 'REACTIVATION';

    return 'NEW_SUBSCRIPTION';
  }

  /**
   * Marks the given subscription ACTIVE with a real billing period,
   * associated with a payment provider. Called by Phase 3's checkout/
   * webhook flow once a payment has been verified -- NOT called by
   * anything in Phase 2 (no payment flow exists yet). Deliberately takes
   * an already-loaded `BillingSubscription` rather than a tenantId, since
   * the caller will already hold the row (loaded/locked inside the same
   * transaction as the payment write in Phase 3/4).
   */
  async activateFromPayment(
    subscription: BillingSubscription,
    params: {
      billingCycle: BillingCycle;
      currentPeriodEnd: Date;
      provider: string;
      providerCustomerId?: string | null;
      providerSubscriptionId?: string | null;
    },
    manager?: EntityManager,
  ): Promise<BillingSubscription> {
    const repo = manager ? manager.getRepository(BillingSubscription) : this.subscriptionRepo;
    const now = new Date();
    subscription.status = 'ACTIVE';
    subscription.billingCycle = params.billingCycle;
    subscription.startDate = subscription.startDate ?? now;
    subscription.currentPeriodStart = now;
    subscription.currentPeriodEnd = params.currentPeriodEnd;
    subscription.cancelAtPeriodEnd = false;
    subscription.provider = params.provider;
    subscription.providerCustomerId = params.providerCustomerId ?? subscription.providerCustomerId;
    subscription.providerSubscriptionId = params.providerSubscriptionId ?? subscription.providerSubscriptionId;
    return repo.save(subscription);
  }

  /**
   * Advances `base` by `units` billing-cycle periods -- calendar months if
   * `cycle` is MONTHLY, calendar years if YEARLY. THE single place item
   * periodEnd math happens, so "a month" or "a year" means the same thing
   * everywhere a module's paid-through date is computed (new purchase,
   * addition, or extension).
   */
  static addCycleUnits(base: Date, cycle: BillingCycle, units: number): Date {
    const next = new Date(base);
    if (cycle === 'MONTHLY') {
      next.setMonth(next.getMonth() + units);
    } else {
      next.setFullYear(next.getFullYear() + units);
    }
    return next;
  }

  /**
   * Replaces a subscription's billing_subscription_items with the given
   * list -- called once per successful payment, right after
   * activateFromPayment(), from the SAME transaction (`manager` passed
   * through). Delete-then-reinsert is fine for THIS table (it's billing's
   * own child records, describing what a subscription currently
   * includes) -- the "reconcile, never delete+insert" rule from the
   * approved Phase 4 principles applies specifically to the
   * `subscription_licenses` PROJECTION (BillingEntitlementSyncService),
   * not to billing's own source-of-truth tables. Each item's own
   * `periodEnd` is `now + line.months` cycle-units -- independent of
   * `subscription.currentPeriodEnd`, per-module prepayment (see
   * BillingSubscriptionItem.periodEnd doc comment).
   */
  async setSubscriptionItems(
    subscriptionId: string,
    lines: QuoteModuleBreakdownLine[],
    billingCycle: BillingCycle,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(BillingSubscriptionItem) : this.itemRepo;
    await repo.delete({ subscriptionId });
    if (lines.length === 0) return;
    const now = new Date();
    const items = lines.map((line) => repo.create({
      subscriptionId, moduleCode: line.code, quantity: 1, unitPrice: line.unitPrice, billingCycle,
      periodEnd: BillingSubscriptionService.addCycleUnits(now, billingCycle, line.months),
    }));
    await repo.save(items);
  }

  /**
   * "Currently licensed" codes -- items whose OWN `periodEnd` hasn't
   * passed yet. This is what entitlement sync and quote-time duplicate/
   * extension classification should almost always use instead of
   * listItemModuleCodes() (which returns every item row regardless of
   * expiry) -- a module whose prepaid months ran out must stop counting as
   * licensed even though its `billing_subscription_items` row is still
   * there (that row is the tenant's purchase history, never deleted just
   * because time passed).
   */
  async listActiveItemModuleCodes(subscriptionId: string, manager?: EntityManager): Promise<string[]> {
    const repo = manager ? manager.getRepository(BillingSubscriptionItem) : this.itemRepo;
    const items = await repo.find({ where: { subscriptionId } });
    const now = Date.now();
    return items.filter((i) => i.periodEnd.getTime() > now).map((i) => i.moduleCode);
  }

  /** All item codes regardless of expiry -- e.g. "does a row exist for this code at all" checks. Accepts an optional transaction `manager` so a caller inside the same transaction that just inserted items can read them back. */
  async listItemModuleCodes(subscriptionId: string, manager?: EntityManager): Promise<string[]> {
    const repo = manager ? manager.getRepository(BillingSubscriptionItem) : this.itemRepo;
    const items = await repo.find({ where: { subscriptionId } });
    return items.map((i) => i.moduleCode);
  }

  /**
   * Subscription upgrade strategy change: ADDS new line items to a
   * subscription that already has items, WITHOUT touching what's already
   * there -- the counterpart to setSubscriptionItems() (delete+reinsert,
   * used only for a brand new subscription/reactivation, where there's
   * nothing to preserve). Used when a genuinely NEW module is purchased on
   * top of an already-open subscription: the existing licensed modules
   * must never be disturbed by that purchase. Each line's `periodEnd` is
   * `now + line.months` cycle-units. Caller is responsible for ensuring
   * `lines` contains no module already licensed (BillingQuoteService.
   * classifyModules() routes those to extendSubscriptionItem() instead) --
   * this method does not itself check for duplicates.
   */
  async addSubscriptionItems(
    subscriptionId: string,
    lines: QuoteModuleBreakdownLine[],
    billingCycle: BillingCycle,
    manager?: EntityManager,
  ): Promise<void> {
    if (lines.length === 0) return;
    const repo = manager ? manager.getRepository(BillingSubscriptionItem) : this.itemRepo;
    const now = new Date();
    const items = lines.map((line) => repo.create({
      subscriptionId, moduleCode: line.code, quantity: 1, unitPrice: line.unitPrice, billingCycle,
      periodEnd: BillingSubscriptionService.addCycleUnits(now, billingCycle, line.months),
    }));
    await repo.save(items);
  }

  /**
   * Per-module prepayment: "buy N more months" on a module the tenant
   * ALREADY has. Extends that ONE item's `periodEnd` by `months`
   * cycle-units, from whichever is later -- its current `periodEnd` (if
   * still in the future, the new months simply stack on top of what's
   * already paid for) or `now` (if it had already lapsed, the new months
   * start counting from today, not from some point in the past). Every
   * other field on the item (unitPrice, quantity) is left untouched --
   * this is purely a duration extension, never a price change to what's
   * already been charged for prior months.
   */
  async extendSubscriptionItem(
    subscriptionId: string,
    moduleCode: string,
    months: number,
    billingCycle: BillingCycle,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(BillingSubscriptionItem) : this.itemRepo;
    const item = await repo.findOne({ where: { subscriptionId, moduleCode } });
    if (!item) {
      throw new BadRequestException(`Cannot extend ${moduleCode} -- no existing subscription item found for it.`);
    }
    const now = new Date();
    const base = item.periodEnd.getTime() > now.getTime() ? item.periodEnd : now;
    item.periodEnd = BillingSubscriptionService.addCycleUnits(base, billingCycle, months);
    await repo.save(item);
  }

  /** Phase 6: full item rows (not just codes) for the billing management UI's "current modules" display. Accepts an optional transaction `manager` for the same reason listItemModuleCodes() does. */
  async listItems(subscriptionId: string, manager?: EntityManager): Promise<BillingSubscriptionItem[]> {
    const repo = manager ? manager.getRepository(BillingSubscriptionItem) : this.itemRepo;
    return repo.find({ where: { subscriptionId } });
  }

  async cancel(tenantId: string, atPeriodEnd: boolean): Promise<BillingSubscription> {
    const subscription = await this.requireCurrentForTenant(tenantId);
    this.assertTransition(subscription.status, atPeriodEnd ? 'CANCEL_AT_PERIOD_END' : 'CANCELLED');

    if (atPeriodEnd) {
      subscription.status = 'CANCEL_AT_PERIOD_END';
      subscription.cancelAtPeriodEnd = true;
    } else {
      subscription.status = 'CANCELLED';
      subscription.cancelAtPeriodEnd = false;
    }
    return this.subscriptionRepo.save(subscription);
  }

  async reactivate(tenantId: string): Promise<BillingSubscription> {
    const subscription = await this.requireCurrentForTenant(tenantId);
    this.assertTransition(subscription.status, 'ACTIVE');
    subscription.status = 'ACTIVE';
    subscription.cancelAtPeriodEnd = false;
    return this.subscriptionRepo.save(subscription);
  }

  /**
   * Sweeps TRIAL/ACTIVE/PAST_DUE subscriptions whose currentPeriodEnd has
   * passed into the appropriate terminal/degraded state. Not wired to a
   * cron job in Phase 2 (no scheduling infra decision made yet for this
   * domain) -- exposed as a plain method so Phase 3/4 (or a scheduled
   * task) can call it. TRIAL -> CANCELLED (trial lapsed, never
   * converted); ACTIVE -> PAST_DUE (grace period handling is a Phase 3+
   * concern, once real payment/renewal failures exist to react to).
   */
  async expireLapsedSubscription(subscription: BillingSubscription): Promise<BillingSubscription> {
    if (!subscription.currentPeriodEnd || subscription.currentPeriodEnd.getTime() > Date.now()) {
      return subscription;
    }
    if (subscription.status === 'TRIAL') {
      subscription.status = 'CANCELLED';
    } else if (subscription.status === 'ACTIVE') {
      subscription.status = 'PAST_DUE';
    } else if (subscription.status === 'CANCEL_AT_PERIOD_END') {
      subscription.status = 'CANCELLED';
    }
    return this.subscriptionRepo.save(subscription);
  }

  private async requireCurrentForTenant(tenantId: string): Promise<BillingSubscription> {
    const subscription = await this.findCurrentForTenant(tenantId);
    if (!subscription) throw new BadRequestException('No active subscription found for this tenant');
    return subscription;
  }

  /** Minimal explicit state-machine guard -- mirrors the spirit of licensing's subscription-status-transition.util.ts, sized for billing's own status set. */
  private assertTransition(from: BillingSubscriptionStatus, to: BillingSubscriptionStatus): void {
    const allowed: Record<BillingSubscriptionStatus, BillingSubscriptionStatus[]> = {
      TRIAL: ['ACTIVE', 'CANCELLED', 'CANCEL_AT_PERIOD_END'],
      ACTIVE: ['PAST_DUE', 'CANCEL_AT_PERIOD_END', 'CANCELLED'],
      PAST_DUE: ['ACTIVE', 'CANCELLED'],
      CANCEL_AT_PERIOD_END: ['ACTIVE', 'CANCELLED'],
      CANCELLED: [],
      SUSPENDED: ['ACTIVE', 'CANCELLED'],
      INCOMPLETE: ['ACTIVE', 'CANCELLED'],
    };
    if (!allowed[from]?.includes(to)) {
      throw new BadRequestException(`Cannot transition subscription from ${from} to ${to}`);
    }
  }
}
