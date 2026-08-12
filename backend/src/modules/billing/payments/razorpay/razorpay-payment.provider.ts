import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import {
  CancelProviderSubscriptionInput,
  CreateOrderInput,
  CreateOrderResult,
  GetPaymentResult,
  NormalizedWebhookEvent,
  PaymentProvider,
  RefundPaymentInput,
  RefundPaymentResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
  WebhookVerificationInput,
} from '../payment-provider.interface';

/**
 * ZoeConnect Billing, Phase 3. The ONLY file in the codebase that knows
 * Razorpay's API shapes/terminology -- everything above this (checkout
 * service, webhook processor, controllers) speaks only the
 * PaymentProvider interface. Uses plain `axios` calls against Razorpay's
 * REST API (Basic Auth with keyId:keySecret) rather than the `razorpay`
 * npm SDK, to avoid adding a new dependency for what is a handful of
 * well-documented REST endpoints -- swap this for the SDK later with no
 * change to the interface or any caller.
 *
 * Secrets (`keySecret`, `webhookSecret`) never leave this class: not
 * logged, not put in any thrown error message, not included in
 * `CreateOrderResult`/`GetPaymentResult` (only `publicKeyId` -- the
 * publishable key id -- crosses back out).
 */
@Injectable()
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay';
  private readonly logger = new Logger(RazorpayPaymentProvider.name);
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    const keyId = this.config.get<string>('razorpay.keyId', '');
    const keySecret = this.config.get<string>('razorpay.keySecret', '');
    this.http = axios.create({
      baseURL: this.config.get<string>('razorpay.apiBaseUrl', 'https://api.razorpay.com/v1'),
      auth: { username: keyId, password: keySecret },
      timeout: 15_000,
    });
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const amountInSubunits = Math.round(input.amount * 100); // Razorpay amounts are in the smallest currency unit (paise for INR)
    const response = await this.http.post('/orders', {
      amount: amountInSubunits,
      currency: input.currency,
      receipt: input.receipt,
      notes: { tenantId: input.tenantId, quoteId: input.quoteId, ...input.notes },
    });
    this.logger.log(`Razorpay order created: orderId=${response.data.id} tenantId=${input.tenantId} amount=${input.amount}`);
    return {
      provider: this.name,
      providerOrderId: response.data.id,
      amount: input.amount,
      currency: input.currency,
      publicKeyId: this.config.get<string>('razorpay.keyId', ''),
      raw: response.data,
    };
  }

  async createCheckout(orderResult: CreateOrderResult): Promise<Record<string, unknown>> {
    // Razorpay's frontend Checkout widget just needs the order id + public key + amount/currency -- no server round trip beyond order creation.
    return {
      keyId: orderResult.publicKeyId,
      orderId: orderResult.providerOrderId,
      amount: Math.round(orderResult.amount * 100),
      currency: orderResult.currency,
    };
  }

  /**
   * Verifies the `razorpay_signature` the Checkout widget's success
   * callback hands the frontend: HMAC-SHA256(order_id + "|" + payment_id,
   * keySecret). This is the "backend verification" step -- the frontend
   * callback firing is never itself treated as proof of payment.
   */
  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const keySecret = this.config.get<string>('razorpay.keySecret', '');
    const expected = crypto
      .createHmac('sha256', keySecret)
      .update(`${input.providerOrderId}|${input.providerPaymentId}`)
      .digest('hex');

    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(input.signature || '');
    const verified = expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);

    if (!verified) {
      this.logger.warn(`Razorpay payment signature verification FAILED: orderId=${input.providerOrderId} paymentId=${input.providerPaymentId} tenantId=${input.tenantId}`);
    }
    return {
      verified,
      providerPaymentId: input.providerPaymentId,
      providerOrderId: input.providerOrderId,
      reason: verified ? undefined : 'Signature mismatch',
    };
  }

  /**
   * Verifies an inbound webhook's `X-Razorpay-Signature` header:
   * HMAC-SHA256(rawBody, webhookSecret), compared as a raw hex digest
   * (unlike CloudLicensingHmacGuard's `sha256=<hex>`-prefixed scheme --
   * Razorpay sends the bare hex digest). Throws UnauthorizedException on
   * mismatch rather than returning a boolean, since an invalid webhook
   * signature must never reach any processing code.
   */
  async handleWebhook(input: WebhookVerificationInput): Promise<NormalizedWebhookEvent> {
    const webhookSecret = this.config.get<string>('razorpay.webhookSecret', '');
    const bodyBuffer = Buffer.isBuffer(input.rawBody) ? input.rawBody : Buffer.from(input.rawBody);
    const expected = crypto.createHmac('sha256', webhookSecret).update(bodyBuffer).digest('hex');

    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(input.signatureHeader || '');
    const valid = expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);
    if (!valid) {
      this.logger.warn('Razorpay webhook signature verification FAILED');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const payload = JSON.parse(bodyBuffer.toString('utf8'));
    return {
      provider: this.name,
      // Razorpay webhook payloads don't always include a top-level unique
      // event id field consistently across event types in every account
      // configuration; the (entity id + event type + created_at) tuple is
      // Razorpay's own documented recommendation for a stable dedup key
      // where `payload.id` (an actual `event.<id>` if present) is absent.
      eventId: payload.id || `${payload.event}:${payload.payload?.payment?.entity?.id || payload.payload?.order?.entity?.id || ''}:${payload.created_at}`,
      eventType: payload.event,
      payload,
    };
  }

  async getPayment(providerPaymentId: string): Promise<GetPaymentResult> {
    const response = await this.http.get(`/payments/${providerPaymentId}`);
    const data = response.data;
    return {
      providerPaymentId: data.id,
      status: data.status,
      amount: data.amount / 100,
      currency: data.currency,
      raw: data,
    };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    const body: Record<string, unknown> = {};
    if (input.amount !== undefined) body.amount = Math.round(input.amount * 100);
    if (input.reason) body.notes = { reason: input.reason };
    const response = await this.http.post(`/payments/${input.providerPaymentId}/refund`, body);
    return {
      providerRefundId: response.data.id,
      amount: response.data.amount / 100,
      status: response.data.status,
    };
  }

  async cancelSubscription(input: CancelProviderSubscriptionInput): Promise<void> {
    await this.http.post(`/subscriptions/${input.providerSubscriptionId}/cancel`, {
      cancel_at_cycle_end: input.cancelAtPeriodEnd ? 1 : 0,
    });
  }
}
