# Tenant-Scoped User Identity Audit — Global Uniqueness vs. Per-Tenant Identity

**Status: architectural review only. Nothing in this document has been implemented. No schema, code, or query changes were made to produce it.**

## Purpose and scope

This is a separate review from the ownership-model audit. The ownership audit asked *who can see a row*; this one asks a more fundamental question: *is the platform's notion of "which user is this" itself correctly scoped to a tenant*, given that `username` and `email` are currently enforced as globally unique across every hospital on the platform. This was first surfaced as a real incident during live Cloud Tenant Onboarding testing — a second tenant's SUPER_ADMIN could not be named `superadmin` because that username already existed for an unrelated tenant — and this document is the full, precise follow-up: every constraint, every unscoped query, the entire login/JWT path, and every downstream system (Vendor Portal, HIS) that assumes usernames mean something globally.

Methodology: every claim below is grounded in an exact file:line citation, verified by direct reading of the entity, migration, and service code, plus a check of what actually happens today (not a guess) if two tenants have the same username. Four parallel research passes fed this synthesis — schema/constraints, every lookup call site, the auth/JWT/password-reset flow specifically, and role-assignment/search/HIS/Vendor-Portal touchpoints.

---

## 1. What's actually enforced today, at the database level

`User.username` and `User.email` carry **live Postgres `UNIQUE` constraints**, not just application-layer duplicate-checking — this matters enormously for migration risk, since it means any fix requires an actual schema migration, not a code-only change.

- `backend/src/modules/users/entities/user.entity.ts:14` — `@Column({ length: 100, unique: true }) username: string;`
- `backend/src/modules/users/entities/user.entity.ts:17` — `@Column({ length: 255, unique: true }) email: string;`
- Created by `backend/src/database/migrations/1700000001000-CreatePlatformSchema.ts:77-96`: `CONSTRAINT "uq_users_username" UNIQUE ("username")`, `CONSTRAINT "uq_users_email" UNIQUE ("email")` — plain, global, non-partial.
- The Stage A tenant-isolation migration (`1783740000000-AddTenantIdToAuthRbacTables.ts:27-38`) added a nullable `tenant_id` column and a **non-unique** lookup index (`IDX_users_tenant_id`) — it never touched the existing unique constraints. The two facts were never reconciled.
- `hisEmployeeCode` (`user.entity.ts:33-39`, added by `1751140000000-AddHisEmployeeMapping.ts`) has **no uniqueness constraint at all**, tenant-scoped or global — it's already unconstrained today, a distinct and arguably worse gap than username/email.
- `Role.name` has the identical pattern: `role.entity.ts:12` `unique: true`, enforced by `uq_roles_name` from the same original migration, also untouched by the tenant_id migration.
- A broader grep found other `unique: true` columns across the schema (`CardCategory`, `DisplayPage.name`, `TokenKiosk.kioskSlug`, `SystemSetting.settingKey`, `FeedbackQrCode.token`, `HisSchemaConfig.configKey`, etc.) that weren't individually traced for tenant-scoping in this pass — flagged as a possible follow-up sweep, since the same class of bug could exist wherever a "code"/"slug"/"key" column carries a bare unique constraint without tenant_id in the key.

**Bottom line:** fixing this requires dropping `uq_users_username`/`uq_users_email`/`uq_roles_name` and replacing them with composite constraints (`UNIQUE(tenant_id, username)`, etc.) — a real, if mechanically simple, migration — not a query-only fix.

---

## 2. Every place `User` is looked up by username/email/employee code, and whether tenant_id is included

None of the following queries include `tenant_id` in their `where` clause today. They fall into two genuinely different categories, and conflating them would be a mistake:

### Category A — legitimately pre-tenant-resolution (the caller has no tenant context yet by design)

| Call site | Purpose | What "correct" looks like under tenant-scoped uniqueness |
|---|---|---|
| `auth.service.ts:58-61` (`login()`) | Primary username/password login — first DB touch of the request | Needs a real design decision (see §3) — this is the single highest-risk call site in the whole audit |
| `password-reset.service.ts:80-83` (`forgotPassword()`) | Public "forgot password" entry point, username only, no tenant field on the DTO | Same ambiguity as login; currently fails silently on "not found" (anti-enumeration), so a wrong-tenant match would be a silent misdirection of a real reset action downstream |

### Category B — tenant context IS available nearby but isn't being used (straightforward fixes once uniqueness changes)

| Call site | Purpose | Consequence today under a tenant-scoped constraint |
|---|---|---|
| `users.service.ts:152-158` (`create()` duplicate-check) | Pre-insert username/email clash check | Would produce **false-positive conflicts** — rejects a username that's actually free within the creating tenant, purely because another tenant already has it. `tenantId` is resolved two lines later in the same method (`users.service.ts:161`) but not used here. |
| `users.service.ts:195-198`, `200-203` (`update()` email/username clash checks) | Pre-update clash checks on `PATCH /users/:id` | Same false-positive-conflict risk; tenant context is already available via the tenant-scoped `findOne(id)` two lines above. |
| `auth.service.ts:666-678` (`setupSuperAdmin()` duplicate-check) | Duplicate-check during first-time SUPER_ADMIN bootstrap | **Explicitly documented as intentionally global** in the code's own comment. Directly inconsistent with its sibling `isSetupRequired()` three lines above, which *is* correctly tenant-scoped (Phase 8). This is the exact code responsible for the real incident that motivated this whole audit — blocks legitimate multi-tenant onboarding today. |
| `roles.service.ts:67`, `:101` (`RolesService.create()`/`update()`) | Role-name duplicate-check | Same false-positive-conflict pattern, one level up in RBAC — already flagged in the prior ownership audit as a reason RBAC couldn't simply be flipped to `TenantScopedRepository` enforced mode. |
| `account-lock-management.service.ts:56,94,131` (vendor-portal-initiated unlock/reset-attempts/create) | Vendor Portal remote account-management commands, with a username-fallback when the target isn't a UUID | No tenant awareness at all; `createUser()` at line 131 doesn't even stamp a `tenantId` on the row it creates — a gap independent of this audit's specific question. |
| `password-reset.service.ts:303` (`applyRemoteReset()`) | Vendor-portal-initiated remote password reset, same UUID-or-username fallback pattern | Same as above — acceptable only if a deployment is assumed to host exactly one tenant, which contradicts the object of this whole platform. |

### Category C — the two most dangerous findings (no tenant scoping *and* no uniqueness constraint of any kind)

- **`users.service.ts:112-118` (`findByHisEmployeeCode()`)** — powers `hisLogin()` (`auth.service.ts:157-163`, a real auto-login path that mints a full JWT with roles/permissions) and `his.controller.ts:163`'s identity-mapping widget query. `hisEmployeeCode` has no uniqueness constraint whatsoever, tenant-scoped or global. Employee codes are assigned independently by each hospital's own Oracle HIS system — `"E12345"` can legitimately be a real, different employee in two different tenants' HIS. If two tenants each map an HDSP user to the same code, `findOne()` returns an arbitrary match, and HIS-based auto-login can authenticate a user into the **wrong tenant's account**. This is a genuine cross-tenant authentication-bypass risk, not merely an ambiguity, and it exists independently of whatever happens with username/email — it needs its own fix regardless of this audit's broader recommendation.
- **`his-config.service.ts:139` (`applyHdspUsers()`)** — a vendor-portal-webhook-triggered bulk user upsert, matching by `username` alone, with **no tenant field in the webhook payload itself** (`{username, passwordHash, role, fullName, isActive}[]`). Created users get a synthetic `${username}@hdsp.local` email and no `tenantId` stamped at all. This is worse than a query-scoping gap — the webhook *contract* itself has no concept of tenant, so fixing the query alone wouldn't be enough; the integration point upstream of HDSP needs a tenant identifier added.

### A secondary information-leak, distinct from the ambiguity risk

The scoped, tenant-safe `GET /users` search endpoint (`users.service.ts:48-81`, correctly uses `scopedUserRepo`) does **not** leak cross-tenant data. But the **409 Conflict error messages** from `create()`/`update()`/`setupSuperAdmin()` do: an admin in Tenant A creating a user can be told `"username already exists"` based on a row that belongs to Tenant B — confirming a specific username/email is registered somewhere on the platform, even though that admin could never see the actual record. Low severity, but a real, fixable side-effect of the global check.

---

## 3. Login and JWT — is subdomain-based tenant resolution actually load-bearing here?

**No, not for the credential-matching/token-minting path itself.** This is the central architectural finding of this audit.

- `AuthController.login()` (`@Public()`) calls `authService.login(dto, ip, ua)` **without ever passing `req.tenantId`**, even though `SubdomainTenantMiddleware` has already resolved it earlier in the same request pipeline.
- `AuthService.login()` (`auth.service.ts:58-61`) matches the user by `username` alone, globally, then reads `tenantId` back **off whichever row matched** (`auth.service.ts:544,558`: `resolveTenantSlug(user.tenantId)`, `tenantId: user.tenantId ?? null`). Tenant is a *consequence* of the username lookup, not an input to it.
- The JWT (`JwtPayload`, `jwt.strategy.ts:12-51`) carries `tenantId`/`tenantSlug`, set entirely from that same `user.tenantId` at issuance (`auth.service.ts:535-560`). `JwtStrategy.validate()` never re-checks `payload.tenantId` against anything on subsequent requests — it's trusted as-is once signature/expiry pass (by explicit design, per the code's own comments).
- The one place `req.tenantId` and the JWT's `tenantId` claim ARE cross-checked is `TenantScopeGuard` (`tenant-scope.guard.ts:61-97`) — but it returns `true` immediately for any `@Public()` route, and `login`/`hisLogin`/`forgotPassword`/`setup-required`/`setup-superadmin` are all `@Public()`. The guard also defaults to `log-only` mode (never blocks) even where it does run. So the cross-check exists, but structurally cannot catch anything at the moment of login itself — only on subsequent authenticated requests made with an already-minted, possibly wrong-tenant token.
- `req.tenantId` IS genuinely load-bearing in exactly two narrower spots: `setup-superadmin`/`setup-required` (used for gating and stamping the new row's tenant, though not for the uniqueness check — see §2), and the widget cookie flow's `checkWidgetLoginTenantScope`/`checkWidgetBootstrapTenantScope` (also currently `log-only`).

**Practical consequence today:** because `username` is still globally unique, this gap is currently *masked*, not exploited — the global constraint guarantees `login()`'s lookup can only ever match one real row, so tenant identity, while resolved "by accident" rather than by design, happens to always be correct. The moment `username` uniqueness is relaxed to per-tenant, this becomes a live, exploitable ambiguity: two tenants' identically-named users would make `login()` non-deterministically pick one, potentially authenticating a person into a different hospital's account than the one they intended, with valid credentials. **This is the reason a migration to tenant-scoped uniqueness cannot be a schema-only change — the login flow itself must be redesigned in lockstep**, most likely to require the client to supply (or the server to resolve via subdomain) a tenant identifier *before* the username lookup, not after.

---

## 4. Downstream systems that assume today's global uniqueness

- **Vendor Portal provisioning.** `ProvisionCloudTenantDto.adminUsername` (`vendor-portal/backend/.../provision-cloud-tenant.dto.ts:9`) has no format/uniqueness validation of its own — Vendor Portal only pre-checks **subdomain** collision before calling HDSP. The username collision surfaces only downstream, at HDSP's provisioning step 9 (`stepCreateSuperAdminUser` → `setupSuperAdmin()`), as a `ConflictException` — by which point steps 1-8 (tenant row, subdomain reservation, storage namespace, connector pairing key, trial license) are already committed. This exact failure mode is documented in `HYBRID_ARCHITECTURE_LOG.md` as a real, previously-hit incident, and is precisely why the resumable-provisioning fix (HDSP `resume()` + Vendor Portal calling `resume` instead of `provision` on retry) had to be built earlier — that fix treats the symptom (a failed run can be retried with a different username) without addressing the underlying cause (uniqueness is global at all).
- **Concrete collision walkthrough:** Hospital A provisions with `adminUsername: "priya.sharma"` and succeeds. Hospital B, an unrelated tenant, later tries to provision with the same `adminUsername`. Steps 1-8 succeed (all correctly tenant-scoped), step 9 throws `ConflictException('Username "priya.sharma" is already taken.')`, `CloudTenantsService.provision()` catches it, marks the `CloudTenant` row `FAILED`, and Hospital B is left with a committed tenant/subdomain/license but no usable SUPER_ADMIN account until the operator manually retries with a different username via `resume()`.
- **HIS integration**, covered in §2 (Category C) — the webhook contract for `applyHdspUsers()` has no tenant concept at all, which is a more fundamental integration-contract gap than a query fix can solve.
- **Role assignment.** `UsersService.resolveRoles()` (`users.service.ts:291-298`) validates that submitted `roleIds` exist via `roleRepo.find({ where: { id: In(roleIds) } })` — **with no tenant filter**. A caller in Tenant A submitting a role UUID that happens to belong to Tenant B's custom role will have it silently attached to their user; `assignPermissions()` has the identical gap for `Permission` IDs (though `Permission` may be legitimately global/system data by design, unlike custom `Role` rows). This is a distinct vulnerability from the username/email question but was surfaced by the same investigation and belongs in the same remediation pass, since it's the same root cause: a lookup-by-ID/name that never learned about tenant scoping.

---

## 5. Proposed migration path (design only — nothing below has been implemented)

This is presented as a sequence of decisions and mechanical steps, not a plan to execute. Each step would need its own review before implementation.

1. **Decide the login UX first, before touching schema.** The hard part of this migration isn't the database change — the tenant-agnostic `username`+`password` login form (Category A above) is the one piece of the platform that structurally cannot know which tenant a login belongs to without either (a) resolving tenant from the subdomain the request arrived on and requiring it to match, (b) asking the user to also supply a tenant/hospital identifier, or (c) keeping a real, separate concept of "platform email" vs. "tenant username," where email stays globally unique (for password reset, notifications) but username becomes tenant-scoped. Option (a) is the most consistent with the existing cloud architecture (each tenant already has its own subdomain, and `SubdomainTenantMiddleware` already resolves it on every request) but requires `login()`/`hisLogin()`/`forgotPassword()` to actually start using `req.tenantId`, which today they structurally do not.
2. **Schema migration**: drop `uq_users_username`, `uq_users_email`, `uq_roles_name`; add composite unique indexes `(tenant_id, username)`, `(tenant_id, email)`, `(tenant_id, name)` on `users`/`roles`. Requires `tenant_id` to first be made non-nullable on `users` (it's currently nullable, per the Stage A migration) or the composite index needs to treat `NULL` tenant_id carefully (Postgres treats `NULL` as distinct in unique indexes, so nullable `tenant_id` combined with a composite unique index would NOT actually prevent duplicate `(NULL, "sameusername")` rows — this needs explicit handling, likely by finishing the "every user always has a real tenant_id" backfill first).
3. **Add a uniqueness constraint to `hisEmployeeCode`** as `(tenant_id, his_employee_code)` — this is arguably the most urgent single piece, since it currently has *no* constraint at all, tenant-scoped or otherwise, and already backs a real authentication path (`hisLogin`).
4. **Update every Category B call site** (§2) to add `tenantId` to its `where` clause, using tenant context that's already available nearby in every one of those methods — mechanically small changes, but there are at least seven of them (`users.service.ts` create/update ×3, `auth.service.ts` setupSuperAdmin, `roles.service.ts` create/update ×2) plus the three vendor-portal-tooling call sites in `account-lock-management.service.ts`/`password-reset.service.ts` that would need a product decision about whether vendor tooling should even support cross-tenant username fallback lookups going forward.
5. **Redesign the HIS webhook contract** (`applyHdspUsers()`) to carry an explicit tenant identifier, since no query-level fix can compensate for a payload that never had tenant information in the first place.
6. **Fix `resolveRoles()`/`assignPermissions()`** to validate that submitted role/permission IDs actually belong to the caller's tenant (or are legitimately global, for `Permission`) before attaching them — same root cause, same remediation pass.
7. **Update `Vendor Portal`'s `ProvisionCloudTenantDto`** to add a pre-flight username-availability check (calling a new, tenant-scoped-aware HDSP endpoint) before committing steps 1-8 of provisioning, so a username collision fails fast instead of after five other resources are already created.
8. **Update `seed-platform.ts`'s raw SQL** (`ON CONFLICT ("username")`) to name the new composite constraint's columns, since Postgres requires `ON CONFLICT` to match the actual constraint definition exactly.

---

## 6. Risks

- **Existing data.** Any production/self-hosted database migrated through this change needs verification that no two *existing* rows in the same tenant already collide on `(tenant_id, username)` before the composite unique index can be created (a duplicate would fail the migration outright). Given usernames were globally unique until now, this specific collision can't exist yet within any single tenant — but the nullable-`tenant_id` legacy rows flagged in the ownership-model audit (rows seeded via `seed-platform.ts` post-migration with `tenant_id: NULL`) would need to be resolved first, since multiple `NULL`-tenant rows with different usernames are fine, but the login-flow redesign in step 1 needs every real user to have an unambiguous tenant before it can work correctly.
- **Vendor Portal cross-repo coordination.** This migration isn't self-contained to the HDSP backend — Vendor Portal's provisioning DTO, its pre-flight checks, and potentially its own database schema (Vendor Portal has its own `cloud_tenants` table referencing `adminUsername` as a plain string) would need coordinated changes, and the two repos currently deploy somewhat independently, per the existing Cloud Tenant Onboarding design.
- **HIS integration is the highest-severity, least-contained risk.** Both `findByHisEmployeeCode()`'s missing uniqueness constraint and the `applyHdspUsers()` webhook's missing tenant field are integration-contract problems, not just internal query problems — fixing them may require coordinating a change with whatever system originates the HIS webhook calls, which is outside this repo's direct control in a real hospital's Oracle-HIS deployment.
- **The login-flow redesign (§5 step 1) is a genuine UX and security design decision**, not a mechanical migration — it needs explicit product sign-off on which of the three options (subdomain-required login, tenant-picker UI, or email-stays-global/username-becomes-tenant-scoped) the platform wants, before any schema work should begin. Building the schema change first, without settling this, risks locking in a composite constraint that doesn't match the eventual login design.
- **Blast radius is broader than `User` alone.** `Role.name`'s identical global-uniqueness gap was already flagged in the prior ownership-model audit as the reason RBAC couldn't simply be flipped to enforced tenant-scoped reads (global system roles have `tenant_id: NULL` by design) — any fix to `User` uniqueness should be sequenced alongside, not independently of, that already-known RBAC gap, since both stem from the same "identity/catalog fields were never revisited when tenant_id was added" root cause.

---

## Summary

**What's confirmed broken today, ranked by severity:**

1. `findByHisEmployeeCode()` — no uniqueness constraint at all, powers a real auto-login path, highest-severity live risk.
2. `login()`/`hisLogin()` — currently *masked* by global username uniqueness, but the login flow has no structural mechanism to disambiguate tenants; this is the blocking design question for the whole migration, not a simple fix.
3. `setupSuperAdmin()`'s duplicate-check — explicitly, deliberately global, directly contradicts its sibling `isSetupRequired()`, and is the exact code responsible for the incident that motivated this audit.
4. `resolveRoles()`/`assignPermissions()` — no tenant validation on role/permission IDs at assignment time.
5. `applyHdspUsers()` HIS webhook — contract-level gap, no tenant field in the payload at all.
6. Six more Category B call sites (`users.service.ts` create/update, `roles.service.ts` create/update, plus three vendor-tooling call sites) — straightforward once tenant context is threaded through, but currently would produce false-positive conflicts or wrong-tenant actions under a tenant-scoped constraint.

**What's NOT broken, and shouldn't be touched:** the `GET /users` search endpoint is already correctly tenant-scoped via `scopedUserRepo`; `refreshToken()`/`widgetBootstrap()`/`selectBranch()`/`changePassword()`/`assignPermissions()`'s user lookup all key on `id`, which is unambiguous regardless of this migration.

**Nothing in this document should be implemented from this review alone.** The login-flow redesign in particular needs an explicit product decision before any schema work begins — building the composite unique constraint first, without settling how login will resolve tenant, risks locking in the wrong shape.
