import { SubscriptionStatus } from '../entities/subscription-license.entity';

/**
 * Explicit state machine for `SubscriptionLicense.subscriptionStatus`
 * (hardening pass following the architecture review's "single, well-defined
 * state machine" ask, 2026-07-29).
 *
 * States:
 *  - trialing:  initial state for every new cloud tenant (30-day trial).
 *  - active:    a paid/administrator-approved subscription in good standing.
 *  - past_due:  billing has lapsed but the subscription hasn't been
 *               explicitly canceled -- SubscriptionLicenseProvider grants a
 *               short grace period here (see that file).
 *  - canceled:  the subscription has ended, deliberately, no grace.
 *  - incomplete: a subscription that never successfully activated (e.g. a
 *               failed initial payment) -- terminal, no grace, distinct from
 *               `canceled` only for reporting/support clarity.
 *  - suspended: an ADMINISTRATIVE override (abuse, compliance, manual
 *               ops decision) that is NOT billing-driven -- distinct from
 *               `canceled` so support/compliance tooling can tell "the
 *               customer stopped paying" apart from "we turned this tenant
 *               off ourselves." No grace period.
 *
 * `isValidTransition()` allows same-state transitions unconditionally (A PUT
 * that re-sends the current status, e.g. a retried request, must never be
 * rejected -- see the idempotency note in cloud-licensing.controller.ts) and
 * otherwise only allows the transitions listed below. Anything not listed is
 * rejected with a clear error rather than silently accepted, per the review's
 * explicit concern: "canceled -> trialing shouldn't silently happen."
 */
const ALLOWED_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  trialing:   ['active', 'canceled', 'suspended', 'incomplete'],
  active:     ['past_due', 'canceled', 'suspended'],
  past_due:   ['active', 'canceled', 'suspended'],
  // Reactivating a canceled subscription (a customer resubscribing) is a
  // real business flow -- but it must land on `active` (a fresh, explicit
  // subscription), never silently back into `trialing`.
  canceled:   ['active'],
  incomplete: ['active', 'canceled'],
  // An admin lifting a suspension goes back to whatever billing state is
  // actually true (active if paid, past_due if not) -- suspended -> trialing
  // is deliberately excluded for the same reason canceled -> trialing is.
  suspended:  ['active', 'past_due', 'canceled'],
};

export interface TransitionCheckResult {
  ok: boolean;
  reason?: string;
}

/**
 * `from === undefined` means "no existing row" (first-ever write for this
 * tenant, e.g. the defensive create-on-missing-row path in
 * CloudLicensingController) -- any initial status is allowed since there's
 * nothing to transition FROM.
 */
export function isValidTransition(from: SubscriptionStatus | undefined, to: SubscriptionStatus): TransitionCheckResult {
  if (from === undefined) return { ok: true };
  if (from === to) return { ok: true }; // idempotent no-op / retry, always allowed
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (allowed.includes(to)) return { ok: true };
  return {
    ok: false,
    reason: `Invalid subscription status transition: "${from}" -> "${to}" is not allowed. `
      + `Allowed transitions from "${from}": [${allowed.join(', ')}] (or no-op "${from}" -> "${from}").`,
  };
}
