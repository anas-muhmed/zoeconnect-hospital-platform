/**
 * Mortuary integration (Phase 2, Stage C).
 *
 * Ported verbatim (business logic, not implementation) from zoe-platform's
 * `src/modules/mortuary/utils/billingMath.js` and `config/pricing.js`.
 * Pure, DB-free — no TypeORM/NestJS dependency, matching the source's own
 * "extracted so it can be unit-tested directly" rationale.
 */

export type MortuaryPricingModel = 'tiered_flat_hourly' | 'flat_daily' | 'free';

export interface MortuaryPricingSettings {
  pricingModel: MortuaryPricingModel;
  dailyRate: number;
  firstDayCharge: number;
  hourlyChargeAfter24hrs: number;
}

export interface StayCharge {
  totalAmount: number;
  firstDayCharge: number;
  hourlyRate: number;
  extraHours: number;
  additionalHourCharges: number;
  dailyRate: number;
  days: number;
}

/**
 * The minimum advance a hospital's pricing model requires up front, at the
 * point a body is allocated a cabin — before the actual stay length is
 * known. Source: `config/pricing.js::getMinimumAdvance`.
 */
export function getMinimumAdvance(settings: MortuaryPricingSettings): number {
  switch (settings.pricingModel) {
    case 'flat_daily':
      return Number(settings.dailyRate) || 0;
    case 'free':
      return 0;
    default:
      return Number(settings.firstDayCharge) || 0; // tiered_flat_hourly
  }
}

/**
 * Computes the stay charge for a given pricing model. Same field shape
 * across all three models so callers don't need to branch on pricingModel
 * themselves. Source: `config/pricing.js::computeStayCharge`.
 */
export function computeStayCharge(settings: MortuaryPricingSettings, totalHours: number): StayCharge {
  const days = Math.max(1, Math.ceil(totalHours / 24));

  if (settings.pricingModel === 'free') {
    return { totalAmount: 0, firstDayCharge: 0, hourlyRate: 0, extraHours: 0, additionalHourCharges: 0, dailyRate: 0, days };
  }

  if (settings.pricingModel === 'flat_daily') {
    const dailyRate = Number(settings.dailyRate) || 0;
    return {
      totalAmount: dailyRate * days,
      firstDayCharge: dailyRate,
      hourlyRate: 0,
      extraHours: 0,
      additionalHourCharges: 0,
      dailyRate,
      days,
    };
  }

  // tiered_flat_hourly (default): flat charge for the first 24h, then hourly.
  const firstDayCharge = Number(settings.firstDayCharge) || 0;
  const hourlyRate = Number(settings.hourlyChargeAfter24hrs) || 0;
  let extraHours = 0;
  let additionalHourCharges = 0;
  let totalAmount = firstDayCharge;
  if (totalHours > 24) {
    extraHours = totalHours - 24;
    additionalHourCharges = extraHours * hourlyRate;
    totalAmount = firstDayCharge + additionalHourCharges;
  }
  return { totalAmount, firstDayCharge, hourlyRate, extraHours, additionalHourCharges, dailyRate: firstDayCharge, days };
}

/**
 * Source bug fix note (preserved from `billingMath.js`, fixed there
 * 2026-08-11, ported as-is — not a new fix): this must NOT clamp to 0.
 * When advance + discount exceeds gross, that's a real overpayment/
 * refund-due amount; flooring it at 0 silently hides that from the bill.
 */
export function computeNetAmount(params: { gross?: number | string | null; advance?: number | string | null; discount?: number | string | null }): number {
  return Number(params.gross || 0) - Number(params.advance || 0) - Number(params.discount || 0);
}

/**
 * Source: `utils/billingMath.js::formatCurrency`. The minus sign belongs in
 * front of the currency symbol (₹-1220.00 reads as a typo, not a negative
 * amount).
 */
export function formatCurrency(value: number | string | null | undefined): string {
  const n = Number(value) || 0;
  return n < 0 ? `-₹${Math.abs(n).toFixed(2)}` : `₹${n.toFixed(2)}`;
}

/**
 * Source: `utils/typeCoercion.js::coerceFreezerRequired`. Ported as-is:
 * the source's own comment documents this exact bug (frontend sends a JS
 * boolean, Postgres smallint column rejects `pg`'s "true"/"false" text
 * serialization) and requires both create and update paths to share one
 * function rather than duplicate the branching logic.
 */
export function coerceFreezerRequired(value: unknown): 0 | 1 {
  return value === false || value === 0 || value === '0' || value === 'false' ? 0 : 1;
}
