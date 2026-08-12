/**
 * DI token a module contributes an array of PaymentProvider
 * implementations to (NestJS multi-provider pattern -- multiple modules
 * can each provide one entry, all collected into a single injected
 * array). PaymentProviderRegistry is the sole consumer; nothing else
 * should inject this token directly. See payment-provider.registry.ts.
 */
export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');
