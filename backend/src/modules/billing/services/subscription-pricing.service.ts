import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleCatalogService } from './module-catalog.service';
import { BillingCycle, QuoteModuleBreakdownLine } from '../entities/billing-quote.entity';
import { ModuleRegistry } from '../../platform/infrastructure/licensing/module-registry.entity';

export interface PriceCalculation {
  currency: string;
  billingCycle: BillingCycle;
  modules: string[];
  baseAmount: number;
  moduleAmount: number;
  discount: number;
  tax: number;
  total: number;
  /** Per-module line items at the price used for THIS calculation -- what BillingQuoteService snapshots onto the quote row. `isExtension` is NOT set here (pricing stays tenant-agnostic, see class doc comment) -- BillingQuoteService fills it in afterwards. */
  breakdown: Omit<QuoteModuleBreakdownLine, 'isExtension'>[];
}

/** A module paired with how many billing-cycle units (months for MONTHLY, years for YEARLY) are being purchased for it. */
export interface ModuleSelectionLine {
  module: ModuleRegistry;
  months: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * ZoeConnect Billing, Phase 2. THE single place pricing is calculated --
 * BillingQuoteService, BillingSubscriptionService, and every controller
 * call into this rather than computing anything themselves. The frontend
 * never sees this logic; it only ever receives the output.
 *
 * Pricing model (per the approved architecture, module a la carte, no
 * plan-tier layer):
 *   - `module_registry` (via ModuleCatalogService) is the only pricing
 *     catalog. No hardcoded prices anywhere in this service.
 *   - Core modules (is_core = true, e.g. PLATFORM) are always included,
 *     free, and cannot be removed by the caller -- silently added to
 *     whatever module list is requested, never rejected for being
 *     "missing".
 *   - MONTHLY: moduleAmount = sum(monthlyPrice) of selected non-core
 *     modules.
 *   - YEARLY: moduleAmount = sum(yearlyPrice) if the module row has an
 *     explicit yearlyPrice, else falls back to
 *     monthlyPrice * 12 * (1 - billing.yearlyDiscountPercent / 100) --
 *     i.e. a module can define its own annual price, or inherit the
 *     configured global annual discount. `discount` on the returned
 *     quote is the informational difference between the raw
 *     monthly-equivalent-times-12 total and what's actually charged
 *     (already netted into moduleAmount, not subtracted a second time).
 *   - tax = (baseAmount + moduleAmount) * billing.taxPercent / 100.
 *   - total = baseAmount + moduleAmount + tax.
 */
@Injectable()
export class SubscriptionPricingService {
  constructor(
    private readonly moduleCatalog: ModuleCatalogService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Validates and normalizes a requested module list: dedupes, rejects
   * unknown/inactive/non-purchasable codes, and always includes every
   * currently-active core module regardless of what was requested (always
   * 1 unit -- core is free/included, "months" has no meaning for it).
   * Throws BadRequestException (never silently drops/ignores an invalid
   * code) so the caller sees exactly what was wrong.
   */
  async resolveModuleSelection(requested: { code: string; months: number }[]): Promise<ModuleSelectionLine[]> {
    const monthsByCode = new Map<string, number>();
    for (const r of requested) {
      const code = r.code.trim().toUpperCase();
      const months = Number.isInteger(r.months) && r.months > 0 ? r.months : 1;
      monthsByCode.set(code, months); // last one wins if the caller sent a duplicate code
    }
    const dedupedRequested = Array.from(monthsByCode.keys());

    const coreModules = await this.moduleCatalog.listCoreModules();
    const coreCodesSet = new Set(coreModules.map((m) => m.code));

    const nonCoreRequested = dedupedRequested.filter((c) => !coreCodesSet.has(c));
    const found = await this.moduleCatalog.findByCodes(nonCoreRequested);
    const foundByCode = new Map(found.map((m) => [m.code, m]));

    const unknown = nonCoreRequested.filter((c) => !foundByCode.has(c));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown module code(s): ${unknown.join(', ')}`);
    }

    const invalid = nonCoreRequested.filter((c) => {
      const m = foundByCode.get(c)!;
      return !m.isActive || !m.isPurchasable;
    });
    if (invalid.length > 0) {
      throw new BadRequestException(`Module(s) not currently available for purchase: ${invalid.join(', ')}`);
    }

    return [
      ...coreModules.map((m) => ({ module: m, months: 1 })),
      ...nonCoreRequested.map((c) => ({ module: foundByCode.get(c)!, months: monthsByCode.get(c)! })),
    ];
  }

  /**
   * Computes a full, immutable price breakdown for a resolved module
   * selection + billing cycle. Pure function of (lines, cycle, config) --
   * no I/O, no side effects, safe to call as many times as needed (e.g. to
   * re-validate a quote at checkout time). Each line's `months` is the
   * number of billing-cycle UNITS being purchased (calendar months for
   * MONTHLY, calendar years for YEARLY) -- there is no proration or
   * partial-period math, a line simply costs unitPrice * months.
   */
  calculate(lines: ModuleSelectionLine[], billingCycle: BillingCycle): PriceCalculation {
    const currency = this.config.get<string>('billing.currency', 'INR');
    const taxPercent = this.config.get<number>('billing.taxPercent', 0);
    const yearlyDiscountPercent = this.config.get<number>('billing.yearlyDiscountPercent', 0);

    const unitPriceFor = (m: ModuleRegistry): number => (
      billingCycle === 'MONTHLY'
        ? (m.monthlyPrice ?? 0)
        : (m.yearlyPrice ?? round2((m.monthlyPrice ?? 0) * 12 * (1 - yearlyDiscountPercent / 100)))
    );
    // The "raw" (undiscounted) per-cycle price, used only to compute the
    // informational `discount` figure below -- monthlyPrice * 12 is the
    // annual-equivalent-if-billed-monthly baseline a YEARLY line is
    // compared against, regardless of what unitPriceFor() actually charges.
    const rawAnnualEquivalentFor = (m: ModuleRegistry): number => (m.monthlyPrice ?? 0) * 12;

    const coreLines = lines.filter((l) => l.module.isCore);
    const nonCoreLines = lines.filter((l) => !l.module.isCore);

    const lineTotal = (l: ModuleSelectionLine): number => round2(unitPriceFor(l.module) * l.months);
    const baseAmount = round2(coreLines.reduce((sum, l) => sum + lineTotal(l), 0));
    const moduleAmount = round2(nonCoreLines.reduce((sum, l) => sum + lineTotal(l), 0));

    let discount = 0;
    if (billingCycle === 'YEARLY') {
      const rawAnnualEquivalent = round2(lines.reduce((sum, l) => sum + rawAnnualEquivalentFor(l.module) * l.months, 0));
      discount = Math.max(0, round2(rawAnnualEquivalent - (baseAmount + moduleAmount)));
    }

    const taxableAmount = baseAmount + moduleAmount;
    const tax = round2(taxableAmount * (taxPercent / 100));
    const total = round2(taxableAmount + tax);

    const breakdown: Omit<QuoteModuleBreakdownLine, 'isExtension'>[] = lines.map((l) => ({
      code: l.module.code,
      name: l.module.name,
      unitPrice: unitPriceFor(l.module),
      isCore: l.module.isCore,
      months: l.months,
    }));

    return {
      currency,
      billingCycle,
      modules: lines.map((l) => l.module.code),
      baseAmount,
      moduleAmount,
      discount: round2(discount),
      tax,
      total,
      breakdown,
    };
  }

  get quoteTtlMinutes(): number {
    return this.config.get<number>('billing.quoteTtlMinutes', 30);
  }
}
