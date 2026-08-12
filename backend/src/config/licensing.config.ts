import { registerAs } from '@nestjs/config';

/**
 * Cloud Licensing hardening (ZoeConnect Cloud Licensing API, 2026-07-29).
 *
 * `subscriptionGracePeriodDays` mirrors `license.service.ts`'s own
 * self-hosted `GRACE_PERIOD_DAYS` constant (currently `1`), but as a real
 * config value rather than a hardcoded constant -- `SubscriptionLicenseProvider`
 * needs a distinct, operator-tunable grace window for Stripe-style
 * `past_due` (lapsed payment, not "your license file expired") without
 * touching self-hosted's own untouched grace-period constant.
 */
export const licensingConfig = registerAs('licensing', () => ({
  subscriptionGracePeriodDays: parseInt(process.env.SUBSCRIPTION_GRACE_PERIOD_DAYS || '3', 10),
}));
