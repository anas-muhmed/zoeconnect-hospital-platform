import { registerAs } from '@nestjs/config';

/**
 * ZoeConnect Billing, Phase 2 (Pricing Engine + Quote + Subscription
 * Services).
 *
 * Centralizes every pricing/provider knob SubscriptionPricingService and
 * the payment-provider factory read, following the same
 * `registerAs()`-namespace pattern as `licensing.config.ts`. Nothing in
 * the billing domain reads `process.env` directly outside this file (and
 * env.validation.ts, which only validates -- never consumes).
 */
export const billingConfig = registerAs('billing', () => ({
  /** Selects the active PaymentProvider implementation. See payments/payment-provider.interface.ts. */
  provider: process.env.PAYMENT_PROVIDER || 'razorpay',
  currency: process.env.BILLING_CURRENCY || 'INR',
  yearlyDiscountPercent: parseFloat(process.env.BILLING_YEARLY_DISCOUNT_PERCENT || '20'),
  taxPercent: parseFloat(process.env.BILLING_TAX_PERCENT || '18'),
  quoteTtlMinutes: parseInt(process.env.BILLING_QUOTE_TTL_MINUTES || '30', 10),
}));
