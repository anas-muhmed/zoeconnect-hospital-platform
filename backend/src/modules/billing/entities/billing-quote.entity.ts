import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../utils/numeric.transformer';

export type BillingCycle = 'MONTHLY' | 'YEARLY';
export type BillingQuoteStatus = 'CREATED' | 'READY' | 'CHECKOUT_STARTED' | 'CONSUMED' | 'EXPIRED';

/**
 * SUBSCRIPTION -- a brand new subscription or a reactivation: the priced
 * module set becomes the WHOLE subscription (existing behavior --
 * PaymentConfirmedWorkflow resets the billing period and replaces
 * subscription items).
 * MODULE_ADDITION -- one or more new modules being added to a
 * subscription that is already open (ACTIVE/PAST_DUE/
 * CANCEL_AT_PERIOD_END/SUSPENDED). Charged in full immediately (no
 * proration); items are ADDED, never replace what's already licensed, and
 * the subscription's billing period/renewal date is left untouched.
 */
export type BillingQuoteType = 'SUBSCRIPTION' | 'MODULE_ADDITION';

export interface QuoteModuleBreakdownLine {
  code: string;
  name: string;
  /** Price for ONE billing-cycle unit (one month if billingCycle=MONTHLY, one year if YEARLY) -- multiply by `months` for this line's actual charge, already reflected in the quote's baseAmount/moduleAmount/total. */
  unitPrice: number;
  isCore: boolean;
  /** Number of billing-cycle units purchased for this line (months for MONTHLY, years for YEARLY). Always 1 for core lines. */
  months: number;
  /** True when this code was ALREADY licensed (an existing, non-expired billing_subscription_items row) at quote time -- "buy more months" on a module the tenant already has, priced and processed the same way as any other line but extends that item's periodEnd instead of inserting a new one. Always false for a SUBSCRIPTION-type quote (nothing is licensed yet). */
  isExtension: boolean;
}

/**
 * Immutable, server-calculated price snapshot. Created by
 * SubscriptionPricingService (POST /billing/quote) and never mutated after
 * creation -- checkout (POST /billing/checkout) references a quote by id
 * and re-validates ownership/expiry/status server-side rather than trusting
 * any amount from the browser. See CreateBillingSchema migration doc
 * comment for full rationale.
 */
@Entity('billing_quotes')
export class BillingQuote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'billing_cycle', type: 'varchar', length: 16 })
  billingCycle: BillingCycle;

  @Column({ name: 'modules', type: 'jsonb' })
  modules: string[];

  @Column({ name: 'currency', type: 'varchar', length: 8, default: 'INR' })
  currency: string;

  @Column({ name: 'base_amount', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  baseAmount: number;

  @Column({ name: 'module_amount', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  moduleAmount: number;

  @Column({ name: 'discount', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  discount: number;

  @Column({ name: 'tax', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  tax: number;

  @Column({ name: 'total', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  total: number;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'CREATED' })
  status: BillingQuoteStatus;

  /** See BillingQuoteType doc comment. Determined server-side at createQuote() time -- never accepted from the client. */
  @Column({ name: 'quote_type', type: 'varchar', length: 20, default: 'SUBSCRIPTION' })
  quoteType: BillingQuoteType;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  /** Reserved for future module_registry pricing versioning; always 1 today. */
  @Column({ name: 'pricing_version', type: 'int', default: 1 })
  pricingVersion: number;

  /** Per-module line items as priced AT QUOTE CREATION TIME -- never recomputed on read. */
  @Column({ name: 'module_breakdown', type: 'jsonb', default: () => "'[]'" })
  moduleBreakdown: QuoteModuleBreakdownLine[];

  /** SHA-256 tamper-evidence hash, see BillingQuoteService.computeHash()/verifyHash(). */
  @Column({ name: 'quote_hash', type: 'varchar', length: 64, nullable: true })
  quoteHash: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
