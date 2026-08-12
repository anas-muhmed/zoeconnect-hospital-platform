import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { BillingCycle, BillingQuote, BillingQuoteStatus, BillingQuoteType, QuoteModuleBreakdownLine } from '../entities/billing-quote.entity';
import { SubscriptionPricingService } from './subscription-pricing.service';
import { BillingSubscriptionService } from './billing-subscription.service';
import { CreateQuoteDto } from '../dto/create-quote.dto';
import { OPEN_SUBSCRIPTION_STATUSES } from '../entities/billing-subscription.entity';
import { BillingSubscriptionChangeService } from './billing-subscription-change.service';

const PRICING_VERSION = 1;

/**
 * Canonical (key-order-independent) hash input, so the same logical quote
 * always hashes the same way regardless of object key insertion order.
 * Deliberately excludes `id` (assigned only after insert) -- the hash
 * covers everything that determines the PRICE, not the row's identity.
 */
function computeQuoteHash(input: {
  tenantId: string; modules: string[]; breakdown: QuoteModuleBreakdownLine[];
  currency: string; total: number; createdAt: Date;
}): string {
  const canonical = JSON.stringify({
    tenantId: input.tenantId,
    modules: [...input.modules].sort(),
    breakdown: [...input.breakdown]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((l) => ({ code: l.code, unitPrice: l.unitPrice, isCore: l.isCore, months: l.months })),
    currency: input.currency,
    total: input.total,
    createdAt: input.createdAt.toISOString(),
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * ZoeConnect Billing, Phase 2. Owns the quote lifecycle:
 *
 *   CREATED -> READY -> CHECKOUT_STARTED -> CONSUMED
 *                  \-> EXPIRED
 *
 * `createQuote()` computes pricing synchronously via
 * SubscriptionPricingService and persists the result directly as READY --
 * there is no async pricing step today, so a quote is never observably
 * "CREATED but not yet priced". The quote row itself is the immutable
 * price snapshot: once written, its base/module/discount/tax/total
 * amounts never change. A stale/expired/consumed quote is never mutated
 * back to usable -- the caller (frontend) must request a fresh quote
 * instead, which keeps every quote a tenant sees dated no more than
 * `billing.quoteTtlMinutes` old.
 *
 * Phase 3 (checkout) will call `markCheckoutStarted()` /
 * `markConsumed()`; nothing calls them yet in Phase 2 since no payment
 * flow exists. `validateForCheckout()` is exposed now so Phase 3's
 * checkout endpoint doesn't need to reimplement ownership/expiry/status
 * checks.
 */
@Injectable()
export class BillingQuoteService {
  constructor(
    @InjectRepository(BillingQuote) private readonly quoteRepo: Repository<BillingQuote>,
    private readonly pricingService: SubscriptionPricingService,
    private readonly subscriptionService: BillingSubscriptionService,
    private readonly changeService: BillingSubscriptionChangeService,
  ) {}

  /**
   * Subscription upgrade strategy: determines whether this quote is for a
   * brand new subscription/reactivation (whole-module-set, resets the
   * billing period) or a MODULE_ADDITION on top of an already-open
   * subscription (charged immediately in full, no proration, billing
   * period untouched -- see BillingQuoteType doc comment). Deliberately
   * uses findCurrentForTenant() (excludes CANCELLED) + the same
   * OPEN_SUBSCRIPTION_STATUSES set BillingSubscriptionService.
   * determineBillingMode() uses, so a tenant's Subscribe-page billingMode
   * and the quote type its own selections produce can never disagree.
   */
  private async determineQuoteType(tenantId: string): Promise<{ type: BillingQuoteType; billingCycle: BillingCycle | null }> {
    const subscription = await this.subscriptionService.findCurrentForTenant(tenantId);
    if (subscription && OPEN_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
      return { type: 'MODULE_ADDITION', billingCycle: subscription.billingCycle };
    }
    return { type: 'SUBSCRIPTION', billingCycle: null };
  }

  /**
   * Per-module prepayment: classifies every requested (non-core) code as
   * either a brand new purchase or "buy more months" on a module the
   * tenant already has (whether currently active OR expired) -- an
   * already-licensed module is no longer unconditionally rejected (the old
   * duplicate-purchase guard); instead it's ALLOWED, but processed as an
   * EXTENSION of that item's own `periodEnd` rather than a new
   * `billing_subscription_items` row (see PaymentConfirmedWorkflow.
   * runModuleAddition()). Deliberately checks for ANY existing item row
   * for the code, not just non-expired ones -- BillingSubscriptionService.
   * extendSubscriptionItem() already handles an expired item correctly
   * (restarts the new months from `now`, not from the stale past
   * periodEnd), and routing an EXPIRED module's re-purchase through
   * addSubscriptionItems() instead would silently create a SECOND item row
   * for the same module (no uniqueness constraint stops that), corrupting
   * the catalog's per-module state going forward. Still rejects a code
   * that's currently PENDING_REMOVAL (buying more months on something
   * scheduled to be removed is a contradictory state -- the tenant must
   * cancel that pending removal first) and core codes (free/included,
   * "more months" has no meaning). For a SUBSCRIPTION-type quote nothing
   * is licensed yet, so every non-core code is always a fresh purchase.
   */
  private async classifyModules(
    tenantId: string, quoteType: BillingQuoteType, requestedCodes: string[],
  ): Promise<Map<string, boolean>> {
    const isExtensionByCode = new Map<string, boolean>();
    if (quoteType !== 'MODULE_ADDITION') {
      requestedCodes.forEach((c) => isExtensionByCode.set(c.trim().toUpperCase(), false));
      return isExtensionByCode;
    }

    const subscription = await this.subscriptionService.findCurrentForTenant(tenantId);
    // determineQuoteType() only returns MODULE_ADDITION when this exists and is open.
    const [existingItemCodes, pendingChanges] = await Promise.all([
      this.subscriptionService.listItemModuleCodes(subscription!.id),
      this.changeService.listPendingForSubscription(subscription!.id),
    ]);
    const existingItemCodeSet = new Set(existingItemCodes);
    const pendingRemovalCodes = new Set(pendingChanges.filter((c) => c.action === 'REMOVE').map((c) => c.moduleCode));

    const blocked = requestedCodes.filter((c) => pendingRemovalCodes.has(c.trim().toUpperCase()));
    if (blocked.length > 0) {
      throw new BadRequestException(
        `Scheduled for removal, cannot buy more months until that's cancelled: ${blocked.join(', ')}.`,
      );
    }

    requestedCodes.forEach((raw) => {
      const c = raw.trim().toUpperCase();
      isExtensionByCode.set(c, existingItemCodeSet.has(c));
    });
    return isExtensionByCode;
  }

  async createQuote(tenantId: string, actorUserId: string, dto: CreateQuoteDto): Promise<BillingQuote> {
    // A module addition to an already-open subscription is always priced
    // at THAT subscription's actual billing cycle -- billing cycle changes
    // are a separate, still-deferred-to-renewal concern (see
    // BillingSubscriptionChangeService), never something a module purchase
    // can smuggle in. dto.billingCycle is ignored in that case.
    const { type: quoteType, billingCycle: forcedBillingCycle } = await this.determineQuoteType(tenantId);
    const billingCycle = forcedBillingCycle ?? dto.billingCycle;

    const isExtensionByCode = await this.classifyModules(tenantId, quoteType, dto.modules.map((m) => m.code));

    const resolvedLines = await this.pricingService.resolveModuleSelection(dto.modules);
    const price = this.pricingService.calculate(resolvedLines, billingCycle);
    const breakdown: QuoteModuleBreakdownLine[] = price.breakdown.map((line) => ({
      ...line,
      isExtension: line.isCore ? false : (isExtensionByCode.get(line.code) ?? false),
    }));

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.pricingService.quoteTtlMinutes * 60_000);
    const quoteHash = computeQuoteHash({
      tenantId, modules: price.modules, breakdown, currency: price.currency, total: price.total, createdAt: now,
    });

    const quote = this.quoteRepo.create({
      tenantId,
      billingCycle: price.billingCycle,
      modules: price.modules,
      currency: price.currency,
      baseAmount: price.baseAmount,
      moduleAmount: price.moduleAmount,
      discount: price.discount,
      tax: price.tax,
      total: price.total,
      status: 'READY',
      quoteType,
      expiresAt,
      createdBy: actorUserId,
      pricingVersion: PRICING_VERSION,
      moduleBreakdown: breakdown,
      quoteHash,
      createdAt: now, // explicit, not DB-default -- must match what's hashed above
    });
    return this.quoteRepo.save(quote);
  }

  /**
   * Tamper-evidence check: recomputes the hash from the quote's own
   * stored fields and compares. This does NOT re-derive pricing from
   * module_registry (that's intentionally never done post-creation --
   * see class doc comment) -- it only confirms the row hasn't been
   * altered by anything other than BillingQuoteService itself (e.g. a
   * direct DB edit, a bug in a future migration, or manual tampering).
   * Called by BillingCheckoutService before creating a PaymentIntent.
   */
  verifyHash(quote: BillingQuote): boolean {
    if (!quote.quoteHash) return false;
    const recomputed = computeQuoteHash({
      tenantId: quote.tenantId,
      modules: quote.modules,
      breakdown: quote.moduleBreakdown,
      currency: quote.currency,
      total: quote.total,
      createdAt: quote.createdAt,
    });
    return recomputed === quote.quoteHash;
  }

  /** Tenant-scoped read. Lazily flips an expired READY quote to EXPIRED on read, since nothing sweeps the table on a timer in Phase 2. */
  async getQuote(quoteId: string, tenantId: string): Promise<BillingQuote> {
    const quote = await this.quoteRepo.findOne({ where: { id: quoteId } });
    if (!quote) throw new NotFoundException('Quote not found');
    if (quote.tenantId !== tenantId) throw new ForbiddenException('Quote does not belong to this tenant');

    if (quote.status === 'READY' && quote.expiresAt.getTime() < Date.now()) {
      quote.status = 'EXPIRED';
      await this.quoteRepo.save(quote);
    }
    return quote;
  }

  /**
   * Ownership + freshness gate a checkout flow must pass before creating
   * a payment order. Throws rather than returning a boolean so the
   * controller can surface a specific, actionable error
   * ("quote expired, please refresh pricing" vs. a generic failure).
   */
  async validateForCheckout(quoteId: string, tenantId: string): Promise<BillingQuote> {
    const quote = await this.getQuote(quoteId, tenantId);
    if (quote.status !== 'READY') {
      throw new BadRequestException(`Quote is ${quote.status.toLowerCase()}, not ready for checkout. Please request a new quote.`);
    }
    if (!this.verifyHash(quote)) {
      throw new BadRequestException('Quote integrity check failed. Please request a new quote.');
    }
    return quote;
  }

  async markCheckoutStarted(quoteId: string, tenantId: string): Promise<BillingQuote> {
    const quote = await this.validateForCheckout(quoteId, tenantId);
    quote.status = 'CHECKOUT_STARTED' as BillingQuoteStatus;
    return this.quoteRepo.save(quote);
  }

  /**
   * Production hardening: reverts a CHECKOUT_STARTED quote back to READY
   * when checkout creation fails after the quote was already marked
   * started (e.g. the payment provider's order-creation call errors) --
   * otherwise the quote would be permanently stuck (CHECKOUT_STARTED has
   * no lazy-expiry path back to EXPIRED the way READY does), forcing the
   * frontend to request a brand new quote on every retry instead of
   * reusing the one the user already saw a price for. A no-op (does not
   * throw) if the quote isn't currently CHECKOUT_STARTED, so it's safe to
   * call defensively from a catch block without re-checking state first.
   */
  async revertToReady(quoteId: string, tenantId: string): Promise<void> {
    const quote = await this.quoteRepo.findOne({ where: { id: quoteId } });
    if (!quote || quote.tenantId !== tenantId) return;
    if (quote.status !== 'CHECKOUT_STARTED') return;
    if (quote.expiresAt.getTime() < Date.now()) {
      quote.status = 'EXPIRED';
    } else {
      quote.status = 'READY';
    }
    await this.quoteRepo.save(quote);
  }

  /**
   * Called only after a payment for this quote has been verified/confirmed.
   * A CONSUMED quote can never be reused for another payment attempt.
   * Accepts an optional transaction `manager` so BillingCheckoutService can
   * fold this write into the same DB transaction as subscription
   * activation/invoice generation/entitlement sync (Phase 4's "everything
   * after Payment SUCCESS in one transaction" requirement).
   */
  async markConsumed(quoteId: string, tenantId: string, manager?: EntityManager): Promise<BillingQuote> {
    const repo = manager ? manager.getRepository(BillingQuote) : this.quoteRepo;
    const quote = await repo.findOne({ where: { id: quoteId } });
    if (!quote) throw new NotFoundException('Quote not found');
    if (quote.tenantId !== tenantId) throw new ForbiddenException('Quote does not belong to this tenant');
    quote.status = 'CONSUMED';
    return repo.save(quote);
  }
}
