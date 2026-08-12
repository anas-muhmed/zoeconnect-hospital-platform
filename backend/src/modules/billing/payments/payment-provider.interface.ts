/**
 * ZoeConnect Billing — payment provider abstraction (defined in Phase 2,
 * bound to a real implementation in Phase 3).
 *
 * Billing/subscription services depend on this interface only, never on
 * a concrete gateway SDK. Provider-specific request/response shapes stay
 * inside the adapter implementation (e.g. RazorpayPaymentProvider) or in
 * the `raw`/`metadata` fields below -- callers outside the adapter never
 * import a provider SDK type. Swapping providers is: implement this
 * interface, bind it behind the PAYMENT_PROVIDER token
 * (payment-provider.tokens.ts) based on the `billing.provider` config
 * value -- no change to BillingQuoteService, BillingSubscriptionService,
 * or any controller.
 *
 * ZoeConnect owns the subscription (`billing_subscriptions`); the
 * provider only facilitates payment and (optionally) recurring billing.
 * A `providerSubscriptionId` is metadata ZoeConnect stores about a
 * subscription it already owns -- never the other way around.
 */

export interface CreateOrderInput {
  tenantId: string;
  quoteId: string;
  amount: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface CreateOrderResult {
  provider: string;
  providerOrderId: string;
  amount: number;
  currency: string;
  /** Publishable/public key the frontend needs to open the provider's checkout widget. Never a secret. */
  publicKeyId: string;
  raw?: Record<string, unknown>;
}

export interface VerifyPaymentInput {
  tenantId: string;
  providerOrderId: string;
  providerPaymentId: string;
  /** Provider-specific signature/proof supplied by the checkout callback. Verified against the provider's secret -- never trusted at face value. */
  signature: string;
}

export interface VerifyPaymentResult {
  verified: boolean;
  providerPaymentId: string;
  providerOrderId: string;
  reason?: string;
}

export interface WebhookVerificationInput {
  /** Raw request body bytes/string, exactly as received -- signature verification requires the untouched payload. */
  rawBody: string | Buffer;
  signatureHeader: string;
}

export interface NormalizedWebhookEvent {
  provider: string;
  /** Provider's own event id -- used for the (provider, eventId) idempotency key. */
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface GetPaymentResult {
  providerPaymentId: string;
  status: 'created' | 'authorized' | 'captured' | 'failed' | 'refunded';
  amount: number;
  currency: string;
  raw?: Record<string, unknown>;
}

export interface RefundPaymentInput {
  providerPaymentId: string;
  amount?: number;
  reason?: string;
}

export interface RefundPaymentResult {
  providerRefundId: string;
  amount: number;
  status: string;
}

export interface CancelProviderSubscriptionInput {
  providerSubscriptionId: string;
  cancelAtPeriodEnd: boolean;
}

export interface PaymentProvider {
  readonly name: string;

  /** Creates a provider-side order for a one-time/first payment against an already-computed, immutable quote. */
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;

  /** Returns whatever the frontend needs to open the provider's hosted/embedded checkout for a previously created order. */
  createCheckout(orderResult: CreateOrderResult): Promise<Record<string, unknown>>;

  /** Verifies a payment confirmation callback's signature server-side. Never trust a frontend "success" callback without this. */
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;

  /** Verifies an inbound webhook's signature and normalizes it into a provider-agnostic shape. Throws if the signature is invalid. */
  handleWebhook(input: WebhookVerificationInput): Promise<NormalizedWebhookEvent>;

  getPayment(providerPaymentId: string): Promise<GetPaymentResult>;

  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;

  cancelSubscription(input: CancelProviderSubscriptionInput): Promise<void>;
}
