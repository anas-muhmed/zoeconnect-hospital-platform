import { apiClient } from './client';

export type BillingCycle = 'MONTHLY' | 'YEARLY';

export type ModuleLicenseState = 'NOT_LICENSED' | 'LICENSED' | 'PENDING_ADD' | 'PENDING_REMOVAL' | 'EXPIRED';

export interface ModuleCatalogEntry {
  code: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  icon: string | null;
  category: string | null;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  isCore: boolean;
  isPurchasable: boolean;
  isAvailable: boolean;
  features: string[];
  /** Subscription Change Management: this tenant's current relationship to the module -- computed server-side, never derived from local selection state. */
  licenseState: ModuleLicenseState;
  pendingEffectiveDate: string | null;
  /** Per-module prepayment: this module's own paid-through date (set when licenseState is LICENSED or EXPIRED) -- lets the UI show "Licensed until {date}" and offer "buy more months" without a second round trip. */
  licensedUntil: string | null;
}

export interface QuoteModuleBreakdownLine {
  code: string;
  name: string;
  /** Price for ONE billing-cycle unit (one month if MONTHLY, one year if YEARLY) -- the line's actual charge is unitPrice * months. */
  unitPrice: number;
  isCore: boolean;
  /** Billing-cycle units purchased for this line (months for MONTHLY, years for YEARLY). Always 1 for core lines. */
  months: number;
  /** True when this code was already licensed at quote time -- "buy more months" rather than a new purchase. Always false for core lines and for a brand-new subscription. */
  isExtension: boolean;
}

/** One requested module + how many billing-cycle units to prepay for it. Defaults to 1 if omitted. */
export interface QuoteModuleRequest {
  code: string;
  months?: number;
}

export type QuoteStatus = 'CREATED' | 'READY' | 'CHECKOUT_STARTED' | 'CONSUMED' | 'EXPIRED';

export interface BillingQuote {
  id: string;
  billingCycle: BillingCycle;
  modules: string[];
  moduleBreakdown: QuoteModuleBreakdownLine[];
  currency: string;
  baseAmount: number;
  moduleAmount: number;
  discount: number;
  tax: number;
  total: number;
  status: QuoteStatus;
  /** SUBSCRIPTION (new/reactivation) vs MODULE_ADDITION (purchased on top of an already-open subscription, charged immediately) -- server-determined, informational only on the frontend. */
  quoteType?: 'SUBSCRIPTION' | 'MODULE_ADDITION';
  expiresAt: string;
  createdAt: string;
}

export type SubscriptionStatus =
  | 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCEL_AT_PERIOD_END' | 'CANCELLED' | 'SUSPENDED' | 'INCOMPLETE';

/**
 * Which of the three billing journeys the Subscribe page should present --
 * computed server-side (BillingSubscriptionService.determineBillingMode()).
 * The frontend must always branch on this field, never infer it from
 * `status` locally.
 */
export type SubscriptionBillingMode = 'NEW_SUBSCRIPTION' | 'ACTIVE_SUBSCRIPTION' | 'REACTIVATION';

export interface SubscriptionItem {
  moduleCode: string;
  moduleName: string;
  unitPrice: number;
  billingCycle: BillingCycle;
  /** This item's own paid-through date (per-module prepayment) -- independent of the subscription's overall renewal date. */
  periodEnd: string;
}

export interface BillingSubscriptionSummary {
  id: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  currency: string;
  startDate: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  provider: string | null;
  items?: SubscriptionItem[];
  billingMode?: SubscriptionBillingMode;
}

export type InvoiceStatus = 'ISSUED' | string;

export interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  tax: number;
  currency: string;
  status: InvoiceStatus;
  issuedAt: string;
}

export type PaymentStatus = 'CREATED' | 'PENDING' | 'SUCCESS' | 'FAILED';

export interface Payment {
  id: string;
  provider: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paidAt: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface CheckoutResult {
  provider: string;
  orderId: string;
  keyId: string;
  amount: number;
  currency: string;
  paymentId: string;
}

export interface VerifyPaymentPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export type SubscriptionChangeAction = 'ADD' | 'REMOVE';
export type SubscriptionChangeStatus = 'PENDING' | 'APPLIED' | 'CANCELLED';

export interface SubscriptionChange {
  id: string;
  moduleCode: string;
  moduleName: string | null;
  action: SubscriptionChangeAction;
  effectiveDate: string;
  status: SubscriptionChangeStatus;
  createdAt: string;
}

export const billingApi = {
  listModules: () =>
    apiClient.get<ModuleCatalogEntry[]>('/billing/modules').then((r) => r.data),

  createQuote: (billingCycle: BillingCycle, modules: QuoteModuleRequest[]) =>
    apiClient.post<BillingQuote>('/billing/quote', { billingCycle, modules }).then((r) => r.data),

  getQuote: (quoteId: string) =>
    apiClient.get<BillingQuote>(`/billing/quote/${quoteId}`).then((r) => r.data),

  getSubscription: () =>
    apiClient.get<BillingSubscriptionSummary>('/billing/subscription').then((r) => r.data),

  cancelSubscription: (atPeriodEnd: boolean = true) =>
    apiClient.post<BillingSubscriptionSummary>('/billing/subscription/cancel', { atPeriodEnd }).then((r) => r.data),

  reactivateSubscription: () =>
    apiClient.post<BillingSubscriptionSummary>('/billing/subscription/reactivate').then((r) => r.data),

  createCheckout: (quoteId: string) =>
    apiClient.post<CheckoutResult>('/billing/checkout', { quoteId }).then((r) => r.data),

  verifyPayment: (payload: VerifyPaymentPayload) =>
    apiClient.post<{ verified: boolean; status: string }>('/billing/payments/verify', payload).then((r) => r.data),

  listInvoices: () =>
    apiClient.get<Invoice[]>('/billing/invoices').then((r) => r.data),

  listPayments: () =>
    apiClient.get<Payment[]>('/billing/payments').then((r) => r.data),

  listSubscriptionChanges: () =>
    apiClient.get<SubscriptionChange[]>('/billing/subscription/changes').then((r) => r.data),

  createSubscriptionChange: (moduleCode: string, action: SubscriptionChangeAction) =>
    apiClient.post<SubscriptionChange>('/billing/subscription/changes', { moduleCode, action }).then((r) => r.data),

  cancelSubscriptionChange: (changeId: string) =>
    apiClient.delete<SubscriptionChange>(`/billing/subscription/changes/${changeId}`).then((r) => r.data),
};
