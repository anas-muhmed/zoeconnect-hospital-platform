/**
 * DI provider token constants (Phase 0 scaffolding — Hybrid Architecture roadmap).
 *
 * String tokens, matching this codebase's established convention (see
 * 'ISecretsProvider' previously inlined in platform-infrastructure.module.ts,
 * and 'THROTTLER_STORAGE' in redis.config.ts) rather than Symbols — a
 * repo-wide search found zero Symbol()-based DI tokens anywhere.
 *
 * Declared here to establish a single source of truth for these token
 * strings before any module binds a real implementation to them (Phase 2).
 * Only SECRETS_PROVIDER has a bound provider today (EnvironmentSecretsProvider,
 * in platform-infrastructure.module.ts) — the rest are unused until later
 * phases.
 */
export const SECRETS_PROVIDER = 'ISecretsProvider';
export const STORAGE_PROVIDER = 'IObjectStorageProvider';
export const ORACLE_TRANSPORT = 'IOracleTransport';
export const LICENSE_PROVIDER = 'ILicenseProvider';
export const NOTIFICATION_TRANSPORT = 'INotificationTransport';
// Phase 5 ("Notification Providers"): a higher-level, multi-channel
// abstraction (sendSms/sendWhatsApp/sendEmail/sendPush) that COMPOSES
// NOTIFICATION_TRANSPORT for the WhatsApp channel rather than replacing it
// -- see notification-provider.interface.ts's doc comment for the full
// layering rationale.
export const NOTIFICATION_PROVIDER = 'INotificationProvider';
