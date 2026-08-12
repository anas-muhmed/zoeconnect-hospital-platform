import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingQuote } from './entities/billing-quote.entity';
import { BillingSubscription } from './entities/billing-subscription.entity';
import { BillingSubscriptionItem } from './entities/billing-subscription-item.entity';
import { BillingPayment } from './entities/billing-payment.entity';
import { BillingInvoice } from './entities/billing-invoice.entity';
import { BillingWebhookEvent } from './entities/billing-webhook-event.entity';
import { BillingPaymentIntent } from './entities/billing-payment-intent.entity';
import { BillingSubscriptionChange } from './entities/billing-subscription-change.entity';
import { ModuleRegistry } from '../platform/infrastructure/licensing/module-registry.entity';
import { SubscriptionLicense } from '../licensing/entities/subscription-license.entity';
import { Tenant } from '../platform/tenant/entities/tenant.entity';
import { ModuleCatalogService } from './services/module-catalog.service';
import { SubscriptionPricingService } from './services/subscription-pricing.service';
import { BillingQuoteService } from './services/billing-quote.service';
import { BillingSubscriptionService } from './services/billing-subscription.service';
import { BillingInvoiceService } from './services/billing-invoice.service';
import { BillingPaymentService } from './services/billing-payment.service';
import { BillingCheckoutService } from './services/billing-checkout.service';
import { BillingSubscriptionChangeService } from './services/billing-subscription-change.service';
import { WebhookProcessorService } from './services/webhook-processor.service';
import { PaymentProviderRegistry } from './payments/payment-provider.registry';
import { PAYMENT_PROVIDERS } from './payments/payment-provider.tokens';
import { RazorpayPaymentProvider } from './payments/razorpay/razorpay-payment.provider';
import { PaymentConfirmedWorkflow } from './workflows/payment-confirmed.workflow';
import { ENTITLEMENT_SYNC } from './entitlements/entitlement-sync.port';
import { BillingEntitlementSyncService } from './entitlements/billing-entitlement-sync.service';
import { BillingCatalogController } from './controllers/billing-catalog.controller';
import { BillingQuoteController } from './controllers/billing-quote.controller';
import { BillingSubscriptionController } from './controllers/billing-subscription.controller';
import { BillingCheckoutController } from './controllers/billing-checkout.controller';
import { BillingWebhookController } from './controllers/billing-webhook.controller';
import { BillingInvoiceController } from './controllers/billing-invoice.controller';
import { BillingPaymentController } from './controllers/billing-payment.controller';
import { BillingSubscriptionChangeController } from './controllers/billing-subscription-change.controller';
import { AuditModule } from '../audit/audit.module';

/**
 * ZoeConnect Billing.
 *
 * Phase 2: pricing engine, quote/subscription lifecycle services.
 * Phase 3: payment provider abstraction bound to RazorpayPaymentProvider
 * via the PAYMENT_PROVIDERS multi-provider token (PaymentProviderRegistry
 * resolves `billing.provider`/`PAYMENT_PROVIDER` to whichever
 * implementation was registered here). Checkout/verify/webhook endpoints,
 * WebhookProcessor, PaymentConfirmedWorkflow.
 * Phase 4: `ENTITLEMENT_SYNC` is now bound to the real
 * `BillingEntitlementSyncService` -- the sole writer of
 * `subscription_licenses` from the billing domain (imports that entity +
 * `Tenant`, read-only for cosmetic fields, directly here rather than
 * importing LicensingModule wholesale, keeping the one-way dependency:
 * billing writes the projection, it never imports/depends on
 * LicenseService/LicenseGuard/LICENSE_PROVIDER).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BillingQuote,
      BillingSubscription,
      BillingSubscriptionItem,
      BillingPayment,
      BillingPaymentIntent,
      BillingInvoice,
      BillingWebhookEvent,
      BillingSubscriptionChange,
      ModuleRegistry,
      SubscriptionLicense,
      Tenant,
    ]),
    AuditModule,
  ],
  controllers: [
    BillingCatalogController,
    BillingQuoteController,
    BillingSubscriptionController,
    BillingCheckoutController,
    BillingWebhookController,
    BillingInvoiceController,
    BillingPaymentController,
    BillingSubscriptionChangeController,
  ],
  providers: [
    ModuleCatalogService,
    SubscriptionPricingService,
    BillingQuoteService,
    BillingSubscriptionService,
    BillingInvoiceService,
    BillingPaymentService,
    BillingCheckoutService,
    BillingSubscriptionChangeService,
    WebhookProcessorService,
    PaymentConfirmedWorkflow,
    PaymentProviderRegistry,
    RazorpayPaymentProvider,
    BillingEntitlementSyncService,
    {
      provide: PAYMENT_PROVIDERS,
      useFactory: (razorpay: RazorpayPaymentProvider) => [razorpay],
      inject: [RazorpayPaymentProvider],
    },
    {
      provide: ENTITLEMENT_SYNC,
      useExisting: BillingEntitlementSyncService,
    },
  ],
  exports: [
    ModuleCatalogService,
    SubscriptionPricingService,
    BillingQuoteService,
    BillingSubscriptionService,
    PaymentProviderRegistry,
    BillingEntitlementSyncService,
  ],
})
export class BillingModule {}
