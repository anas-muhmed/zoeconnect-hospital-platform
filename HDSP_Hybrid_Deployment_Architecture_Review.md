# HDSP Hybrid Deployment Architecture Review (Cloud + Self-Hosted)

**Scope:** Redesign of the prior cloud-only SaaS migration plan into a hybrid architecture — one codebase, one product, two deployment modes (`cloud` multi-tenant SaaS and `self_hosted` on-premise, per hospital). Builds directly on the codebase inspection from the previous review (`backend/src/app.module.ts`, 110 entities, 65 controllers, 146 services, `config/*.ts`, `infrastructure/*`).

---

## 1. Is this architecture practical?

**Yes — and it is a smaller lift than the cloud-only plan, not a larger one.** The reason is structural, not aspirational: the previous review already found that most of HDSP's coupling to "on-prem" is concentrated in a small number of well-isolated seams — `OraclePoolService`, the three upload controllers, `LicenseService`, `redis.config.ts`, and `main.ts`'s static-file/CORS setup — while the other ~90% of the codebase (110 entities, 65 controllers, 146 services implementing RBAC, attendance logic, token queueing, CMS, feedback, loyalty, EIC, document generation) contains **no infrastructure assumptions at all**, only business logic sitting on top of TypeORM repositories and NestJS DI.

That is precisely the shape a hybrid platform needs: business logic that is infrastructure-agnostic, plus a thin, swappable layer underneath it. The codebase already has one working precedent for this exact pattern — `ISecretsProvider` (`backend/src/modules/platform/infrastructure/secrets/secrets.interface.ts`), a real interface with a real implementation (`EnvironmentSecretsProvider`) already injected via NestJS DI — and a second, unfinished precedent — `IObjectStorageProvider` (`backend/src/modules/platform/services/object-repository/interfaces/object-storage-provider.interface.ts`), which defines exactly the `local | s3 | azure-blob | gcs` abstraction this hybrid model needs, just not yet wired up. The team has already designed for this future; it simply hasn't been extended past two subsystems.

The practical risk is not "can NestJS support this" (it can — Section 4 shows exactly how), it's **discipline**: every new feature must be written against an abstraction, not against `fs`, `oracledb`, or a specific Redis assumption, or the codebase will silently re-accumulate cloud-only or on-prem-only code paths. That is a process/review risk, not an architectural one, and is addressed in Section 14.

---

## 2. What should remain identical

Everything that is business logic, domain modeling, or application-layer contract should be **100% identical** across both deployment modes — same code, same tests, same behavior, difference only in which infrastructure provider is bound at boot.

- **All 110 TypeORM entities** and their relationships/constraints (Section 3 of the prior review) — the schema is deployment-mode-agnostic; only *what* sits behind the TypeORM `DataSource` differs (see Section 12), never the entity definitions.
- **All 146 services' business logic** — `AttendanceProcessor`, `HisSyncService`'s cursor/idempotency logic, `LoyaltyProcessor`, `TokenDailyResetService`, `CmsAssetCleanupService`'s retention rules, `FeedbackFormController`'s form logic, EIC's clinical workflow services, `DocumentEngine`'s PDF composition, `RbacService`'s permission resolution — none of this contains infrastructure branching today and none should ever need to.
- **All 65 REST controllers and their DTOs** — request/response contracts, validation (`class-validator`), the global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) are identical regardless of where the process runs.
- **The full guard chain** — `JwtAuthGuard` → `JwtStrategy.validate()` → `RolesGuard` → `PermissionsGuard` → `LicenseGuard` (Section 4 of the prior review) — is deployment-mode-agnostic; only the *data source* `LicenseService` reads from changes (Section 10).
- **RBAC model** — `Role`/`Permission` entities, `role_permissions`/`user_permissions` join tables, the `MODULE:RESOURCE:ACTION` permission-key convention.
- **The attendance engine** — Oracle polling *cadence*, cursor logic, circuit-breaker behavior, reconciliation algorithms (`HisReconciliationJob`, `NightReconciliationJob`), and the Bull-queued `AttendanceQueueProcessor` — all identical; only *how* the Oracle bytes physically reach the process changes (Section 8).
- **Token/kiosk queue management** — `TokenDailyResetService`, `TokenAnalyticsService`, registration/reservation logic, WebSocket gateway events.
- **CMS** — playlists, display groups, emergency broadcast, scrolling ticker, asset-cleanup retention rules — identical; only the object-storage provider underneath `CmsMediaController`/`CmsAssetCleanupService` changes (Section 9).
- **Feedback module** — forms, QR generation (already provider-agnostic — rendered on the fly, never touches disk), campaigns, complaints, Google Review flow, analytics.
- **Loyalty module** — points/rewards rules, campaign scheduler logic, HIS bridge business rules (EARN/ADJUST/REVERSE semantics).
- **Document Platform** — document engine, forms designer, compliance engine, workflow engine; PDF generation already returns an in-memory `Buffer` (no infra coupling) — only the asset-library storage backend changes.
- **Audit logging** — `AuditService`/`AuditProcessor` behavior, log shape, retention rules.
- **Notification business rules** — *when* and *what* to notify (`NotificationService`); only the outbound provider/credentials differ (Section 3 below).
- **Licensing *business rules*** — module-gating logic (`@RequireModule()`, `LicenseGuard`), grace-period handling, trial-mode semantics — identical; only *where the license record comes from* differs (Section 10).
- **API surface, versioning (`VersioningType.URI`, `/api/v1/...`), Swagger docs, health-check endpoints** (`/health`, `/health/live`, `/health/ready` via `@nestjs/terminus`) — identical in both modes; this is a major asset since it means monitoring/health-check tooling built for one mode works unmodified in the other.
- **Frontend application code** — Next.js pages/components/business logic; only the API base URL and any deployment-mode-specific branding/config differ.

**In short: everything above the `Repository`/`Queue`/`ObjectStorage`/`SecretsProvider`/`OracleTransport` seam is identical.** That seam is narrow and already partially built.

---

## 3. What should become deployment-specific

| Infrastructure dependency | Cloud implementation | Self-hosted implementation | Shared interface |
|---|---|---|---|
| **File storage** | `S3StorageProvider` (S3/R2, tenant-prefixed keys, CDN in front) | `LocalStorageProvider` (existing `fs`-based logic in `CmsMediaController`/`TokenController`/`FeedbackFormController`, refactored behind the interface, no tenant prefix needed) | `IObjectStorageProvider` — **already exists**, unwired |
| **Oracle connectivity** | `QueueRelayOracleTransport` (talks to the per-hospital edge agent over a message queue/WS) | `DirectOracleTransport` (today's `OraclePoolService`, unchanged, direct TNS connection) | New `IOracleTransport` (Section 8) |
| **Licensing** | `SubscriptionLicenseProvider` (reads from a central tenant-subscription service/DB, billing-integrated) | `FileLicenseProvider` (today's RSA-signed `license_master` row + machine fingerprint, unchanged) | New `ILicenseProvider` (Section 10) |
| **Secrets** | `CloudSecretsProvider` (AWS Secrets Manager/Azure Key Vault) | `EnvironmentSecretsProvider` (**already exists**, reads `.env`) | `ISecretsProvider` — **already exists** |
| **Notifications (WhatsApp/SMS/Email)** | Shared platform-managed provider account, usage metered per tenant | Hospital's own WhatsApp Business/SMTP credentials, stored locally | New `INotificationTransport` wrapping today's `WhatsAppService` |
| **Cache/session store** | Managed Redis (ElastiCache), tenant-namespaced keys | Local Redis container/process, single-tenant keys (namespacing harmless but unnecessary) | No new interface needed — `RedisProvider` already reads connection details from config; only the *key-prefix* becomes deployment-mode-aware (tenant ID present vs. a fixed `default` tenant) |
| **Job queue (Bull)** | Managed Redis-backed Bull, tenant-tagged jobs, dedicated worker service/pods | Local Redis-backed Bull, single implicit tenant, worker runs in the same process (as today) | No new interface — same Bull config, `tenantId` field is always present in the payload but defaults to `'default'` in self-hosted mode |
| **Rate limiting** | Redis-backed `ThrottlerStorage`, tenant-keyed | Redis-backed `ThrottlerStorage` (local Redis), single-tenant-keyed — **same code**, just replace today's in-memory storage everywhere, since the fix in Section 12/13 of the prior review benefits both modes | `ThrottlerStorageRedisService` — one implementation used identically in both modes |
| **Database connection** | Managed Postgres (RDS Multi-AZ), one shared DB, `tenant_id`-scoped rows | Local/dockerized Postgres, one DB, single default tenant row | No new interface — `TypeOrmModule.forRootAsync` already reads all connection params from config |
| **Rate/quota enforcement** | Per-tenant, billing-tier-aware | Effectively unlimited / single global tier | Handled inside `LicenseService`/`ILicenseProvider`, not a separate concern |
| **Reverse proxy / TLS termination** | ALB (managed) | Nginx (existing `infrastructure/nginx/*`, unchanged) | Not application code — pure deployment concern |
| **Process orchestration** | ECS Fargate tasks / containers | PM2 (existing `infrastructure/pm2/ecosystem.config.js`, unchanged) | Not application code |
| **Logging sink** | stdout → CloudWatch | Winston file rotation (existing `logger.util.ts`, unchanged behavior) | Winston already supports multiple transports — add a transport-selection based on `DEPLOYMENT_MODE`, keep the Winston API identical everywhere |
| **Multi-tenancy enforcement** | Full tenant resolution middleware + RLS/query scoping active | Effectively a no-op — single tenant row (`id='default'`), middleware still runs but always resolves to the same tenant | Same middleware/guard code path in both modes (Section 7) — this is the key design choice that keeps the codebase from branching |
| **CI/CD artifact** | Container image pushed to ECR, deployed via ECS | Installer package / Docker Compose bundle, or a PM2-based install script | Same build pipeline up to the artifact stage (Section 13) |

The organizing principle: **every row above is a provider swapped via configuration, never a branch inside business logic.** If a service ever needs to check `DEPLOYMENT_MODE` directly, that is a signal the abstraction boundary was drawn in the wrong place.

---

## 4. Deployment Mode

**Yes — introduce `DEPLOYMENT_MODE` as a first-class, required, boot-time environment variable** (`cloud | self_hosted`), validated in the existing Joi schema (`backend/src/config/env.validation.ts`) alongside `DB_HOST`, `JWT_SECRET`, etc. This is consistent with how the codebase already treats boot-time configuration (`NODE_ENV`, `APP_NAME`) — no new configuration *mechanism* is needed, only a new *key*.

**How it should influence dependency injection — recommendation: NestJS Dynamic Modules selecting Strategy-pattern providers, decided once at bootstrap, not resolved per-request.**

Concretely:

```ts
// backend/src/config/deployment.config.ts (new, same registerAs pattern as redis.config.ts/oracle.config.ts)
export const deploymentConfig = registerAs('deployment', () => ({
  mode: (process.env.DEPLOYMENT_MODE || 'self_hosted') as 'cloud' | 'self_hosted',
}));
```

```ts
// backend/src/modules/platform/services/object-repository/object-repository.module.ts
@Module({})
export class ObjectRepositoryModule {
  static forRoot(): DynamicModule {
    return {
      module: ObjectRepositoryModule,
      providers: [
        {
          provide: 'IObjectStorageProvider',
          useFactory: (config: ConfigService) =>
            config.get('deployment.mode') === 'cloud'
              ? new S3StorageProvider(config)
              : new LocalStorageProvider(config),
          inject: [ConfigService],
        },
        ObjectRepositoryService,
      ],
      exports: [ObjectRepositoryService],
    };
  }
}
```

This is a **Strategy pattern** (the two provider classes implement `IObjectStorageProvider` and are interchangeable), instantiated through a **Factory function** (`useFactory`), wired using **NestJS's native provider/token DI** (`provide: 'IObjectStorageProvider'`), packaged as a **Dynamic Module** (`.forRoot()`). These are not competing options — they compose, and this composition is already idiomatic NestJS, already used elsewhere in the codebase (`TypeOrmModule.forRootAsync`, `BullModule.forRootAsync` in `app.module.ts` follow exactly this shape). The same pattern applies to `IOracleTransport` (Section 8), `ILicenseProvider` (Section 10), and `INotificationTransport`.

**Why decide once at bootstrap, not per-request:** `DEPLOYMENT_MODE` describes *how this specific running instance is deployed*, not something that varies per tenant or per request within a single process — a self-hosted install is self-hosted for its entire lifetime; a cloud instance serves many tenants but is still one deployment mode. Resolving the strategy once at module-registration time (not inside a request-scoped provider) avoids per-request overhead and keeps the DI graph simple and inspectable.

**Why not a runtime `if (deploymentMode === 'cloud')` scattered through services:** that is exactly the anti-pattern this design avoids — it would require every one of the 146 services to know about deployment mode, defeating the "one codebase, identical business logic" goal from Section 2. The dynamic-module/provider-token approach means a service like `CmsMediaController` only ever depends on `IObjectStorageProvider` (or better, the already-designed `ObjectRepositoryService` facade) and never imports or checks `DEPLOYMENT_MODE` at all.

---

## 5. Infrastructure Abstraction — coupling points and how to abstract each

| Coupling point (current code) | Where | How to abstract |
|---|---|---|
| `fs.writeFile`/`fs.createWriteStream`/`pipeline(data.file, ...)` | `CmsMediaController.upload`, `TokenController.uploadMedia`, `FeedbackFormController` header-image handler | Replace direct `fs` calls with `ObjectRepositoryService.storeFile()` (already designed, just needs the two provider implementations — Section 9) |
| `fs.unlink`/`fs.unlinkSync` | `CmsAssetCleanupService`, `CmsMediaController.permanentDelete` | `ObjectRepositoryService.deleteFile()` / provider `.delete()` |
| `OraclePoolService` (direct `oracledb` TNS connection, single pool, single circuit breaker) | `backend/src/modules/his/oracle-pool.service.ts` | Wrap behind `IOracleTransport` (Section 8) with two implementations; the existing pool/circuit-breaker/reconfigure logic becomes the body of `DirectOracleTransport` unchanged |
| `RedisProvider` (single connection, flat `hdsp:` prefix, `CACHE_KEYS` with no tenant dimension) | `backend/src/common/redis/redis.provider.ts`, `config/redis.config.ts` | Keep the provider as-is (connection details are already config-driven); change only the *key-building function* to prepend a tenant segment that defaults to `'default'` in self-hosted mode — no new abstraction needed, just a parameterized key helper used everywhere `CACHE_KEYS` is used today |
| `LicenseService` (RSA-signed file + machine fingerprint) | `backend/src/modules/licensing/license.service.ts` | Wrap behind `ILicenseProvider` (Section 10); today's logic becomes `FileLicenseProvider` unchanged |
| `WhatsAppService` (single global token/phone-number-id from env) | `backend/src/modules/notifications/whatsapp.service.ts` | Wrap behind `INotificationTransport`; credentials resolved via `ISecretsProvider` (already exists) keyed by tenant in cloud mode, by a single env var in self-hosted mode — the `WhatsAppService` class itself becomes the self-hosted-flavored implementation, largely unchanged |
| SMTP (not currently implemented anywhere — a gap, not existing coupling) | n/a | Design `INotificationTransport` to include an email channel from the start so it isn't bolted on later |
| Nginx assumptions (`server_name hdsp.hospital.local`, single vhost) | `infrastructure/nginx/*` | Not application-code coupling — this is a deployment artifact; cloud mode uses ALB host-based routing instead, self-hosted keeps the existing Nginx template. No code change required, only deployment tooling (Section 12) |
| PM2 assumptions (`cwd: '/opt/hdsp/backend'`, hardcoded ports, 2-instance cluster) | `infrastructure/pm2/ecosystem.config.js` | Not application coupling — self-hosted keeps PM2 as-is; cloud mode replaces the *process manager* (ECS task) but the *application* underneath doesn't know or care which one is running it, because it never inspects PM2 env vars in business logic |
| Static file serving (`@fastify/static` mounts in `main.ts` for `uploads/*`, `static/token-audio`) | `backend/src/main.ts` | In self-hosted mode, keep the static mounts (serving from `LocalStorageProvider`'s directory). In cloud mode, register no static mounts at all — reads go through presigned URLs from `S3StorageProvider`. This becomes a small conditional *in `main.ts` bootstrap only* (acceptable — this is precisely the kind of narrow, boot-time-only branch the architecture should tolerate; it must never appear inside a controller or service) |
| Environment variables as the only config mechanism (`env.validation.ts` Joi schema, single scalar values, cannot represent "N tenants' worth of Oracle credentials") | `backend/src/config/env.validation.ts` | Keep env vars for **Platform** and **Deployment** configuration (Section 11) — this is the correct level for them. Move anything that needs to vary per tenant (Oracle credentials, notification credentials, branding) into the DB-backed settings pattern that already exists (`system_settings`, `cms_settings`, `feedback_settings`), extended with `tenant_id` — this repo already has the right *second* configuration plane, it just needs the missing pieces layered onto it (Section 11) |
| CORS private-IP-range allowlist (`main.ts`) | `backend/src/main.ts` | Make this deployment-mode-aware: self-hosted keeps the private-IP allowlist (needed for LAN-based HIS popup integration); cloud mode replaces it with a wildcard-subdomain allowlist resolved from the tenant registry. Same narrow, boot-time-only conditional as the static-mount case above |

**General abstraction principle applied consistently above:** every coupling point becomes either (a) a Strategy-pattern interface with two provider implementations selected via a Dynamic Module factory (storage, Oracle transport, licensing, notifications, secrets), or (b) a parameterization of existing config-driven code that needs no new interface at all (Redis key prefixing, DB/Redis connection strings), or (c) a deployment-tooling difference that never touches application code (Nginx, PM2, static-mount registration at boot only).

---

## 6. Existing Code Reuse

| Layer | Estimated reuse | Notes |
|---|---|---|
| **Entities (110 files)** | ~95% unchanged | Only change: add nullable `tenant_id` (defaults to a single `'default'` row in self-hosted mode — Section 7) plus composite-unique constraint changes on a handful of tables (`users.username/email`, `system_settings.setting_key`, `his_schema_configs.config_key`) |
| **Services (146 files) — business logic** | ~90% completely unchanged | Attendance engine, loyalty rules, RBAC resolution, token queue logic, CMS playlist/scheduling logic, feedback/complaint workflows, EIC clinical workflow, document engine/PDF composition, audit logging |
| **Services — infrastructure-touching (≈10 files)** | Small, targeted refactor, not rewrite | `OraclePoolService` (wrap, don't rewrite — becomes `DirectOracleTransport` body), `LicenseService` (wrap, becomes `FileLicenseProvider` body), `WhatsAppService` (wrap), the three upload controllers (swap `fs` calls for `ObjectRepositoryService` calls — a mechanical change, same method signatures), `CmsAssetCleanupService` (swap `fs.unlink` for provider `.delete()`) |
| **Controllers (65 files) / DTOs** | 100% unchanged | No controller currently branches on infrastructure; DTOs are pure validation contracts |
| **Guards / RBAC / Permissions** | 100% unchanged | `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard` logic is already infra-agnostic; only `LicenseGuard`'s upstream data source changes (Section 10), the guard itself does not |
| **Validation (class-validator)** | 100% unchanged | |
| **Queue processing (Bull processors)** | ~95% unchanged | Processor *logic* is unchanged; only the job DTO gains an always-present `tenantId` field (defaulting to `'default'` in self-hosted) — a field addition, not a redesign |
| **Frontend (Next.js)** | ~90%+ unchanged, not yet audited in depth | Business logic/components/pages are almost certainly deployment-agnostic already since they only talk to the REST API; the primary changes are API base URL resolution and, in cloud mode, tenant/subdomain-aware branding — flagged as a follow-up audit item, consistent with the "unknown" risk noted in the prior review for the frontend and shared `packages/*` |
| **Config (`config/*.ts`)** | Small additive changes | New `deployment.config.ts`; existing files (`redis.config.ts`, `oracle.config.ts`, `database.config.ts`, `jwt.config.ts`) unchanged in shape, only consumed differently by the new provider factories |
| **Infrastructure (`infrastructure/*`, Dockerfiles, CI)** | Requires genuinely new work, not reuse | This is the one layer that legitimately needs new artifacts (Dockerfiles for both modes, an installer/packaging pipeline for self-hosted, ECS/cloud IaC) — but this was already true under the cloud-only plan, so it is not incremental cost specific to the hybrid approach |

**Overall estimate: 85–90% of the existing backend business-logic codebase (entities, services, controllers, DTOs, guards, queue processors) requires no change or only mechanical refactoring behind an interface.** The genuinely new work is concentrated in roughly 10 infrastructure-touching files plus new Dynamic Module wiring, new provider implementations (`S3StorageProvider`, `QueueRelayOracleTransport`, `SubscriptionLicenseProvider`), and deployment tooling. This is a materially *smaller* rewrite than the cloud-only plan implied, because the hybrid approach keeps `DirectOracleTransport`/`LocalStorageProvider`/`FileLicenseProvider` as the self-hosted path essentially unchanged from today's code, rather than deleting it.

---

## 7. Multi-Tenancy in Self-Hosted

**Yes — the self-hosted deployment should also have a `Tenant` entity, seeded with exactly one row (`id: 'default'`), rather than having no tenant concept at all.**

**Advantages:**
- **This is the single decision that makes "one codebase" actually true.** If self-hosted has no tenant column and cloud does, every entity, repository query, and Redis key helper needs two code paths (`WHERE tenant_id = X` vs. no filter at all) — precisely the branching this whole redesign exists to avoid. With a `Tenant` entity present everywhere, `WHERE tenant_id = :tenantId` is *always* the query shape; in self-hosted, `:tenantId` is always `'default'`, resolved once at startup rather than per-request from a subdomain.
- Every abstraction in Sections 3–6 (tenant-scoped Redis keys, tenant-tagged Bull jobs, tenant-scoped `system_settings`) becomes literally the same code in both modes — no `if (deploymentMode === 'self_hosted') { skip tenant filter }` anywhere.
- It future-proofs a self-hosted hospital that later wants to run **multiple legal entities/branches as separate tenants on one on-prem server** (e.g., a hospital group with 2–3 facilities sharing one install) — the data model already supports it without another migration.
- It makes a future self-hosted-to-cloud *migration path for a single hospital* (a real product need — a hospital outgrowing its own server) a data export/import of one tenant's rows, not a schema transformation.

**Disadvantages:**
- Marginal overhead: every query gains a `tenant_id = 'default'` predicate that does nothing useful in single-tenant mode — negligible with a proper index, and outweighed by the code-simplicity benefit above.
- Slightly larger onboarding/installer complexity (the self-hosted installer must seed one `Tenant` row and the first `SUPER_ADMIN` scoped to it) — a one-time addition to the existing `SetupController`/`isSetupRequired` flow, not an ongoing cost.
- Risk of confusing hospital IT staff who see a "Tenant" concept in an on-prem product they think of as single-hospital — mitigated by not exposing the concept in the self-hosted UI at all (it can be entirely internal/implicit, since there's only ever one row).

**Recommendation: adopt it.** The disadvantages are cosmetic; the advantage (identical query/service code in both modes) is the architectural crux of the entire hybrid strategy and directly resolves the tension between the prior review's Section 2/3 (which required a `tenant_id` retrofit for cloud) and this review's Section 1 (one codebase for both modes).

---

## 8. Oracle Integration — shared business logic, swapped transport

**Yes.** The prior review's Section 6 finding is the load-bearing fact here: **the entire Oracle-facing codebase is already written as "issue a query/command, get a result," with all HIS-specific logic (schema mapping via `his_schema_configs`, cursor tracking, retry/circuit-breaker behavior, idempotent EARN/ADJUST/REVERSE processing) living in service classes that never assume *how* the bytes travel** — they assume only that `OraclePoolService.query(sql, binds)` (or equivalent) eventually resolves. That is exactly the seam needed to swap transport without touching business logic.

### Design

```ts
// backend/src/modules/his/transport/oracle-transport.interface.ts (new)
export interface IOracleTransport {
  query<T>(sql: string, binds?: Record<string, unknown>): Promise<T[]>;
  execute(sql: string, binds?: Record<string, unknown>): Promise<{ rowsAffected: number }>;
  isAvailable(): boolean;               // mirrors today's circuit-breaker state
  onModuleInit(): Promise<void>;
  onModuleDestroy(): Promise<void>;
}
```

- **`DirectOracleTransport implements IOracleTransport`** — today's `OraclePoolService` body, essentially unchanged: same `oracledb` pool, same circuit breaker (`CIRCUIT_COOLDOWN_MS`), same `reconfigure()` hot-swap on `his_schema_config` updates. Used in `self_hosted` mode, where the Node process and Oracle share a network.
- **`QueueRelayOracleTransport implements IOracleTransport`** — new. In `cloud` mode, `query()`/`execute()` publish a job (with `tenantId`, SQL template reference, and bound parameters — never raw ad hoc SQL strings, to keep the allow-list narrow at the agent) to a per-tenant queue, await a correlated response (via the WebSocket/short-poll channel recommended in the prior review's Section 6), and resolve with the same `T[]` / `{rowsAffected}` shape `DirectOracleTransport` already returns. From the caller's perspective (`HisSyncService`, `PatientService`, `AttendanceListener`, etc.), nothing changes — they already only depend on the return shape, not the transport.
- The **per-hospital edge agent** (new, standalone, deployed at each cloud-tenant hospital) is literally a slimmed build of the existing HIS module running `DirectOracleTransport` locally against the hospital's Oracle instance, with a thin relay shim on top that speaks the agent-side half of the queue protocol. This means the edge agent is not a rewrite either — it's the *same* `DirectOracleTransport`/`OraclePoolService` code, repackaged as a small standalone process, which is a direct, tangible benefit of the hybrid strategy over a cloud-only rewrite: the "new" Oracle connectivity component for cloud tenants is mostly assembled from code that already exists and is already battle-tested for the self-hosted case.

```
Self-hosted:                          Cloud:
┌─────────────────┐                   ┌──────────────────┐        ┌────────────────────┐
│  HDSP Backend    │                   │  HDSP Backend     │        │  Hospital-side      │
│  (his module)    │                   │  (his module)     │        │  Edge Agent          │
│  IOracleTransport│                   │  IOracleTransport │        │  (DirectOracleTransport│
│  = Direct        │──TNS/TCP──►Oracle │  = QueueRelay     │◄─Queue─┤   + relay shim)      │──TNS/TCP──►Oracle
└─────────────────┘                   └──────────────────┘        └────────────────────┘
```

- Selection is wired via the same Dynamic Module factory pattern as Section 4: `HisModule.forRoot()` binds `IOracleTransport` to `DirectOracleTransport` or `QueueRelayOracleTransport` based on `deployment.mode`, injected into `OraclePoolService`'s call sites via the token — meaning `PatientService`, `HisSyncService`, `AttendanceListener`, `HisTokenBridgeService`, and every other Oracle-touching service depend only on `IOracleTransport`, never on `OraclePoolService` directly, and never know which mode they're running in.

---

## 9. Storage Layer

### Design (formalizing what already exists as scaffolding)

```
                     ObjectRepositoryService  (facade — already designed,
                                               backend/src/modules/platform/services/
                                               object-repository/services/object-repository.service.ts)
                              │
                     IObjectStorageProvider   (interface — already designed,
                                               object-storage-provider.interface.ts)
                    ┌─────────┴─────────┐
       LocalStorageProvider      S3StorageProvider
       (new — wraps today's       (new — @aws-sdk/client-s3
        fs logic from the 3       + @aws-sdk/lib-storage for
        upload controllers)        streaming multipart upload)
```

### Migration path from the current implementation (minimal disruption)

The prior review found three near-identical hand-rolled upload handlers (`CmsMediaController.upload`, `TokenController.uploadMedia`, `FeedbackFormController`'s header-image handler), all using `@fastify/multipart`'s `req.file()` directly, writing via `fs.createWriteStream`/`pipeline`, and computing a SHA-256 checksum after the write. Migration is mechanical, not architectural:

1. **Implement `LocalStorageProvider`** by lifting the existing per-controller logic (filename generation `${Date.now()}-${random}${ext}`, directory targets, checksum computation) into one class implementing `upload/download/getMetadata/delete/getPresignedDownloadUrl`. In self-hosted mode, `getPresignedDownloadUrl()` simply returns the existing `/uploads/<module>-media/<file>` static-served path (no real "presigning" needed locally) — same as today's behavior.
2. **Implement `S3StorageProvider`** using `@aws-sdk/lib-storage`'s `Upload` class to stream `data.file` (the Fastify multipart stream) directly to S3 without buffering the whole file, and `getPresignedDownloadUrl()` using `@aws-sdk/s3-request-presigner`.
3. **Register `ObjectRepositoryModule.forRoot()`** in `PlatformServicesModule` (currently commented out as "future") using the Dynamic Module factory pattern from Section 4.
4. **Replace the three controllers' body** — `req.file()` → `ObjectRepositoryService.storeFile(stream, filename, mimeType, { tenantId, module: 'cms'|'token'|'feedback' })` — same controller method signature, same DTO, same response shape (`{ url, checksum, ... }`), only the internals change. No API contract change, so frontend code and API consumers are unaffected.
5. **Fix `CmsAssetCleanupService`** and `CmsMediaController.permanentDelete` to call `ObjectRepositoryService.deleteFile()` instead of `fs.unlink`.
6. **In `main.ts`**, register the four `@fastify/static` mounts only when `deployment.mode === 'self_hosted'` (Section 5) — in cloud mode, reads go through `getPresignedDownloadUrl()` instead.
7. **Entity fields** (`CMSMedia.url`, `FeedbackForm.headerImageUrl`, token display-media `url`) store an **object key**, not a full URL, in both modes; a small read-time resolver (`ObjectRepositoryService.resolveUrl(key)`) returns either the static path (self-hosted) or a presigned/CDN URL (cloud) — this is the one place a mode-aware branch legitimately lives, and it lives in exactly one facade method, not scattered across controllers.
8. **Fix the document-platform asset-library base64-in-Postgres anti-pattern** as part of the same rollout — it should also depend on `ObjectRepositoryService`, gaining both storage backends for free rather than needing its own migration later.

This preserves the existing controller structure, DTOs, and API responses almost entirely — the disruption is contained to swapping the internals of upload/delete methods and adding the two provider classes.

---

## 10. Licensing — one interface, two providers

**Yes, the existing licensing system generalizes directly** — the prior review already found it to be "the most SaaS-ready subsystem in the codebase" because it already models hospitals as external, addressable, license-bearing entities with a signed-artifact/webhook lifecycle. The hybrid model doesn't require discarding any of that; it requires putting one interface in front of it.

```ts
// backend/src/modules/licensing/providers/license-provider.interface.ts (new)
export interface ILicenseProvider {
  getStatus(tenantId: string): Promise<LicenseStatus>;   // modules[], maxUsers, expiresAt, graceUntil
  activate(tenantId: string, payload: unknown): Promise<LicenseStatus>;
  handleLifecycleEvent(event: LicenseLifecycleEvent): Promise<void>; // revoke, extend trial, etc.
}
```

- **`FileLicenseProvider implements ILicenseProvider`** — wraps today's `LicenseService` almost unchanged: RSA-signature verification against `license.public.pem`, `LicenseMaster` row persistence, the existing 5-minute Redis-cached `getStatus()`, the existing grace-period logic, the existing trial-mode auto-activation. Machine-fingerprint binding is **retained here** (self-hosted installs are genuinely one machine per hospital, so this is the correct place for it to live, rather than being deleted as the prior cloud-only review recommended — the hybrid framing shows fingerprinting isn't wrong, it's mode-specific).
- **`SubscriptionLicenseProvider implements ILicenseProvider`** — new. `getStatus(tenantId)` reads from a central tenant-subscription table (the Vendor Portal's existing `Hospital`/`IssuedLicense` schema, extended with `stripeCustomerId`/`planId`/billing fields, per the prior review's Section 8), no machine fingerprint involved, no signed-file upload — just a DB read (Redis-cached identically to today's pattern). `handleLifecycleEvent()` absorbs Stripe/billing-provider webhooks the same way `FileLicenseProvider` already absorbs vendor-portal webhooks (`LICENSE_APPROVED`, `MODULE_REVOKED`, etc.) — same event-handling shape, different event source.
- `LicenseGuard` and `@RequireModule()` (Section 2 — unchanged, deployment-agnostic) call `ILicenseProvider.getStatus(tenantId)` instead of `LicenseService.getStatus()` directly — a one-line change at each of the guard's call sites, injected via the same token-based DI as every other provider in this design.
- The one item that needs tenant-scoping regardless of provider (flagged as high-risk in the prior review): **`resetToTrial()`'s destructive blast radius must be scoped to `tenantId` in both implementations** before this refactor ships — this was already a latent bug in the self-hosted-only code (harmless there only because there's exactly one tenant to reset) and becomes a real incident risk the moment `SubscriptionLicenseProvider` exists alongside multiple tenants in the same database.

This is a textbook Strategy pattern over an already-well-abstracted domain — the "redesign" here is almost entirely interface extraction, not new logic.

---

## 11. Configuration — four layers

| Layer | Definition | Examples | Where it lives today / should live |
|---|---|---|---|
| **Platform Configuration** | Applies to the HDSP product itself, identical for every install of a given deployment mode, set once by whoever operates the process (us for cloud, the hospital's IT for self-hosted) | `NODE_ENV`, `PORT`, `API_PREFIX`, `LOG_LEVEL`, `JWT_SECRET`/`JWT_REFRESH_SECRET`, DB/Redis connection strings, `STORAGE_DRIVER` | Environment variables, validated by `env.validation.ts` — unchanged mechanism |
| **Deployment Configuration** | Describes *which mode* this instance runs in and mode-specific infra selection | `DEPLOYMENT_MODE=cloud\|self_hosted`, `S3_BUCKET`/`S3_REGION` (cloud only), `ORACLE_TRANSPORT=direct\|queue_relay`, `LICENSE_PROVIDER=file\|subscription` | New `deployment.config.ts`, environment variables — the *only* place `DEPLOYMENT_MODE` is read outside of the DI factory functions in Section 4 |
| **Tenant Configuration** | Varies per hospital, stored as data (not env vars), editable at runtime without a redeploy | Oracle host/credentials, WhatsApp Business number/token, branding/logo/theme, working hours, `POINT_VALUE_INR`, Google Review link, feedback/CMS singleton-row settings extended with `tenant_id` | `system_settings`/`cms_settings`/`feedback_settings`-style DB tables (the pattern already exists — Section 5 of the prior review), extended with a `tenant_id` FK; in self-hosted mode this is simply the one row belonging to the `'default'` tenant |
| **Runtime Configuration** | Changes during process lifetime without a restart, often cached in Redis, sometimes user/session-scoped | Idle-session timeout (`system_settings`, already dynamic today), feature flags, license status cache (5-min TTL), branch-switcher active state, per-tenant rate-limit overrides | Redis-cached reads of the Tenant Configuration layer above, plus genuinely ephemeral state (session activity, JWT blacklist) that never persists to Postgres at all |

**Key discipline this table enforces:** `DEPLOYMENT_MODE` and infra-selection flags belong exclusively in the Deployment layer (env vars, read only by DI factories at bootstrap); anything that could plausibly differ *per hospital* — even in self-hosted mode, where "per hospital" means "the one hospital this install serves" — belongs in the Tenant layer as DB-backed data, not an env var. This is exactly the fix the prior review's Section 5 already recommended for cloud-only (move Oracle/WhatsApp credentials off env vars); the hybrid model makes it non-negotiable, because self-hosted's `.env` file is exactly the kind of "N tenant-shaped values in one scalar variable" trap the prior review flagged as structurally impossible to represent.

---

## 12. Deployment Architecture

### Cloud

```
                         ┌─────────────────────────────────────────────┐
Internet ──TLS──► ALB ──►│  ECS Fargate: API service (NestJS/Fastify)  │
 (host-based routing:    │  ECS Fargate: Worker service (Bull consumers│
  *.hdsp.com → tenant)   │               + tenant-iterated cron)       │
                         │  ECS Fargate: Frontend (Next.js SSR)        │
                         └───────┬─────────────┬─────────────┬────────┘
                                 │             │              │
                         RDS Postgres    ElastiCache      S3 + CloudFront
                         (Multi-AZ,      Redis (cluster    (object storage +
                          tenant_id      mode, tenant-      CDN, tenant-
                          scoped rows)   prefixed keys)      prefixed keys)
                                 │
                    ┌────────────┴─────────────┐
                    │  Per-tenant message queue │
                    │  (SQS/RabbitMQ, one queue │
                    │   or partition per tenant)│
                    └────────────┬──────────────┘
                                 │  outbound-only from hospital
                    ┌────────────┴──────────────┐
                    │  Hospital-side Edge Agent   │
                    │  (DirectOracleTransport +   │
                    │   relay shim)                │──TNS──► Oracle HIS
                    └──────────────────────────────┘
Monitoring: CloudWatch Logs (Winston stdout transport) + CloudWatch Alarms on
the existing Terminus health endpoints (/health, /health/ready, /health/live)
+ WAF on the ALB.
```

### Self-Hosted

```
Hospital server (Ubuntu 22.04, existing target per DEPLOY.md)
┌─────────────────────────────────────────────────────────┐
│  Installer (new — see Section 13) provisions:            │
│                                                            │
│  Docker Compose: Postgres 15, Redis 7  (existing compose  │
│                    file, unchanged)                        │
│  PM2: hdsp-backend (cluster), hdsp-frontend (fork)         │
│        (existing ecosystem.config.js, unchanged)            │
│  Nginx: existing hdsp.conf template, unchanged              │
│  Backend process: DEPLOYMENT_MODE=self_hosted               │
│    → IOracleTransport = DirectOracleTransport ──TNS──► Oracle│
│    → IObjectStorageProvider = LocalStorageProvider           │
│         (writes to local uploads/, optionally configurable   │
│          to S3StorageProvider if the hospital opts into      │
│          object storage — same interface, their own bucket)  │
│    → ILicenseProvider = FileLicenseProvider (existing         │
│         RSA-signed license file + machine fingerprint)        │
│    → Tenant table: single 'default' row                       │
│                                                                │
│  Backups: existing pg_dump + Redis RDB cron (DEPLOY.md §13)   │
│  Monitoring: existing Terminus /health endpoints, scrapeable  │
│              by the hospital's own monitoring if they have one│
└────────────────────────────────────────────────────────────┘
```

The self-hosted column is, deliberately, almost entirely "existing, unchanged" — this is the direct payoff of the hybrid design: self-hosted customers get to keep the deployment model they already trust, while cloud customers get the SaaS experience, off the same application binary.

---

## 13. CI/CD — one pipeline, two artifacts

```
GitHub (single repo, single main branch)
        │
        ▼
   CI (GitHub Actions — extends the existing
        ci-backend.yml / ci-frontend.yml, currently
        build → lint → unit test only)
        │  add: npm ci (fix known gap), E2E smoke tests,
        │        migration-coverage check
        ▼
   Build stage (new) — produces ONE container image per
   service (api, worker, frontend), tagged with the git SHA.
   The image is deployment-mode-agnostic — DEPLOYMENT_MODE
   is an environment variable supplied at *run* time, not
   baked into the image at *build* time. This is the key
   CI/CD decision: never build separate "cloud image" vs.
   "self-hosted image" — build one image, run it two ways.
        │
        ├──► Push to ECR ──► ECS deploy (cloud target,
        │                     automatic on merge to main,
        │                     or gated by a manual approval
        │                     step for production)
        │
        └──► Package stage (new) — same image(s), repackaged
             as a self-hosted release artifact:
               - docker-compose.selfhosted.yml referencing
                 the same image tags (registry pull, or
                 offline-loadable tarball for air-gapped
                 hospital networks)
               - an installer script (extends today's manual
                 DEPLOY.md runbook into an automated script:
                 pulls images, seeds the 'default' Tenant row,
                 runs migrations, writes .env from a template,
                 starts via the existing PM2/Nginx/Docker-Compose
                 stack)
             Published as a versioned GitHub Release artifact
             that hospital IT downloads and runs on their own
             schedule (self-hosted customers control their own
             upgrade timing — a real product requirement, distinct
             from cloud's continuous-deploy model)
```

This directly answers the "GitHub → CI → Artifacts → Cloud Deployment and Self-Hosted Package" framing in the prompt: the artifact boundary sits **after** the build stage and **before** the deploy/package stage, so both targets consume the exact same tested, versioned image — the only difference downstream is *how* that image is run (ECS task definition vs. `docker-compose.selfhosted.yml`/PM2), never *what* is inside it.

---

## 14. Long-Term Maintainability

**Maintaining both models does increase effort versus a single-mode product, but the increase is bounded and front-loaded, not open-ended, if the following decisions are made now:**

1. **Enforce the abstraction boundary in code review, not just in design docs.** Add a lint rule or a simple CI grep-check that fails the build if `fs.`, `oracledb`, or `process.env.DEPLOYMENT_MODE` appear outside the small, designated set of provider/factory files. This is cheap to build and is the single highest-leverage guardrail against the codebase drifting back into two implicit versions.
2. **Never let `DEPLOYMENT_MODE` leak past the Section 4 factory layer.** If a future engineer finds themselves wanting to check deployment mode inside a controller or service, that is a signal a new provider interface is needed, not a signal to add a conditional — this needs to be a stated principle in engineering onboarding/CLAUDE.md-equivalent docs, not just tribal knowledge.
3. **Test both providers for every interface in CI**, not just the one the current environment happens to run — e.g., run the storage-abstraction test suite against both `LocalStorageProvider` and a MinIO-backed `S3StorageProvider` in CI (MinIO is S3-API-compatible and can run as a CI service container cheaply), so provider drift is caught automatically rather than only discovered when a self-hosted customer reports a bug that cloud never exercises.
4. **Keep the self-hosted path as the "reference" implementation for anything Oracle/licensing-related**, since it's simpler (direct connection, no queue relay) and already production-proven — build the cloud variant *as a wrapper around it* (as designed in Sections 8 and 10) rather than developing them as parallel, independently-evolving implementations. This halves the surface area that can diverge.
5. **Version the Tenant Configuration schema independently of code releases** (a `tenant_settings` JSON-schema-versioned blob, or well-defined migration path for the settings tables) so that adding a new per-hospital setting doesn't require a code deploy in either mode — this keeps the *frequency* of dual-target releases lower than it would otherwise be.
6. **Self-hosted customers' upgrade cadence will lag cloud's** (Section 13) — plan a supported-version window (e.g., N-2 backend versions) explicitly, the same way any vendor with an on-prem product must, so "maintainability" includes a deliberate deprecation policy, not just code architecture.

**Net assessment:** the incremental ongoing cost of the hybrid model, if the above discipline holds, is concentrated in (a) the handful of provider implementations (2x each for storage, Oracle transport, licensing, notifications — a bounded, enumerable list, not a combinatorial explosion) and (b) the packaging/release pipeline (Section 13) — not in the 85–90% of the codebase identified as pure business logic in Section 6, which is maintained exactly once regardless of how many deployment modes exist.

---

## 15. Final Recommendation

**Adopt the hybrid model as designed above, not a cloud-only rewrite.** It costs less than the cloud-only plan (Section 6's reuse estimate is materially higher than the cloud-only review implied, precisely because self-hosted's existing code becomes one of the two providers instead of being discarded), it preserves the deployment model existing/prospective self-hosted customers already trust, and it is architecturally closer to what the codebase already half-built (`ISecretsProvider`, `IObjectStorageProvider`) than either extreme (cloud-only or on-prem-only) would have been.

**Recommended architecture in one paragraph:** a single NestJS/Next.js/TypeORM codebase where every infrastructure dependency (object storage, Oracle transport, licensing, notifications, secrets) sits behind a narrow interface with exactly two provider implementations, selected once at bootstrap via `DEPLOYMENT_MODE` through NestJS Dynamic Modules and factory providers (Section 4); a `Tenant` entity present in both modes so query and service code never branches on tenant-count (Section 7); a four-layer configuration model (Platform/Deployment/Tenant/Runtime, Section 11) that keeps env vars for boot-time infra selection and moves everything hospital-specific into the DB-backed settings pattern the codebase already uses; one CI pipeline producing one versioned, deployment-mode-agnostic container image, packaged two ways downstream (Section 13); cloud infrastructure on AWS ECS Fargate + RDS + ElastiCache + S3/CloudFront behind ALB host-based routing, self-hosted infrastructure unchanged (Docker Compose for Postgres/Redis, PM2, Nginx, per `DEPLOY.md`); and Oracle connectivity resolved by keeping today's `DirectOracleTransport` as the self-hosted path and repackaging the same code as the cloud-side per-hospital edge agent, relayed to the cloud backend via an outbound-only message queue (Section 8).

**Priorities for the next 5+ years, in order:**
1. Extract and ship the four core interfaces (`IObjectStorageProvider`, `IOracleTransport`, `ILicenseProvider`, `INotificationTransport`) with both providers each, since every subsequent phase depends on this seam existing cleanly.
2. Add the `Tenant` entity and `tenant_id` retrofit across the 107 currently-unscoped entities, seeded as a single `'default'` row for every self-hosted install — this is the same Phase-1 work the prior review identified, just now framed as mandatory for *both* modes rather than cloud-only.
3. Build the per-hospital edge agent as a repackaging of existing HIS-module code, pilot with one or two cloud tenants before wider cloud rollout.
4. Build the CI/CD artifact-and-packaging pipeline (Section 13) so self-hosted stops being a manual `git pull`/`pm2 reload` runbook and becomes a versioned, testable release artifact — this benefits self-hosted customers immediately, independent of cloud progress.
5. Containerize (Dockerfiles for backend/worker/frontend, currently absent entirely) as a shared prerequisite for both the ECS cloud target and a more robust self-hosted Docker Compose packaging.
6. Institute the maintainability guardrails in Section 14 from day one of this work, not retrofitted after the first divergence appears.

This keeps the product promise intact — one codebase, one business-logic layer, one release train — while genuinely serving two deployment models rather than pretending on-prem customers don't exist.
