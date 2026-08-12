import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BillingPaymentIntent } from '../entities/billing-payment-intent.entity';
import { BillingPayment } from '../entities/billing-payment.entity';
import { BillingQuoteService } from './billing-quote.service';
import { BillingSubscriptionService } from './billing-subscription.service';
import { PaymentProviderRegistry } from '../payments/payment-provider.registry';
import { PaymentConfirmedWorkflow, PaymentConfirmedResult } from '../workflows/payment-confirmed.workflow';
import { VerifyPaymentDto } from '../dto/verify-payment.dto';

export interface CheckoutResult {
  provider: string;
  orderId: string;
  keyId: string;
  amount: number;
  currency: string;
  paymentId: string;
}

/**
 * ZoeConnect Billing. Owns Quote -> PaymentIntent -> Gateway Order ->
 * Payment, and the verify/webhook-confirmation step. Never creates a
 * gateway-side SUBSCRIPTION -- ZoeConnect's `billing_subscriptions` row
 * is the subscription of record throughout; the gateway only ever
 * facilitates a single payment.
 */
@Injectable()
export class BillingCheckoutService {
  private readonly logger = new Logger(BillingCheckoutService.name);

  constructor(
    @InjectRepository(BillingPaymentIntent) private readonly intentRepo: Repository<BillingPaymentIntent>,
    @InjectRepository(BillingPayment) private readonly paymentRepo: Repository<BillingPayment>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly quoteService: BillingQuoteService,
    private readonly subscriptionService: BillingSubscriptionService,
    private readonly providerRegistry: PaymentProviderRegistry,
    private readonly paymentConfirmedWorkflow: PaymentConfirmedWorkflow,
  ) {}

  /**
   * Production hardening fix: if anything past `markCheckoutStarted()`
   * fails (most likely `provider.createOrder()` -- a network error or an
   * outage at the gateway), the quote used to be left stranded in
   * CHECKOUT_STARTED forever with no path back to READY (its lazy
   * expiry-flip in `getQuote()` only fires from READY) -- so a retry
   * couldn't reuse the same quote and support had no clean read on what
   * happened. On any failure here, the quote is now reverted to READY
   * (best-effort -- a failure to revert is logged, not thrown, so the
   * original error is always what the caller sees) so "Try Again" on the
   * frontend can retry checkout against the exact same quote/price
   * instead of silently needing a fresh one.
   */
  async createCheckout(tenantId: string, quoteId: string): Promise<CheckoutResult> {
    const quote = await this.quoteService.validateForCheckout(quoteId, tenantId);
    const subscription = await this.subscriptionService.getOrCreateForTenant(tenantId);

    const intent = await this.intentRepo.save(this.intentRepo.create({
      tenantId, quoteId: quote.id, amount: quote.total, currency: quote.currency, status: 'CREATED',
    }));

    await this.quoteService.markCheckoutStarted(quote.id, tenantId);

    try {
      const provider = this.providerRegistry.getActiveProvider();
      const order = await provider.createOrder({
        tenantId, quoteId: quote.id, amount: quote.total, currency: quote.currency, receipt: intent.id,
      });

      const payment = await this.paymentRepo.save(this.paymentRepo.create({
        tenantId,
        subscriptionId: subscription.id,
        quoteId: quote.id,
        paymentIntentId: intent.id,
        provider: provider.name,
        providerOrderId: order.providerOrderId,
        amount: quote.total,
        currency: quote.currency,
        status: 'PENDING',
      }));

      intent.status = 'PROCESSING';
      await this.intentRepo.save(intent);

      this.logger.log(`Checkout created: tenantId=${tenantId} quoteId=${quote.id} paymentId=${payment.id} orderId=${order.providerOrderId}`);

      return {
        provider: provider.name,
        orderId: order.providerOrderId,
        keyId: order.publicKeyId,
        amount: quote.total,
        currency: quote.currency,
        paymentId: payment.id,
      };
    } catch (err) {
      this.logger.error(`Checkout creation failed: tenantId=${tenantId} quoteId=${quote.id}: ${(err as Error).message}`);
      await this.intentRepo.update({ id: intent.id }, { status: 'FAILED' }).catch(() => undefined);
      await this.quoteService.revertToReady(quote.id, tenantId).catch((revertErr) => {
        this.logger.error(`Failed to revert quote ${quote.id} back to READY after a failed checkout attempt: ${(revertErr as Error).message}`);
      });
      throw new BadRequestException("We couldn't start the payment. Please try again.");
    }
  }

  /**
   * Backend verification step. Never trusts a frontend "success" boolean
   * -- only a valid provider signature moves a payment towards SUCCESS,
   * and even that transition now happens inside `confirmPayment()`'s
   * single transaction (see that method's doc comment for why the
   * CREATED/PENDING -> SUCCESS flip itself had to move there).
   */
  async verifyPayment(tenantId: string, dto: VerifyPaymentDto): Promise<{ verified: boolean; status: string }> {
    const payment = await this.paymentRepo.findOne({ where: { tenantId, providerOrderId: dto.razorpay_order_id } });
    if (!payment) throw new NotFoundException('Payment not found for this order');

    if (payment.status === 'SUCCESS') {
      return { verified: true, status: payment.status };
    }
    if (payment.status === 'FAILED') {
      throw new BadRequestException('This payment already failed. Please start a new checkout.');
    }

    const provider = this.providerRegistry.getProvider(payment.provider);
    const result = await provider.verifyPayment({
      tenantId,
      providerOrderId: dto.razorpay_order_id,
      providerPaymentId: dto.razorpay_payment_id,
      signature: dto.razorpay_signature,
    });

    if (!result.verified) {
      await this.paymentRepo.update({ id: payment.id }, { status: 'FAILED', failureReason: result.reason ?? 'Signature verification failed' });
      throw new BadRequestException('Payment could not be verified. Your account has not been charged or activated based on this alone.');
    }

    await this.confirmPayment(payment.id, dto.razorpay_payment_id);
    return { verified: true, status: 'SUCCESS' };
  }

  /**
   * Webhook-triggered confirmation path. Unlike verifyPayment(), the
   * caller (WebhookProcessorService) has already verified the whole
   * webhook payload's signature -- there's no per-payment signature to
   * check again here, only the same transactional CREATED/PENDING ->
   * SUCCESS transition inside confirmPayment(), so a webhook arriving
   * before, after, or racing a browser-side verify call always converges
   * on the same result. Looked up by `providerOrderId` alone (globally
   * unique in `billing_payments`, not tenant-scoped) -- the webhook
   * payload's own tenant hints (Razorpay `notes`) are never trusted for
   * anything beyond that lookup.
   */
  async confirmFromWebhook(providerOrderId: string, providerPaymentId: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({ where: { providerOrderId } });
    if (!payment) {
      this.logger.warn(`Webhook payment.captured for unknown providerOrderId=${providerOrderId} -- ignoring`);
      return;
    }
    if (payment.status === 'SUCCESS') return; // already confirmed via verify or an earlier webhook delivery
    await this.confirmPayment(payment.id, providerPaymentId);
  }

  async markFailedFromWebhook(providerOrderId: string, reason: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({ where: { providerOrderId } });
    if (!payment || payment.status === 'SUCCESS') return;
    await this.paymentRepo.update(
      { id: payment.id },
      { status: 'FAILED', failureReason: reason },
    );
  }

  /**
   * THE single confirmation path, called by both verifyPayment() and
   * confirmFromWebhook() once the caller has already proven the payment
   * is genuine (signature-verified). Production-hardening fix: the
   * CREATED/PENDING -> SUCCESS transition used to be committed as its
   * own standalone statement BEFORE the downstream subscription/invoice/
   * entitlement transaction -- meaning a failure in that later
   * transaction (e.g. a constraint violation during entitlement sync)
   * would leave a payment permanently stuck showing SUCCESS with nothing
   * actually activated. Everything -- the status flip itself, quote-
   * CONSUMED, payment-intent-SUCCEEDED, subscription activation, items,
   * invoice, and entitlement sync -- now happens inside ONE transaction:
   * either all of it lands, or none of it does and the payment stays
   * PENDING (safe to retry: a redelivered webhook, or an ops replay of
   * this same method, will simply try again).
   *
   * The conditional `WHERE status IN ('CREATED','PENDING')` UPDATE
   * remains the race guard between a concurrent verify() call and a
   * webhook delivery -- now evaluated and committed atomically with
   * everything it gates, so "lost the race" and "the winner's downstream
   * work failed" can no longer be confused with each other.
   */
  private async confirmPayment(paymentId: string, providerPaymentId: string): Promise<void> {
    const outcome = await this.dataSource.transaction(async (manager: EntityManager) => {
      const paymentRepo = manager.getRepository(BillingPayment);

      const updateResult = await manager
        .createQueryBuilder()
        .update(BillingPayment)
        .set({ status: 'SUCCESS', providerPaymentId, paidAt: new Date() })
        .where('id = :id AND status IN (:...statuses)', { id: paymentId, statuses: ['CREATED', 'PENDING'] })
        .execute();

      if ((updateResult.affected ?? 0) === 0) {
        return null; // lost the race -- another concurrent caller already confirmed (or is confirming) this payment
      }

      const payment = await paymentRepo.findOneOrFail({ where: { id: paymentId } });
      const quote = await this.quoteService.getQuote(payment.quoteId!, payment.tenantId);
      const subscription = await this.subscriptionService.findCurrentForTenant(payment.tenantId);
      if (!subscription) {
        // Throwing rolls back the SUCCESS flip too -- the payment stays
        // PENDING rather than being stranded as SUCCESS-but-unactivated.
        throw new Error(`No subscription found for tenant ${payment.tenantId} during post-payment confirmation -- this should be impossible (createCheckout always ensures one exists).`);
      }

      await this.quoteService.markConsumed(quote.id, payment.tenantId, manager).catch(() => undefined); // already CONSUMED is fine

      if (payment.paymentIntentId) {
        await manager.update(BillingPaymentIntent, { id: payment.paymentIntentId }, { status: 'SUCCEEDED' });
      }

      const workflowResult = await this.paymentConfirmedWorkflow.run(payment, subscription, quote, manager);
      return { payment, quote, workflowResult };
    });

    if (!outcome) return; // lost the race -- nothing to log, the winner already will (or already has)
    const purchasedModules = outcome.quote.quoteType === 'MODULE_ADDITION'
      ? outcome.quote.moduleBreakdown.filter((l) => !l.isCore).map((l) => l.code)
      : outcome.quote.modules;
    this.paymentConfirmedWorkflow.logConfirmation(outcome.payment, outcome.workflowResult, outcome.quote.quoteType, purchasedModules);
  }
}
