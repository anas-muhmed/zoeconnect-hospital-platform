# Phase 7 Cross-Repository Impact Analysis — Vendor Portal

**Scope:** determine whether `vendor-portal/` needs any changes to support Phase 7 ("Cloud Oracle Transport"), before Phase 7 implementation starts. Strictly scoped to Phase 7 as documented in `HDSP_Hybrid_Implementation_Roadmap.md` (lines 337-372) — no architectural improvements suggested outside that text.

**Method:** direct code read of both repositories, not inference from the roadmap document alone. Findings below are cited to file paths actually read.

**Roadmap's own signal, checked first:** Phase 7's own "Files/modules affected" list is `backend/src/infrastructure/oracle/cloud-oracle.transport.ts` (new), `oracle.module.ts`, `env.validation.ts`, and "the `connector/` package (wired to a real endpoint for the pilot)." Zero Vendor Portal files are listed. "API changes: none." This is a strong prior that Vendor Portal changes are out of scope for Phase 7 itself — every finding below either confirms that prior or identifies a real gap that surfaces in a *later* phase, not this one.

---

## Findings

### 1. Does Vendor Portal currently assume Oracle connectivity is always local?

**Yes, confirmed.** Two places encode this assumption directly:

- `vendor-portal/backend/src/modules/hospitals/hospitals.service.ts` (`testDbConnection()`, line 696) makes a direct HTTP call to `http://${hospital.publicIp}:${hospital.publicPort}/api/v1/license/oracle-test` — the vendor's "Test Connection" button.
- That HDSP endpoint (`backend/src/modules/licensing/license.controller.ts`, `oracle-test`, line 145) calls `OraclePoolService.reconfigure(creds, testOnly=true)` directly — which (post-Phase-6) delegates to `OracleClient.reconfigure()`. This creates a throwaway **direct** Oracle pool using the credentials the vendor pushed. It has no awareness of `IOracleTransport`, `DirectOracleTransport`, or (once it exists) `CloudOracleTransport` — it bypasses the Phase 2 abstraction entirely and always tests direct connectivity from the backend process itself.

Under `ORACLE_TRANSPORT=cloud_relay`, this test would be meaningless (the backend has no direct network path to Oracle by design — that's the point of the Connector) or would simply fail even when the real (Connector-mediated) path is healthy.

**Classification: Can wait until Phase 9 (Cloud Deployment) — more precisely, this becomes a real blocker at Phase 10 (Tenant Provisioning), not Phase 7.** Phase 7's pilot (Task 7.5) is one manually-configured staging/test "hospital," not a Vendor-Portal-provisioned one — nothing requires this Vendor Portal button to work correctly against a `cloud_relay` hospital until a real cloud tenant is onboarded through Vendor Portal, which doesn't happen until Phase 10.

### 2. Does Vendor Portal need awareness of the new Connector package or CloudOracleTransport?

**Not for Phase 7.** No Vendor Portal code references Oracle transport mode, and Phase 7 introduces no new concept a hospital record would need to carry — `ORACLE_TRANSPORT` is an environment variable read locally by the HDSP backend process (`OracleModule.forRoot()`'s Task 7.2 mode-selection), not something Vendor Portal sets, sees, or pushes.

**Classification: Can wait — becomes required at Phase 10** (Task 10.4, "Connector pairing key generation," is explicitly "the first real product surface for the Phase 6/7 Connector work"). Confirmed by reading `vendor-portal/backend/src/modules/hospitals/entities/hospital.entity.ts` in full: the `Hospital` entity has no field remotely related to Oracle transport, deployment mode, or Connector state today.

### 3. Are webhook payloads, registration, licensing, deployment, or health-monitoring flows affected?

Checked each directly:

- **Registration** (`vendor-sync.service.ts`, `register()`, line 31): payload is `hospitalName`/`hospitalCode`/`publicIp`/`publicPort`/`machineFingerprint`/`webhookUrl` only. No Oracle-related field. **Unaffected.**
- **Licensing webhooks** (`LICENSE_APPROVED`/`LICENSE_REVOKED`/`TRIAL_EXTENDED`/`MODULE_REVOKED`, handled in `license.service.ts`'s `processWebhookEvent()`): entirely orthogonal to Oracle connectivity. **Unaffected.**
- **`HIS_CONFIG_UPDATE` webhook** (`hospitals.service.ts`, `pushHisConfigWithUsers()`, line 610): pushes `hisConfig`/`dbCredentials`/`hdspUsers`. The `dbCredentials` keys (`db.host`, `db.port`, `db.service`, `db.user`, `db.password`, `db.mode`, `db.pool.min`, `db.pool.max`) are consumed on the HDSP side by `OraclePoolService.reconfigure()` — confirmed by direct read of the Phase 6 refactor (`backend/src/modules/his/oracle-pool.service.ts`) that these exact field names are still read identically; Phase 6 preserved this contract byte-for-byte. **Unaffected by Phase 7** — this push mechanism only makes sense for `DirectOracleTransport`-mode hospitals in the first place (it pushes real DB credentials for a pool the backend creates itself); a `cloud_relay` hospital wouldn't use this flow at all once one exists (its Oracle credentials would live with the Connector instance, not the backend). No contract change needed *for Phase 7*; a real redesign of this flow is Phase 10 territory.
- **Deployment flows**: Vendor Portal has no deployment/provisioning concept today beyond config-push — confirmed by reading through all of `hospitals.service.ts` (765 lines) and `vendor-gateway.service.ts`. Phase 7 itself declares zero infrastructure changes ("Frontend changes: none," no IaC). **Unaffected — Phase 9 is the infrastructure phase, and even Phase 9 lists no Vendor Portal changes.**
- **Health-monitoring**: `vendor-gateway.controller.ts`'s `getSystemHealth()` calls HDSP's `/api/v1/vendor/query/system/health`. Direct read of `backend/src/modules/vendor-administration/controllers/vendor-query.controller.ts` shows this route **does not exist** — only `system/info` and `system/capabilities` are implemented. **This is a pre-existing gap that predates this entire migration, unrelated to Phase 6 or Phase 7** — flagged for awareness only, explicitly out of scope to fix here per your instruction to stay within Phase 7's documented boundaries.

**Classification: all four flows — Can wait / not applicable to Phase 7.** The `HIS_CONFIG_UPDATE` credential-push redesign is the one item worth tracking forward explicitly into Phase 10.

### 4. Does Vendor Portal need new deployment metadata (connector mode, connector endpoint, cloud connector status)?

**Not for Phase 7.** Confirmed via full read of `hospital.entity.ts` — no such fields exist, and Phase 7's pilot doesn't route through Vendor Portal's normal hospital-management flow (it's one manually-configured staging/test instance per Task 7.5's own description).

**Classification: Can wait until Phase 9/10.** This is squarely Task 10.4's job ("generates the credential a hospital's deployed Connector instance uses to authenticate") — that task is where `Hospital` (or its future cloud-era equivalent) would first need Connector-related columns.

### 5. Does Vendor Portal need to provision or manage connector instances for cloud deployments?

**Not for Phase 7**, and not clearly assigned to Vendor Portal at all by the roadmap even later. Phase 9's Task 9.1 (Connector Dockerfile) and Task 9.2 (ECS task definitions) are infrastructure-as-code, not Vendor Portal application code. Phase 10's Task 10.4 (pairing key generation) is described as part of `TenantProvisioningService`, which the roadmap places in the **HDSP backend** (`modules/platform/tenant-provisioning/**`, per Phase 10's "Files/modules affected"), not in `vendor-portal/`.

**Classification: Future enhancement / not yet assigned.** Worth flagging as a genuine open question for whoever owns Phase 10's design (does "provisioning" live in the HDSP backend, Vendor Portal, or a new tool?) rather than guessing — the roadmap doesn't resolve this, and I'm not going to invent an answer that isn't grounded in the document.

### 6. Does Vendor Portal need UI changes to distinguish Local Oracle vs. Cloud Connector?

**Not for Phase 7.** No production or even pilot traffic is customer-facing in Phase 7 ("No production traffic touches this yet," roadmap's own words) — there is exactly one staging/test hospital, manually managed, not something an admin needs a Vendor Portal UI to differentiate yet.

**Classification: Future enhancement**, realistically surfacing once Phase 10 makes Connector-paired cloud tenants a real, Vendor-Portal-visible category of hospital (i.e., once question 4's metadata exists, a UI to display it becomes meaningful).

### 7. Does any API contract between Vendor Portal and HDSP change because of Phase 7?

**No.** Confirmed by: Phase 7's own "API changes: none" statement; direct reading of every webhook payload shape and gateway query/command path Vendor Portal sends today; none reference Oracle transport mode, and `CloudOracleTransport` is an internal `IOracleTransport` implementation swap on the HDSP backend side only (mirrors exactly how `S3StorageProvider`/`SubscriptionLicenseProvider`/`CloudNotificationProvider` were pure backend-internal swaps in Phases 3-5, none of which touched Vendor Portal either).

**Classification: No change — not applicable.**

---

## Summary table

| Question | Required for Phase 7 | Can wait (Phase 9 / realistically Phase 10) | Future enhancement |
|---|---|---|---|
| Oracle-connectivity-is-local assumption in Vendor Portal | | ✅ (real gap, surfaces at Phase 10) | |
| Connector/CloudOracleTransport awareness | | ✅ (Task 10.4) | |
| Webhook/registration/licensing/deployment/health flows | | ✅ (`HIS_CONFIG_UPDATE` redesign, Phase 10) | |
| New deployment metadata (connector mode/endpoint/status) | | ✅ (Task 10.4) | |
| Vendor Portal provisions/manages Connector instances | | | ✅ (ownership not yet assigned by roadmap) |
| UI: Local Oracle vs. Cloud Connector | | | ✅ |
| API contract change | **No change of any kind** | | |

## Bottom line

**No Vendor Portal changes are required to start or complete Phase 7 as documented.** Phase 7 is a backend-internal provider swap (`CloudOracleTransport` behind the existing `IOracleTransport`) validated against one manually-configured pilot, with explicitly zero production traffic and zero API changes — consistent with every other "add a second provider" phase in this migration (3, 4, 5), none of which touched Vendor Portal either. The one real, concrete gap found (`testDbConnection()`/`oracle-test` assumes direct connectivity and would misbehave against a `cloud_relay` hospital) is real but not a Phase 7 blocker — it's correctly Phase 10's problem, once Vendor Portal actually needs to onboard a Connector-paired cloud tenant.
