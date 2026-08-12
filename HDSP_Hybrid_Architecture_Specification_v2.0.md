# HDSP Hybrid Architecture Specification v2.0

**Status:** Reference specification — binding for all new module development
**Supersedes:** Informal conventions established across the existing 110-entity / 65-controller / 146-service backend
**Companions:** *HDSP Cloud Migration Architecture Review* (v1.0, codebase audit) and *HDSP Hybrid Deployment Architecture Review* (v1.0, cloud+self-hosted redesign) — this document formalizes and extends both into the standing architectural contract for HDSP.

---

## 0. Purpose

This document exists so that every future module — written by any engineer, at any point in HDSP's lifetime — is built the same way, without re-deriving these decisions from first principles. It answers one question for every new piece of work: *where does this code belong, and what is it allowed to depend on?*

HDSP is one codebase, one product, and one release train that runs in two deployment modes (cloud multi-tenant SaaS, self-hosted on-premise) without forking. That is not a migration project with an end date — it is the permanent shape of the platform. This specification is what keeps it that way.

---

## 1. Core Architecture Principles

1. **One codebase, two deployment modes.** There is no `hdsp-cloud` branch and no `hdsp-onprem` branch. `DEPLOYMENT_MODE` (`cloud | self_hosted`) is a bootstrap-time configuration value, resolved exactly once, that selects which infrastructure providers are wired into the DI container. It is never read anywhere else.
2. **Infrastructure is abstracted; business logic is not.** Business logic must be identical in both deployment modes. If a behavior needs to differ by mode, the difference belongs in an infrastructure provider, not in an `if`.
3. **Tenant-first design, even with one tenant.** Every persisted, tenant-relevant row carries a `tenant_id`. Self-hosted installs are not "tenant-less" — they are single-tenant, with exactly one `Tenant` row (`id: 'default'`). This is what keeps query and service code identical across both modes (Section 6).
4. **Three-layer separation: Business → Platform → Infrastructure** (Section 2). Dependencies only ever point downward. A Business-layer module may depend on Platform and Infrastructure abstractions; it may never depend on a concrete Infrastructure implementation, and Platform must never depend on Business.
5. **Providers are extension points, not one-off abstractions.** Every infrastructure interface (`IObjectStorageProvider`, `IOracleTransport`, `ILicenseProvider`, `INotificationTransport`, `ISecretsProvider`, and future ones) is designed to accept more than two implementations. Two is the number needed today (cloud/self-hosted); the interface contract must not assume it will always be two (Section 9).
6. **License gates modules; feature flags gate behavior within modules.** These are two different mechanisms with two different lifecycles and must not be collapsed into one (Section 8).
7. **The Connector is a first-class HDSP component**, versioned and released alongside Backend, Frontend, and Vendor Portal — not a side project bolted onto the HIS module (Section 7).
8. **Never build a feature twice.** If a capability is needed in both deployment modes, it is built once behind an interface. Duplicating a feature per deployment mode is treated as an architecture defect, not a shortcut.

---

## 2. The Three-Layer Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  BUSINESS LAYER                                                   │
│  Hospital-facing domain modules. Own their entities, own their    │
│  rules. Never talk to infrastructure directly.                    │
│                                                                     │
│  Token · Attendance · CMS · Feedback · Document Platform (Forms)  │
│  · Loyalty · EIC                                                   │
└───────────────────────────────┬─────────────────────────────────┘
                                  │ depends on (interfaces only)
┌───────────────────────────────▼─────────────────────────────────┐
│  PLATFORM LAYER                                                    │
│  Cross-cutting capabilities shared by every Business module.       │
│  Owns cross-module policy (who can act, what's licensed, what's    │
│  logged) and exposes facades that Business modules call.           │
│                                                                     │
│  Tenant · RBAC · Users/Auth · Settings · Audit · Licensing ·       │
│  Feature Flags · Notifications · Scheduler/Queue Orchestration ·   │
│  Workflow · AI Platform · Connector Management · Tenant            │
│  Provisioning                                                       │
└───────────────────────────────┬─────────────────────────────────┘
                                  │ depends on (interfaces only)
┌───────────────────────────────▼─────────────────────────────────┐
│  INFRASTRUCTURE LAYER                                              │
│  Implementation details. Every box here has ≥2 concrete            │
│  implementations selected at bootstrap by DEPLOYMENT_MODE, and     │
│  is designed to accept more without touching layers above it.      │
│                                                                     │
│  Oracle Transport · PostgreSQL · Redis/Cache · Object Storage ·    │
│  Email · SMS/WhatsApp · Secrets · Auth Providers (future: LDAP/    │
│  SAML/OIDC/Azure AD)                                                │
└──────────────────────────────────────────────────────────────────┘
```

**Dependency rule (enforced, not aspirational — see Section 10):** an import may only point downward. Business → Platform is allowed. Platform → Infrastructure is allowed (via interface, never a concrete class). Business → Infrastructure directly is **forbidden**. Infrastructure → Platform or Infrastructure → Business is **forbidden**. Platform → Business is **forbidden** (Platform modules like RBAC or Audit must stay ignorant of what Token or CMS actually do).

**Mapping of existing modules onto the three layers** (as a migration reference — no module needs to physically move directories to comply, but new code must respect the boundary):

| Layer | Existing modules (unchanged business logic) |
|---|---|
| Business | `token`, `attendance`, `cms`, `feedback`, `document-platform`, `loyalty`, `eic` |
| Platform | `rbac`, `settings`, `audit`, `licensing`, `notifications`, `users`, `auth`, `branch` (an in-hospital location concept, sits alongside Tenant), `platform` (AI-platform subtree, object-repository facade), `his` (the *management/business-rule* half — schema config, sync orchestration; the *transport* half moves to Infrastructure per Section 7) |
| Infrastructure | Oracle transport implementations, TypeORM/Postgres, `RedisProvider`, object storage providers, `WhatsAppService`/notification transports, `EnvironmentSecretsProvider`/cloud secrets providers |

---

## 3. Dependency Rules (Binding)

1. **A Business module never imports a concrete Infrastructure class.** `CmsMediaController` may depend on `ObjectRepositoryService` (a Platform-layer facade); it may never `import { S3StorageProvider }`.
2. **A Business module never imports another Business module's internals.** Cross-domain needs (e.g., Loyalty needing HIS bill data) go through a Platform-layer facade or a documented service export, never a direct entity/repository reach-across.
3. **Platform modules expose facades, not raw provider access.** `ObjectRepositoryService`, `NotificationService`, `LicenseService`/`ILicenseProvider` consumers, `AuditService` — these are the only things a Business module is allowed to inject for cross-cutting concerns.
4. **Infrastructure providers implement interfaces owned by Platform or a dedicated Infrastructure contracts package**, never the reverse — the interface is the contract, the provider is replaceable.
5. **`DEPLOYMENT_MODE` is read in exactly one place per interface: the Dynamic Module's factory function.** No controller, service, guard, or processor may read `process.env.DEPLOYMENT_MODE` or the `deployment.mode` config key. This is the single rule from this specification most likely to be violated under deadline pressure — treat any PR that adds a new read site for `DEPLOYMENT_MODE` as a required architecture review, not a routine change.
6. **New infrastructure dependencies are added to `backend/src/infrastructure/`, never inline in a Business or Platform module.** See Section 4.

---

## 4. The Infrastructure Module

Formalizing what the prior review described as scattered providers into one location with a consistent shape:

```
backend/src/infrastructure/
    storage/
        storage-provider.interface.ts       (IObjectStorageProvider — already exists,
                                              relocate from platform/services/object-repository)
        local-storage.provider.ts
        s3-storage.provider.ts
        azure-blob-storage.provider.ts       (future — Section 9)
        storage.module.ts                    (StorageModule.forRoot())
    oracle/
        oracle-transport.interface.ts        (IOracleTransport — new, Section 7)
        direct-oracle.transport.ts           (wraps existing OraclePoolService)
        cloud-oracle.transport.ts            (queue-relay client)
        oracle.module.ts
    licensing/
        license-provider.interface.ts        (ILicenseProvider — new, Section 8)
        file-license.provider.ts             (wraps existing LicenseService)
        subscription-license.provider.ts
        licensing-infra.module.ts
    notifications/
        notification-transport.interface.ts  (INotificationTransport — new)
        whatsapp.transport.ts                (wraps existing WhatsAppService)
        twilio.transport.ts                  (future)
        msg91.transport.ts                   (future)
        firebase.transport.ts                (future)
        notification-infra.module.ts
    email/
        email-provider.interface.ts          (new — currently a gap, see prior review §5)
        smtp.provider.ts
        ses.provider.ts                      (future)
    sms/
        (folds into notifications/ transport list above, kept as a
         separate directory only if SMS-specific logic — e.g. OTP
         formatting — grows large enough to warrant it)
    cache/
        redis.provider.ts                    (relocate from common/redis/,
                                              parameterized key-prefix helper
                                              — tenant segment, Section 6)
    secrets/
        secrets-provider.interface.ts        (ISecretsProvider — already exists,
                                              relocate from platform/infrastructure/secrets)
        environment-secrets.provider.ts       (already exists)
        aws-secrets-manager.provider.ts       (future)
        azure-keyvault.provider.ts            (future)
    auth-providers/                           (future extension point, Section 9)
        auth-provider.interface.ts
        local.provider.ts                     (today's username/password + JWT)
        ldap.provider.ts
        saml.provider.ts
        oidc.provider.ts
        azure-ad.provider.ts
```

**Rule:** Business and Platform modules import only from the `*.module.ts` / `*.interface.ts` files above (via NestJS DI tokens), never from a concrete `*.provider.ts`/`*.transport.ts` file directly. This is what makes "Business modules never import concrete infrastructure classes" (Section 3, rule 1) mechanically checkable — a lint rule can simply forbid any import path matching `infrastructure/**/*.provider.ts` or `infrastructure/**/*.transport.ts` from outside `infrastructure/` and the module's own DI wiring.

Each subdirectory's `*.module.ts` exports one `.forRoot()` Dynamic Module using the factory pattern established in the prior review's Section 4 — one consistent shape across all seven (soon more) infrastructure categories, so a new engineer who has read one of these modules already knows how to read all the others.

---

## 5. Deployment Modes

```ts
// backend/src/config/deployment.config.ts
export const deploymentConfig = registerAs('deployment', () => ({
  mode: (process.env.DEPLOYMENT_MODE || 'self_hosted') as 'cloud' | 'self_hosted',
}));
```

| Mode | Who runs it | Oracle transport | Storage | Licensing | Tenant count |
|---|---|---|---|---|---|
| `cloud` | HDSP (managed) | `CloudOracleTransport` (queue relay to hospital Connector) | `S3StorageProvider` | `SubscriptionLicenseProvider` | N (real multi-tenant) |
| `self_hosted` | Hospital IT | `DirectOracleTransport` | `LocalStorageProvider` (or opt-in `S3StorageProvider` pointed at the hospital's own bucket) | `FileLicenseProvider` | 1 (`'default'`) |

Selection happens exclusively inside each Infrastructure module's `.forRoot()` factory (Section 4), following the pattern already established for `TypeOrmModule.forRootAsync`/`BullModule.forRootAsync` in `app.module.ts`. No other file in the codebase branches on deployment mode except the two narrow, boot-time-only exceptions already identified in the prior review (static-mount registration and the CORS allowlist in `main.ts`) — both remain confined to bootstrap code, never business logic.

---

## 6. Tenant Model

**Every self-hosted install has exactly one `Tenant` row**, seeded during installation (`id: 'default'`, `name` populated from the hospital's own registration data). Every cloud install has one `Tenant` row per hospital customer.

```
Tenant
  id            uuid (or 'default' literal for self-hosted's single row)
  name           string
  subdomain      string, nullable in self-hosted (unused there)
  status         enum (active | suspended | trial)
  createdAt
```

**Consequence for every other entity:** all ~107 currently-unscoped entities (per the prior review's audit) carry a `tenant_id` FK, `NOT NULL`, indexed. Queries are always `WHERE tenant_id = :tenantId` — in self-hosted, `:tenantId` resolves once at startup to `'default'` and is injected via the same request-context mechanism cloud uses to resolve it from a subdomain. **There is no code path where a query is unconditionally global** — this is what eliminates the two-code-paths problem the prior review flagged as the central risk of a naive hybrid design.

Composite uniqueness constraints move from single-column to `(tenant_id, column)`: `users.username`, `users.email`, `system_settings.setting_key`, `his_schema_configs.config_key`, `token_branch_config.branch_id`, `license_master.license_key`.

`branch` remains a distinct, subordinate concept — a location/department *within* a tenant (unchanged from today's HIS-`orgstructure`-sourced model) — never conflated with `tenant`.

---

## 7. Oracle Connector Architecture

### 7.1 Principle: the Connector is generic infrastructure, not a HIS-attendance-specific tool

The prior review's design reused `OraclePoolService` wholesale as both business logic and transport. This specification **splits that responsibility**:

```
┌───────────────────────────────────────────────────────────┐
│  Connector (standalone HDSP component, own release cycle)   │
│                                                                │
│  ┌───────────────┐   ┌──────────────────┐   ┌─────────────┐ │
│  │ Oracle Client   │──►│ Message Transport │──►│ Cloud       │ │
│  │ (raw oracledb   │   │ (queue publish/    │   │ Backend     │ │
│  │  pool + circuit  │   │  subscribe, auth,   │   │             │ │
│  │  breaker — the   │   │  retry, correlation) │   │             │ │
│  │  existing         │   │                      │   │             │ │
│  │  OraclePoolService│   │                      │   │             │ │
│  │  body, relocated) │   │                      │   │             │ │
│  └───────────────┘   └──────────────────┘   └─────────────┘ │
└───────────────────────────────────────────────────────────┘
```

The Connector's Oracle Client knows **only**: "execute this SQL template against Oracle, return rows or an execute result." It has no knowledge of Attendance, Loyalty, Token, CMS, or Feedback. All domain-specific query construction (which columns map to which HIS schema, how a punch event is interpreted, how a bill line becomes a loyalty transaction) **stays in the HDSP backend's Platform-layer `his` module**, exactly where it lives today — it is sent to the Connector as a parameterized query request, not embedded inside the Connector.

This split matters because it makes the Connector reusable beyond today's known use cases (attendance, billing, patient lookup, token print records) — any future module needing Oracle access gets it for free, without the Connector needing a new release.

### 7.2 Connector responsibilities (exhaustive — nothing more)

- Maintain a local Oracle connection pool (today's `OraclePoolService` logic: pool sizing, circuit breaker, `reconfigure()` hot-swap on credential change).
- Accept an inbound job from the Message Transport: `{ correlationId, sqlTemplateId, binds }` — never raw ad hoc SQL strings, so the Connector can enforce an allow-list of known query templates and refuse anything else (a security boundary, not just an implementation detail).
- Execute against Oracle, return `{ correlationId, rows | rowsAffected | error }` over the same outbound-only channel.
- Report its own health/connectivity status upstream (extends the existing `common/health/oracle.health.ts` pattern).
- Nothing else. It does not know what a "punch" or a "bill" is.

### 7.3 IOracleTransport interface (Platform/Infrastructure boundary, inside the HDSP backend)

```ts
export interface IOracleTransport {
  query<T>(sqlTemplateId: string, binds?: Record<string, unknown>): Promise<T[]>;
  execute(sqlTemplateId: string, binds?: Record<string, unknown>): Promise<{ rowsAffected: number }>;
  isAvailable(): boolean;
}
```

- `DirectOracleTransport` (self-hosted): calls the Oracle Client directly, in-process — no Message Transport hop at all, since backend and Oracle share a network. This is the *simplification*, not the general case: in self-hosted mode, the Connector's Oracle Client code runs embedded in the backend process rather than as a separate service, because there is no cloud/on-prem boundary to cross.
- `CloudOracleTransport` (cloud): publishes to the Message Transport, awaits the correlated response from the hospital's deployed Connector instance.

### 7.4 The Connector as an official HDSP component

```
HDSP
├── backend/            (NestJS API + workers)
├── frontend/            (Next.js)
├── connector/            (new — standalone deployable, self-hosted's Oracle
│                          Client + Message Transport, used only in cloud
│                          mode; in self-hosted mode this code still exists
│                          as a shared package but runs embedded, per §7.3)
└── vendor-portal/        (existing)
```

Benefits, as identified by the product owner and adopted here:
- **Same versioning** — the Connector ships with a version number tracked against backend compatibility (e.g., "Connector v1.x is compatible with Backend v1.y+"), the same discipline any hospital-integration vendor already needs.
- **Same release cycle** — Connector releases go through the same CI pipeline (Section 11) as backend/frontend, not an ad hoc side build.
- **Same installer** — the self-hosted installer (Section 11) and a future cloud-tenant onboarding flow (Section 8) both provision the Connector the same way, differing only in *where* it runs (embedded vs. standalone at the hospital).
- **Easier support** — one place to look up "which Connector version is this hospital running," one compatibility matrix, one changelog.

---

## 8. Platform Services: Tenant Provisioning and Feature Flags

### 8.1 Tenant Provisioning Service

A dedicated Platform-layer service (not folded into `LicensingModule` or `AuthModule`) responsible for turning "create a new cloud hospital customer" into a deterministic, resumable pipeline:

```
TenantProvisioningService.provision(request)
  1. Create Tenant row (id, name, subdomain)
  2. Generate/validate subdomain uniqueness → hospitalA.hdsp.com
  3. Seed default Roles (SUPER_ADMIN, ADMIN, ...) scoped to tenant_id
  4. Seed default Permissions / role-permission mappings
  5. Seed default Settings rows (system_settings, cms_settings,
     feedback_settings) scoped to tenant_id, from platform-wide templates
  6. Create tenant's storage namespace/prefix (object storage — no bucket
     creation needed in the shared-bucket model, just the key prefix
     convention; a dedicated bucket only for enterprise-tier isolated
     tenants, Section 9)
  7. Generate Connector pairing key/credential (used by the hospital's
     deployed Connector instance to authenticate to the Message Transport)
  8. Issue initial License (via SubscriptionLicenseProvider — starts in
     trial status per existing trial-mode semantics)
  9. Create initial SUPER_ADMIN user for the tenant
  10. Emit TenantProvisioned event (for downstream welcome-email/
      onboarding-checklist consumers)
  → Ready
```

Each step is idempotent and independently retryable — provisioning is a workflow, not a single transaction, and should be built on the existing Workflow-engine primitives already present in `document-platform` rather than inventing a second workflow mechanism. Failure at any step must leave the tenant in a clearly-flagged incomplete state, never a half-provisioned tenant silently exposed to login attempts.

**Self-hosted equivalent:** the installer (Section 11) runs a reduced version of the same pipeline (skip subdomain generation, skip Connector-pairing-key generation since the Connector runs embedded, use `FileLicenseProvider` instead of step 8's subscription call) — same service, same steps where applicable, confirming again that Business/Platform logic doesn't fork between modes, only the Infrastructure calls inside a couple of steps do.

### 8.2 Feature Flags — a layer distinct from Licensing

```
License  →  gates whole Modules (today's @RequireModule('ATTENDANCE'), coarse, per-module boolean)
   │
   ▼
Features →  gates behavior *within* a licensed module (new)
   │
   ▼
Modules  →  CMS, Token, Attendance, Feedback, Loyalty, EIC, Forms
```

Example state a tenant might be in:
```
CMS          → License: enabled     Feature: scrolling-ticker = on, emergency-broadcast = on
Token        → License: enabled     Feature: kiosk-analytics = on
Attendance   → License: disabled    (features irrelevant — module gate wins)
AI Assistant → License: enabled     Feature: ai-assistant = beta (visible only to opted-in tenants)
```

Design: a `FeatureFlag` entity (`tenant_id`, `feature_key`, `state: enabled|disabled|beta`, optional `rolloutPercentage` for gradual rollout) plus a `FeatureFlagService.isEnabled(tenantId, featureKey)` facade, cached in Redis identically to today's `LicenseService.getStatus()` pattern (short TTL, cache-busted on change). `LicenseGuard`/`@RequireModule()` remains the coarse module gate (unchanged, per the prior review); a new `@RequireFeature('cms.emergency-broadcast')` decorator/guard sits underneath it for finer control. This directly serves trials ("enable Attendance for 14 days without a full module license"), beta programs (AI Assistant), and future enterprise-tier differentiation (e.g., "advanced analytics" as a feature flag rather than a whole new licensed module) — flexibility the current coarse module-boolean licensing model cannot provide on its own.

Both layers ultimately live in the Platform layer and are consumed by Business modules only through their respective guards/decorators — a Business module never queries `FeatureFlag`/`License` tables directly.

---

## 9. Provider Architecture as an Extension Platform

Every Infrastructure interface in Section 4 is designed for **N implementations, not 2** — cloud and self-hosted are today's two, not a hardcoded ceiling. This is what turns the hybrid architecture into a genuine platform capability rather than a one-time migration trick.

| Interface | Today | Designed extension points |
|---|---|---|
| `IObjectStorageProvider` | Local, S3 | Azure Blob, Cloudflare R2, Google Cloud Storage, MinIO (self-hosted opt-in) |
| `INotificationTransport` | WhatsApp Cloud API | Twilio, MSG91, Firebase Cloud Messaging, SMTP-based email |
| `ISecretsProvider` | Environment | AWS Secrets Manager, Azure Key Vault, HashiCorp Vault |
| `IOracleTransport` | Direct, Cloud-relay | (Naturally bounded at 2 — Oracle is the fixed HIS target; extension here means transport hardening, e.g. a WebSocket variant alongside the queue variant, not new *databases*) |
| `ILicenseProvider` | File-based, Subscription | Reseller/channel-partner licensing model (future), usage-based billing variant |
| **`IAuthProvider`** (new, Section 4) | Local (username/password + JWT) | LDAP, SAML, OIDC, Azure AD — enterprise hospitals frequently require SSO integration; this is a concrete, foreseeable near-term need, not speculative |

**Governance for adding a new provider:** implement the existing interface (no interface changes unless a genuine new capability is required, in which case the interface change must be backward-compatible with existing providers), register it in the relevant `*.module.ts` factory's mode-selection logic (which may grow from a binary switch to a small registry keyed by a config value, e.g. `STORAGE_DRIVER=s3|azure-blob|local|minio`), and add it to the CI provider-conformance test suite (Section 10, rule 3) so it's held to the same contract tests as every other provider. No Business or Platform code changes.

This is what the product owner's "marketplace vision" concretely becomes in this architecture: adding a new storage backend, notification channel, or auth provider is a self-contained Infrastructure-layer addition, reviewable and shippable independently of the Business-layer release cadence.

---

## 10. Coding Guidelines for Future Modules

1. **Decide the layer before writing the first line.** Is this hospital-facing domain logic (Business)? A cross-cutting capability many Business modules will need (Platform)? A way of reaching an external system or storage medium (Infrastructure)? If it's genuinely unclear, default to Platform and narrow later — it's easier to specialize a Platform service into a Business one than to retrofit infrastructure abstraction after the fact.
2. **New infrastructure dependency → new `infrastructure/<category>/` subdirectory**, following the shape in Section 4 (interface, ≥1 provider today, `.forRoot()` module) — even if only one provider exists at first (e.g., a new email provider might launch with only SMTP). The interface is written for eventual multiplicity from day one; do not defer the interface until "we actually need a second provider."
3. **Every provider ships with a conformance test suite run against every implementation in CI**, not just the one relevant to the current deployment mode. Use MinIO as the CI stand-in for S3-compatible testing, a local SMTP test server for email, etc.
4. **`DEPLOYMENT_MODE` reads are a reviewed, allow-listed set of files.** A CI check (grep-based is sufficient to start) fails the build if a new file outside that allow-list reads `process.env.DEPLOYMENT_MODE` or `config.get('deployment.mode')`.
5. **Every new entity gets `tenant_id` from day one.** There is no "add tenant scoping later" — Section 6 makes this a day-one requirement for all new Business and Platform entities, not a retrofit.
6. **License gates the module; Feature Flags gate the behavior.** A new module is licensable (`@RequireModule`); optional/experimental behavior within it is a feature flag (`@RequireFeature`), never a second license SKU for a sub-capability.
7. **Cross-domain calls go through a Platform facade, documented in that Platform module's public API** (its `index.ts`/exported service), never through a direct import of another Business module's internal service or repository.
8. **The Connector never gains domain knowledge.** If a new Business module needs Oracle data, it defines a new SQL template registered with the Connector's allow-list and consumes it through `IOracleTransport` — it does not add Attendance/Loyalty/Token-specific logic to the Connector codebase.
9. **New self-hosted-only or cloud-only features are a smell, not a pattern.** If a genuine requirement only makes sense in one mode (e.g., "generate an offline license file" truly only applies to self-hosted), it is acceptable, but it must be justified explicitly in the PR description and reviewed as an intentional, narrow exception — not the default way of building anything.
10. **Read this document, and the two companion reviews it supersedes into a living contract, before proposing an architectural deviation.** If a new requirement seems to require breaking one of these rules, that is a signal to update this specification deliberately (with the reasoning recorded), not to quietly work around it in one module.

---

## 11. CI/CD and Release Strategy

One pipeline, three release artifacts (Backend/Worker/Frontend images, the Connector package, and the self-hosted installer bundle), all versioned together:

```
GitHub (single repo)
   │
   ▼
CI — build shared packages (form-schema, canvas-engine, canvas-engine-react,
     form-renderer-react) → lint → unit tests → provider-conformance tests
     (Section 10, rule 3) → E2E smoke tests
   │
   ▼
Build — produces versioned, deployment-mode-agnostic container images:
     hdsp-api:<sha>, hdsp-worker:<sha>, hdsp-frontend:<sha>, hdsp-connector:<sha>
     (DEPLOYMENT_MODE is a runtime env var, never baked into an image —
      this applies to the Connector too: the same connector image runs
      standalone at a hospital in cloud mode, or is imported as an embedded
      package in a self-hosted build)
   │
   ├──► Push to ECR → ECS deploy (cloud target: api, worker, frontend
   │     services; Connector images distributed to hospital-side agents
   │     via the pairing mechanism from Section 8.1 step 7)
   │
   └──► Package → self-hosted release artifact:
        - docker-compose.selfhosted.yml (Postgres, Redis, backend, frontend
          — Connector runs embedded, no separate container needed)
        - Automated installer script (extends today's manual DEPLOY.md
          runbook: pulls images, runs TenantProvisioningService's reduced
          self-hosted pipeline, writes .env from template, starts stack)
        - Published as a versioned GitHub Release, hospital IT controls
          upgrade timing independently of cloud's continuous-deploy cadence
```

**Versioning discipline:** Backend, Frontend, and Connector each carry independent semantic versions, with a published compatibility matrix (e.g., Connector v1.2+ requires Backend v1.5+) — the same discipline the Connector's "official component" status (Section 7.4) implies. Self-hosted customers are supported on a rolling N-2 version window; cloud always runs the latest.

---

## 12. Summary Diagram

```
                     ┌─────────────────────────────┐
                     │      BUSINESS LAYER           │
                     │ Token, Attendance, CMS,        │
                     │ Feedback, Forms, Loyalty, EIC   │
                     └───────────────┬────────────────┘
                                      │ interfaces/facades only
                     ┌───────────────▼────────────────┐
                     │      PLATFORM LAYER              │
                     │ Tenant · RBAC · Auth · Settings   │
                     │ Audit · Licensing · Feature Flags  │
                     │ Notifications · Scheduler ·         │
                     │ Workflow · AI · Connector Mgmt ·     │
                     │ Tenant Provisioning                   │
                     └───────────────┬────────────────────┘
                                      │ interfaces only
                     ┌───────────────▼────────────────────┐
                     │      INFRASTRUCTURE LAYER              │
                     │ backend/src/infrastructure/              │
                     │  storage/ oracle/ licensing/ notifications/│
                     │  email/ cache/ secrets/ auth-providers/     │
                     └───────────────┬────────────────────────┘
                                      │ selected by DEPLOYMENT_MODE
                                      │ at bootstrap, once
              ┌───────────────────────┴────────────────────────┐
              ▼                                                   ▼
        cloud providers                                  self_hosted providers
   (S3, CloudOracleTransport,                        (Local disk, DirectOracleTransport,
    SubscriptionLicenseProvider,                       FileLicenseProvider, embedded
    standalone Connector, N tenants)                    Connector, 1 tenant = 'default')
```

---

This specification, together with the two companion reviews, is the reference for all HDSP architectural decisions going forward. New modules are built against it directly; deviations are deliberate, documented, and reviewed — not accidental.
