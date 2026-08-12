import { Inject, Injectable, InternalServerErrorException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider } from './payment-provider.interface';
import { PAYMENT_PROVIDERS } from './payment-provider.tokens';

/**
 * ZoeConnect Billing -- provider registry (refinement requested before
 * Phase 3). Nothing in the billing/subscription domain injects a
 * concrete PaymentProvider (e.g. RazorpayPaymentProvider) directly;
 * everything goes through `PaymentProviderRegistry.getActiveProvider()`,
 * which resolves `billing.provider` (env `PAYMENT_PROVIDER`) to a
 * registered implementation.
 *
 * Providers register themselves via DI: any module can contribute to the
 * multi-provider token `PAYMENT_PROVIDERS` (see payment-provider.tokens.ts)
 * with a `useFactory` returning `PaymentProvider[]`; this class just
 * flattens whatever was injected into a name-keyed map. Adding Stripe
 * later means adding one more provider to that array -- no change here.
 */
@Injectable()
export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>();

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(PAYMENT_PROVIDERS) injected: PaymentProvider[] = [],
  ) {
    for (const provider of injected ?? []) {
      this.providers.set(provider.name, provider);
    }
  }

  register(provider: PaymentProvider): void {
    this.providers.set(provider.name, provider);
  }

  getProvider(name: string): PaymentProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new InternalServerErrorException(`No PaymentProvider registered for '${name}'`);
    }
    return provider;
  }

  /** Resolves `billing.provider` (PAYMENT_PROVIDER env var) to its registered implementation. This is what checkout/webhook services call -- never getProvider('razorpay') hardcoded. */
  getActiveProvider(): PaymentProvider {
    const name = this.config.get<string>('billing.provider', 'razorpay');
    return this.getProvider(name);
  }
}
