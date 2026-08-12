import { Inject, Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { BillingPayment } from '../entities/billing-payment.entity';
import { BillingSubscription } from '../entities/billing-subscription.entity';
import { BillingQuote } from '../entities/billing-quote.entity';
import { BillingSubscriptionService } from '../services/billing-subscription.service';
import { BillingInvoiceService } from '../services/billing-invoice.service';
import { BillingInvoice } from '../entities/billing-invoice.entity';
import { ENTITLEMENT_SYNC, EntitlementSyncPort } from '../entitlements/entitlement-sync.port';
import { AuditService } from '../../audit/audit.service';

export interface PaymentConfirmedResult {
  subscription: BillingSubscription;
  invoice: BillingInvoice;
}

/**
 * ZoeConnect Billing -- the post-payment orchestrator:
 *
 *   Payment Confirmed
 *         v
 *   Subscription Activated   (BillingSubscriptionService -- billing lifecycle only)
 *         v
 *   Invoice Generated        (BillingInvoiceService)
 *         v
 *   Entitlements Synced      (ENTITLEMENT_SYNC -> BillingEntitlementSyncService, Phase 4)
 *         v
 *   [transaction commits -- see BillingCheckoutService.runPostConfirmation, the caller]
 *         v
 *   Audit Logged / Notifications Sent
 *
 * Phase 4 transaction-boundary hardening: `run()` now takes a required
 * `manager` and does ONLY the three DB writes above through it --
 * subscription activation, invoice generation, and entitlement sync all
 * commit or roll back together as one unit (the caller,
 * BillingCheckoutService.runPostConfirmation(), opens the transaction and
 * also folds the quote-CONSUMED and payment-intent-SUCCEEDED writes into
 * the same one). Audit logging is deliberately NOT done inside `run()`
 * anymore -- AuditService.log() enqueues a Bull job, an inherently
 * outside-the-transaction side effect, so it's called by the caller AFTER
 * the transaction has committed (see runPostConfirmation) to avoid ever
 * recording an audit entry for a set of writes that then rolled back.
 * `run()` returns what it did so the caller has what it needs to log.
 *
 * Called from exactly two places, both AFTER a payment has been verified
 * server-side (never from a raw frontend "success" callback): the
 * `/billing/payments/verify` endpoint and the Razorpay webhook processor.
 * Idempotent: BillingCheckoutService only calls this once a payment's own
 * status has already been atomically moved from PENDING to SUCCESS, so a
 * concurrent verify+webhook race can only ever result in one caller
 * actually winning that transition and invoking this workflow.
 *
 * Notifications: no notification is actually sent yet -- NotificationModule
 * exists elsewhere in the codebase (WhatsApp/SMS/email), but wiring a
 * "your ZoeConnect subscription is active" template is a product/content
 * decision outside this phase's scope.
 */
@Injectable()
export class PaymentConfirmedWorkflow {
  private readonly logger = new Logger(PaymentConfirmedWorkflow.name);

  constructor(
    private readonly subscriptionService: BillingSubscriptionService,
    private readonly invoiceService: BillingInvoiceService,
    private readonly auditService: AuditService,
    @Inject(ENTITLEMENT_SYNC) private readonly entitlementSync: EntitlementSyncPort,
  ) {}

  async run(payment: BillingPayment, subscription: BillingSubscription, quote: BillingQuote, manager: EntityManager): Promise<PaymentConfirmedResult> {
    if (quote.quoteType === 'MODULE_ADDITION') {
      return this.runModuleAddition(payment, subscription, quote, manager);
    }
    return this.runNewOrReactivatedSubscription(payment, subscription, quote, manager);
  }

  /** SUBSCRIPTION quotes: brand new subscription or reactivation -- the whole priced module set becomes the subscription (existing behavior, unchanged). */
  private async runNewOrReactivatedSubscription(payment: BillingPayment, subscription: BillingSubscription, quote: BillingQuote, manager: EntityManager): Promise<PaymentConfirmedResult> {
    const nextPeriodEnd = this.computeNextPeriodEnd(quote.billingCycle);

    const activated = await this.subscriptionService.activateFromPayment(subscription, {
      billingCycle: quote.billingCycle,
      currentPeriodEnd: nextPeriodEnd,
      provider: payment.provider,
    }, manager);

    // Persist what this subscription now includes (billing's own record,
    // not the entitlement projection) BEFORE syncing entitlements, so the
    // projection and the source-of-truth items table never disagree even
    // momentarily within the same transaction.
    await this.subscriptionService.setSubscriptionItems(activated.id, quote.moduleBreakdown, quote.billingCycle, manager);

    const invoice = await this.invoiceService.generateForPayment(payment, manager);

    // Filter to non-expired items -- for a fresh SUBSCRIPTION/REACTIVATION
    // every item's periodEnd is `now + months` and months is always >= 1,
    // so nothing is actually filtered out today, but this keeps entitlement
    // sync's contract consistent everywhere (it always receives ACTIVE
    // codes, never a raw unfiltered list) rather than relying on that
    // being incidentally true.
    const activeModuleCodes = await this.subscriptionService.listActiveItemModuleCodes(activated.id, manager);
    await this.entitlementSync.syncTenantEntitlements(payment.tenantId, activated, activeModuleCodes, manager);

    this.logger.log(`Payment confirmed workflow complete (new/reactivated subscription): tenantId=${payment.tenantId} subscriptionId=${activated.id} invoiceNumber=${invoice.invoiceNumber}`);
    return { subscription: activated, invoice };
  }

  /**
   * MODULE_ADDITION quotes: subscription upgrade strategy -- a module
   * purchased on top of an already-open subscription is charged in full
   * immediately (no proration) and activates right away. Deliberately does
   * NOT call activateFromPayment(): the subscription is already
   * ACTIVE/PAST_DUE/CANCEL_AT_PERIOD_END/SUSPENDED, and its billing period/
   * renewal date must be left exactly as-is -- an addition purchase is not
   * a new billing cycle, it's new items (or extended months on existing
   * ones) riding along on the existing subscription. Each non-core line is
   * either genuinely new (addSubscriptionItems -- insert-only, never
   * touches what's already licensed) or "buy more months" on a module the
   * tenant already has (extendSubscriptionItem -- extends that one item's
   * periodEnd, per `line.isExtension`, set server-side by
   * BillingQuoteService.classifyModules() at quote time). quote.
   * moduleBreakdown is filtered to non-core lines first --
   * resolveModuleSelection() always prepends the tenant's core modules to
   * a quote's module set even though they were never requested here
   * (they're already licensed and free; core "months" never applies).
   */
  private async runModuleAddition(payment: BillingPayment, subscription: BillingSubscription, quote: BillingQuote, manager: EntityManager): Promise<PaymentConfirmedResult> {
    const nonCoreLines = quote.moduleBreakdown.filter((line) => !line.isCore);
    const newLines = nonCoreLines.filter((line) => !line.isExtension);
    const extendedLines = nonCoreLines.filter((line) => line.isExtension);

    await this.subscriptionService.addSubscriptionItems(subscription.id, newLines, subscription.billingCycle, manager);
    for (const line of extendedLines) {
      await this.subscriptionService.extendSubscriptionItem(subscription.id, line.code, line.months, subscription.billingCycle, manager);
    }

    const invoice = await this.invoiceService.generateForPayment(payment, manager);

    // Full desired module set = whatever was already licensed + what this
    // purchase just added/extended -- read back INSIDE the same
    // transaction/manager so the just-written rows are visible (a repo
    // bound to a different pooled connection cannot see this
    // transaction's uncommitted writes), and filtered to non-expired so an
    // unrelated module that happened to lapse doesn't get re-granted here.
    const activeModuleCodes = await this.subscriptionService.listActiveItemModuleCodes(subscription.id, manager);
    await this.entitlementSync.syncTenantEntitlements(payment.tenantId, subscription, activeModuleCodes, manager);

    this.logger.log(`Payment confirmed workflow complete (module purchase): tenantId=${payment.tenantId} subscriptionId=${subscription.id} added=[${newLines.map((l) => l.code)}] extended=[${extendedLines.map((l) => `${l.code}+${l.months}`)}] invoiceNumber=${invoice.invoiceNumber}`);
    return { subscription, invoice };
  }

  /** Called by the caller AFTER the transaction commits -- see class doc comment. Audit `action` is intentionally the same value for both quote types (no audit-log enum migration needed); `quoteType`/`purchasedModules` in metadata is what distinguishes a module-addition purchase from a new/reactivated subscription when reading the log. */
  logConfirmation(payment: BillingPayment, result: PaymentConfirmedResult, quoteType: string, purchasedModules: string[]): void {
    this.auditService.log({
      action: 'BILLING_SUBSCRIPTION_ACTIVATED',
      module: 'BILLING',
      entityType: 'billing_subscription',
      entityId: result.subscription.id,
      tenantId: payment.tenantId,
      metadata: { paymentId: payment.id, invoiceId: result.invoice.id, invoiceNumber: result.invoice.invoiceNumber, quoteType, purchasedModules },
    });
    // TODO(notifications): send a "subscription activated" notification via the existing NotificationModule once a template/copy decision is made.
  }

  private computeNextPeriodEnd(billingCycle: 'MONTHLY' | 'YEARLY'): Date {
    const now = new Date();
    const next = new Date(now);
    if (billingCycle === 'MONTHLY') {
      next.setMonth(next.getMonth() + 1);
    } else {
      next.setFullYear(next.getFullYear() + 1);
    }
    return next;
  }
}
