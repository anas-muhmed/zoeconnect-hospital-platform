import * as Joi from 'joi';

/**
 * Joi validation schema for all environment variables.
 * The app will refuse to start if any required variable is missing or invalid.
 * This catches mis-configured deployments at boot time rather than at runtime.
 */
export const envValidationSchema = Joi.object({
  // ── Application ─────────────────────────────────────────────────
  NODE_ENV:    Joi.string().valid('development', 'production', 'test').default('development'),
  PORT:        Joi.number().port().default(3001),
  API_PREFIX:  Joi.string().default('api'),
  API_VERSION: Joi.string().default('v1'),
  APP_NAME:    Joi.string().default('ZoeConnect'),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),
  ATTENDANCE_REALTIME_ENABLED: Joi.boolean().default(false),
  ATTENDANCE_POLL_INTERVAL_MS: Joi.number().min(5000).default(15000),
  // Hard floor: ATTLOGS punches before this date are never processed.
  // Accepts YYYY-MM-DD or ISO-8601. Empty = no floor.
  ATTENDANCE_PUNCH_START_DATE: Joi.string().optional().allow(''),
  ATTENDANCE_POLL_BATCH_SIZE: Joi.number().default(500),
  ATTENDANCE_LOOKBACK_MINUTES: Joi.number().default(120),
  ATTENDANCE_RECON_CRON: Joi.string().default('0 30 1 * * *'),
  ATTENDANCE_RECON_BATCH_SIZE: Joi.number().default(5000),


  // ── Deployment (Phase 0 scaffolding — reserved for future Hybrid
  //    Architecture use; not read by any code yet) ───────────────────
  DEPLOYMENT_MODE: Joi.string().valid('cloud', 'self_hosted').default('self_hosted'),

  // ── Cloud deployment (Phase 9) ───────────────────────────────────
  // Task 9.6: which role this process plays (see app.config.ts's
  // processRole doc comment). Default 'all' is self-hosted's existing
  // single-process behavior.
  PROCESS_ROLE:  Joi.string().valid('all', 'api', 'worker').default('all'),
  // Task 9.7: forces Winston's console transport on in production
  // (container deployments only -- see logger.util.ts's doc comment).
  LOG_TO_STDOUT: Joi.boolean().default(false),

  // ── Multi-tenancy activation (Phase 8, Task 8.7: cloud-mode CORS) ───
  // Base domain tenant subdomains live under in cloud mode (e.g.
  // "hdsp.example.com"). Required only when DEPLOYMENT_MODE is 'cloud';
  // self-hosted deployments never read this.
  CLOUD_BASE_DOMAIN: Joi.string().when('DEPLOYMENT_MODE', { is: 'cloud', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  // ZoeConnect Identity Architecture Migration, Phase 6: shared login URL
  // presented to every provisioned organization. Optional -- app.config.ts
  // falls back to the production https://zoeconnect.in/login constant.
  PUBLIC_LOGIN_URL: Joi.string().uri().optional(),
  WEBSITE_LOGIN_URL: Joi.string().uri().when('DEPLOYMENT_MODE', { is: 'cloud', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  APP_LOGIN_URL: Joi.string().uri().when('DEPLOYMENT_MODE', { is: 'cloud', then: Joi.required(), otherwise: Joi.optional().allow('') }),

  // ── Cloud Tenant Onboarding (see CLOUD_TENANT_ONBOARDING_DESIGN.md) ──
  // Shared secret Vendor Portal presents (via the X-Vendor-Portal-Api-Key
  // header) to call TenantProvisioningController before any tenant/user
  // exists to authenticate as -- see VendorPortalApiKeyGuard's doc comment
  // for why the existing SUPER_ADMIN-JWT path can't cover this caller.
  // Required only when DEPLOYMENT_MODE is 'cloud'; self-hosted never
  // exposes this endpoint to Vendor Portal at all (Section 3 of the
  // design doc -- self-hosted's onboarding flow is unrelated to this).
  VENDOR_PORTAL_API_KEY: Joi.string().when('DEPLOYMENT_MODE', { is: 'cloud', then: Joi.required(), otherwise: Joi.optional().allow('') }),

  // ── Multi-tenancy activation (Phase 8, Task 8.3: TenantScopeGuard) ──
  // Rollout mode for the token-tenantId vs. host-resolved-tenantId
  // cross-check. Default 'log-only' preserves every existing deployment's
  // request behavior exactly (mismatches are logged but never rejected);
  // 'enforced' actually throws ForbiddenException on a mismatch. See
  // TenantScopeGuard's doc comment for the full rollout rationale.
  //
  // ZoeConnect Identity Architecture Migration, Phase 5: TenantScopeGuard is
  // no longer registered (app.module.ts) and AuthService's widget-flow
  // equivalent (assertTenantScope()) is no longer called, so this env var
  // currently has no effect anywhere in the running application. Kept
  // (rather than removed) purely so an existing deployment's `.env` file
  // that already sets it doesn't fail Joi validation; safe to leave set or
  // unset either way.
  TENANT_SCOPE_GUARD_MODE: Joi.string().valid('log-only', 'enforced').default('log-only'),

  // ── Tenant-Scoped User Identity, Task 3 (login-flow redesign) ───────
  // Rollout mode for AuthService.login()'s username -> User resolution.
  // 'legacy' = pre-Task-3 behavior, byte-identical (single global lookup,
  // no tenant-aware query at all). 'shadow' (default) = the legacy lookup
  // stays authoritative, but a tenant-scoped lookup also runs in parallel
  // purely to log any disagreement (never rejects). 'enforced' = the
  // tenant-scoped lookup becomes authoritative; this is the mode Task 5's
  // composite unique constraints assume is already active. See
  // AuthService's LoginTenantScopeMode doc comment for full detail.
  LOGIN_TENANT_SCOPE_MODE: Joi.string().valid('legacy', 'shadow', 'enforced').default('shadow'),

  // ── ZoeConnect Identity Architecture Migration, Phase 3 ─────────────
  // Rollout mode for AuthService.login()'s identifier -> User resolution.
  // 'legacy' (default) preserves every existing deployment's login
  // behavior exactly -- LOGIN_TENANT_SCOPE_MODE above still governs the
  // username-only lookup, untouched. 'global' bypasses
  // LOGIN_TENANT_SCOPE_MODE entirely and does a single case-insensitive
  // lookup by username OR email, with no tenant/Host/subdomain
  // involvement at all. Only safe to flip to 'global' once Phase 4's
  // global-uniqueness migration has run in that environment -- before
  // that, the same username/email can legitimately exist in more than one
  // tenant, making a global lookup ambiguous. See AuthService's
  // getAuthIdentityMode()/resolveLoginUser() doc comments.
  AUTH_IDENTITY_MODE: Joi.string().valid('legacy', 'global').default('legacy'),

  // ── Object storage (Phase 3 "Storage Providers") ────────────────────
  // STORAGE_DRIVER selects the IObjectStorageProvider bound by StorageModule.
  // Default 'local' preserves every existing deployment's behavior exactly;
  // 's3' is opt-in only. The S3_* fields below are validated as required
  // only when STORAGE_DRIVER is actually 's3', so self-hosted/local
  // deployments never need to set them.
  STORAGE_DRIVER: Joi.string().valid('local', 's3').default('local'),
  S3_BUCKET:            Joi.string().when('STORAGE_DRIVER', { is: 's3', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  S3_REGION:            Joi.string().when('STORAGE_DRIVER', { is: 's3', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  S3_ACCESS_KEY_ID:     Joi.string().when('STORAGE_DRIVER', { is: 's3', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  S3_SECRET_ACCESS_KEY: Joi.string().when('STORAGE_DRIVER', { is: 's3', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  // Optional: only needed for S3-compatible endpoints (MinIO, R2, etc.);
  // leave unset to use AWS S3's default endpoint resolution.
  S3_ENDPOINT:          Joi.string().uri().optional().allow(''),
  S3_FORCE_PATH_STYLE:  Joi.boolean().default(false),

  // ── PostgreSQL ───────────────────────────────────────────────────
  DB_HOST:     Joi.string().required(),
  DB_PORT:     Joi.number().port().default(5432),
  DB_NAME:     Joi.string().required(),
  DB_USER:     Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_SSL:      Joi.boolean().default(false),
  DB_POOL_MIN: Joi.number().min(1).default(2),
  DB_POOL_MAX: Joi.number().min(2).default(20),
  DB_LOGGING:  Joi.boolean().default(false),

  // ── Oracle HIS (optional — platform degrades gracefully if absent) ──
  ORACLE_HOST:                 Joi.string().allow('').optional(),
  ORACLE_PORT:                 Joi.number().port().default(1521),
  ORACLE_SERVICE:              Joi.string().allow('').optional(),
  ORACLE_USER:                 Joi.string().allow('').optional(),
  ORACLE_PASSWORD:             Joi.string().allow('').optional(),
  ORACLE_POOL_MIN:             Joi.number().default(2),
  ORACLE_POOL_MAX:             Joi.number().default(20),
  ORACLE_POOL_INCREMENT:       Joi.number().default(2),
  ORACLE_CONNECT_TIMEOUT:      Joi.number().default(30),
  ORACLE_QUEUE_TIMEOUT:        Joi.number().default(60000),
  ORACLE_MODE:                 Joi.string().valid('thick', 'thin').default('thick'),
  // Reconciliation note (ZoeConnect vs. hybrid merge): restored .allow('') here —
  // hybrid's HEAD side had dropped it when Phase 7 added the fields below,
  // which would reject a legitimately empty value (e.g. 'thin' mode, which
  // needs no instant client path) at boot. ZoeConnect's side had the correct,
  // pre-existing validation; Phase 7's own fields are unaffected and kept.
  ORACLE_INSTANT_CLIENT_PATH:  Joi.string().allow('').optional(),
  // Tenant-scoped Oracle pools (OraclePoolManager, 2026-07-21, Phase 3):
  // idle-eviction timeout for a non-default tenant's pool. Self-hosted's
  // single default pool is unaffected/never evicted.
  ORACLE_TENANT_POOL_IDLE_TIMEOUT_MS: Joi.number().default(30 * 60 * 1000),
  // Phase 7 ("Cloud Oracle Transport", Task 7.2): selects the
  // IOracleTransport bound by HisConfigModule. Default 'direct' preserves
  // every existing deployment's behavior exactly (DirectOracleTransport,
  // wrapping OraclePoolService/OracleClient unchanged); 'cloud_relay' is
  // opt-in only, routes through a deployed Connector instance (Phase 6)
  // over the Message Transport, and is only exercised in a controlled,
  // non-production pilot as of Phase 7 (see PHASE_7_IMPLEMENTATION_PLAN.md).
  ORACLE_TRANSPORT:             Joi.string().valid('direct', 'cloud_relay').default('direct'),
  // Optional: full Redis URL for the Message Transport connection to the
  // Connector; defaults to REDIS_HOST/REDIS_PORT (the same Redis instance
  // the rest of the backend already uses) when unset.
  CONNECTOR_REDIS_URL:          Joi.string().optional().allow(''),
  CONNECTOR_REQUEST_TIMEOUT_MS: Joi.number().min(1000).default(30000),
  // Phase C ("Oracle execution path", 2026-07-21): selects which message
  // transport CloudOracleTransport dispatches through, independent of
  // ORACLE_TRANSPORT (which only selects direct-vs-cloud_relay). Default
  // 'redis' preserves the exact Phase 7 behavior (RedisMessageTransport,
  // untenanted, single shared Connector) for every deployment that hasn't
  // opted in; 'websocket' resolves the ambient tenant's registered
  // ConnectorInstance and dispatches through ConnectorGateway/
  // ConnectorJobDispatchService (see ADR_CONNECTOR_PROTOCOL.md §4). Only
  // meaningful when ORACLE_TRANSPORT=cloud_relay is also set.
  CLOUD_ORACLE_TRANSPORT_MODE:  Joi.string().valid('redis', 'websocket').default('redis'),

  // ── Redis ────────────────────────────────────────────────────────
  REDIS_HOST:      Joi.string().required(),
  REDIS_PORT:      Joi.number().port().default(6379),
  REDIS_PASSWORD:  Joi.string().optional().allow(''),
  REDIS_DB:        Joi.number().min(0).default(0),
  REDIS_CACHE_TTL: Joi.number().default(300),
  // Phase 9 (Task 9.3): required by AWS ElastiCache when
  // transit_encryption_enabled=true. Self-hosted Redis never sets this.
  REDIS_TLS:       Joi.boolean().default(false),

  // ── JWT ──────────────────────────────────────────────────────────
  JWT_SECRET:              Joi.string().min(32).required(),
  JWT_EXPIRES_IN:          Joi.string().default('15m'),
  JWT_REFRESH_SECRET:      Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN:  Joi.string().default('7d'),
  // ZoeConnect Connector auth (2026-07-21, Phase A) -- optional, falls back to
  // JWT_SECRET/JWT_REFRESH_SECRET above when unset (see jwt.config.ts).
  // Every real deployment planning to use the Connector should set these
  // to distinct values.
  JWT_CONNECTOR_SECRET:               Joi.string().min(32).optional(),
  JWT_CONNECTOR_EXPIRES_IN:           Joi.string().default('15m'),
  JWT_CONNECTOR_REFRESH_SECRET:       Joi.string().min(32).optional(),
  JWT_CONNECTOR_REFRESH_EXPIRES_IN:   Joi.string().default('30d'),

  // ── License ──────────────────────────────────────────────────────
  LICENSE_PUBLIC_KEY_PATH: Joi.string().default('./keys/license.public.pem'),
  LICENSE_TRIAL_DAYS:      Joi.number().min(1).default(30),
  // Cloud Licensing API (2026-07-29): LICENSE_PROVIDER binding is now
  // DERIVED FROM deployment.mode by default (see licenseProviderFactory()
  // in license.module.ts) -- this var is kept only as an explicit
  // escape-hatch override for testing/troubleshooting. Deliberately
  // `.optional()` with NO `.default()` (unlike every other var in this
  // file) so its absence is distinguishable from an explicit 'file'/
  // 'subscription' value -- licenseProviderFactory() reads it via
  // ConfigService and only treats it as an override when actually set.
  LICENSE_PROVIDER_MODE: Joi.string().valid('file', 'subscription').optional(),

  // ── Cloud Licensing API (2026-07-29) ────────────────────────────────
  // Grace-period window (days) SubscriptionLicenseProvider grants a
  // 'past_due' (lapsed Stripe payment) subscription past its
  // currentPeriodEnd before treating it as fully invalid. Mirrors
  // license.service.ts's own self-hosted GRACE_PERIOD_DAYS constant, kept
  // as a distinct config value rather than shared, since the two grace
  // windows protect different failure modes (expired signed license file
  // vs. lapsed subscription payment).
  SUBSCRIPTION_GRACE_PERIOD_DAYS: Joi.number().min(0).default(3),

  // ── Billing (ZoeConnect Subscription & Payment Gateway, Phase 2) ────
  // PAYMENT_PROVIDER selects the PaymentProvider implementation
  // billing.module.ts binds behind the provider-neutral PAYMENT_PROVIDER
  // DI token (see payments/payment-provider.interface.ts). 'razorpay' is
  // the only implementation as of Phase 3; the billing/subscription/
  // pricing services never read this var directly or branch on its
  // value -- only the provider factory does, so adding e.g. 'stripe'
  // later is a new adapter + one more case here, not a rewrite.
  PAYMENT_PROVIDER: Joi.string().valid('razorpay').default('razorpay'),
  // Percentage discount applied to the module+base amount when
  // billingCycle = YEARLY (e.g. 20 = pay for ~10 months instead of 12).
  BILLING_YEARLY_DISCOUNT_PERCENT: Joi.number().min(0).max(100).default(20),
  // GST/tax percentage applied on (base + module amount - discount).
  // 0 disables tax entirely (e.g. tax-exempt deployments) without any
  // code change.
  BILLING_TAX_PERCENT: Joi.number().min(0).max(100).default(18),
  // How long a server-generated quote (POST /billing/quote) stays
  // READY/consumable before BillingQuoteService treats it as EXPIRED.
  BILLING_QUOTE_TTL_MINUTES: Joi.number().min(1).default(30),
  BILLING_CURRENCY: Joi.string().default('INR'),

  // ── Razorpay (ZoeConnect Billing, Phase 3) ──────────────────────────
  // Intentionally optional even when PAYMENT_PROVIDER=razorpay (the
  // default) -- deploys can boot and go live before Razorpay secrets are
  // provisioned; the secrets get added to env later, post-launch, without
  // needing a code change. RazorpayPaymentProvider/razorpay.config.ts
  // already read these via ConfigService.get(..., '') fallbacks and never
  // throw at construction, so an empty value here just means billing
  // checkout calls will fail at request time (a clear runtime error) until
  // the real keys are set -- not a boot-time crash. Never logged, never
  // returned from any API response -- RAZORPAY_KEY_SECRET/
  // RAZORPAY_WEBHOOK_SECRET are server-only. RAZORPAY_KEY_ID is the sole
  // value the frontend receives (to open Razorpay Checkout).
  RAZORPAY_KEY_ID: Joi.string().optional().allow(''),
  RAZORPAY_KEY_SECRET: Joi.string().optional().allow(''),
  RAZORPAY_WEBHOOK_SECRET: Joi.string().optional().allow(''),
  RAZORPAY_API_BASE_URL: Joi.string().uri().default('https://api.razorpay.com/v1'),

  // ── Notification providers (Phase 5 "Notification Providers") ───────
  // NOTIFICATION_PROVIDER_MODE selects the INotificationProvider bound by
  // NotificationModule. Default 'local' preserves every existing
  // deployment's behavior exactly (WhatsApp live via Meta Cloud API,
  // SMS/Email stubbed -- unchanged from pre-Phase-5); 'cloud' is opt-in
  // only and additionally requires AWS SES/SNS credentials below.
  NOTIFICATION_PROVIDER_MODE: Joi.string().valid('local', 'cloud').default('local'),
  AWS_REGION:            Joi.string().when('NOTIFICATION_PROVIDER_MODE', { is: 'cloud', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  AWS_ACCESS_KEY_ID:     Joi.string().when('NOTIFICATION_PROVIDER_MODE', { is: 'cloud', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  AWS_SECRET_ACCESS_KEY: Joi.string().when('NOTIFICATION_PROVIDER_MODE', { is: 'cloud', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  SES_FROM_EMAIL:        Joi.string().when('NOTIFICATION_PROVIDER_MODE', { is: 'cloud', then: Joi.required(), otherwise: Joi.optional().allow('') }),
  // Optional: SNS's alphanumeric sender ID shown on SMS (not supported in
  // every country/carrier -- left optional, SNS falls back to a default
  // origination number/short code when unset).
  SNS_SENDER_ID:         Joi.string().optional().allow(''),

  // ── Rate limiting ────────────────────────────────────────────────
  THROTTLE_TTL:          Joi.number().default(60000),
  THROTTLE_LIMIT:        Joi.number().default(100),
  LOGIN_THROTTLE_TTL:    Joi.number().default(60000),
  LOGIN_THROTTLE_LIMIT:  Joi.number().default(5),

  // ── WhatsApp ─────────────────────────────────────────────────────
  WHATSAPP_ACCESS_TOKEN:    Joi.string().optional().allow(''),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string().optional().allow(''),
  WHATSAPP_API_VERSION:     Joi.string().default('v18.0'),
  WHATSAPP_ENABLED:         Joi.boolean().default(false),

  // ── Reporting ────────────────────────────────────────────────────
  POINT_VALUE_INR: Joi.number().min(0).default(0.25),

  // ── Logging ──────────────────────────────────────────────────────
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'verbose').default('info'),
  LOG_DIR:   Joi.string().default('./logs'),

  // ── Provisioning ──────────────────────────────────────────────────
  PROVISIONING_SECRET: Joi.string().optional().allow(''),

  // ── Backup & Restore (backup.config.ts) ─────────────────────────────
  BACKUP_DEFAULT_STORAGE_DRIVER: Joi.string()
    .valid('local', 's3', 'azure', 'gcs', 'sftp', 'network_share')
    .default('local'),
  BACKUP_LOCAL_DIR: Joi.string().optional().allow(''),
  BACKUP_REQUIRE_PERSISTENT_LOCAL_DIR: Joi.boolean().default(true),
  BACKUP_RETENTION_COUNT: Joi.number().min(1).default(30),
  BACKUP_RETENTION_DAYS: Joi.number().min(1).default(90),
  BACKUP_COMPRESSION_ENABLED: Joi.boolean().default(true),
  // Required only when encryption is actually turned on -- self-hosted
  // installs that never enable it are unaffected, same `.when()` pattern
  // used for STORAGE_DRIVER=s3's S3_* fields above.
  BACKUP_ENCRYPTION_ENABLED: Joi.boolean().default(false),
  BACKUP_ENCRYPTION_PASSPHRASE: Joi.string().min(8).when('BACKUP_ENCRYPTION_ENABLED', {
    is: true, then: Joi.required(), otherwise: Joi.optional().allow(''),
  }),
  BACKUP_INCLUDE_ENV_VARS: Joi.boolean().default(false),
  PG_DUMP_PATH: Joi.string().default('pg_dump'),
  PG_RESTORE_PATH: Joi.string().default('pg_restore'),
  BACKUP_PG_DUMP_TIMEOUT_MS: Joi.number().min(0).optional(),
  APP_VERSION: Joi.string().optional().allow(''),
  BACKUP_MIN_COMPATIBLE_APP_VERSION: Joi.string().default('1.0.0'),
  BACKUP_CRON_TIMEZONE: Joi.string().default('UTC'),
}).options({ allowUnknown: true }); // allow OS/CI variables we don't own
