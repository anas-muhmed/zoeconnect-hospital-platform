import { registerAs } from '@nestjs/config';

/**
 * Razorpay-specific config, deliberately kept OUT of billing.config.ts --
 * `billing.*` stays provider-agnostic (per "keep billing generic": avoid
 * naming domain services/config after Razorpay); this namespace is where
 * the concrete adapter's own secrets/settings live. Only
 * RazorpayPaymentProvider reads `razorpay.*` -- no billing/subscription
 * service ever does.
 *
 * `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are server-only:
 * never returned in any API response, never logged (see
 * RazorpayPaymentProvider's logging -- it never logs full request/response
 * bodies from Razorpay, only ids/status). `RAZORPAY_KEY_ID` is the one
 * value the frontend is allowed to receive (to open Razorpay Checkout).
 */
export const razorpayConfig = registerAs('razorpay', () => ({
  keyId: process.env.RAZORPAY_KEY_ID || '',
  keySecret: process.env.RAZORPAY_KEY_SECRET || '',
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  apiBaseUrl: process.env.RAZORPAY_API_BASE_URL || 'https://api.razorpay.com/v1',
}));
