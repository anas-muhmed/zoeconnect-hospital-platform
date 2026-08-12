# HDSP Hybrid Platform v1.0 — Architecture Baseline

**Status:** Architecture Complete
**Date:** 2026-07-16
**Branch:** `hybrid-architecture`

This document is the reference point for all future development on top of the hybrid architecture migration. It records what the 13-phase roadmap (`HDSP_Hybrid_Implementation_Roadmap.md`) set out to do, what was actually built, and — just as importantly — what was deliberately deferred and why. When a future task needs to know "is X already built, or is it deferred, or was it never in scope," this document plus the phase-specific `PHASE_*_IMPLEMENTATION_PLAN.md` files and `HYBRID_ARCHITECTURE_LOG.md` are the source of truth. `ARCHITECTURE_STATUS.md` remains the living, more-frequently-updated snapshot; this document is a point-in-time baseline, not intended to be edited as casually.

## What changed, in one sentence

HDSP went from a single self-hosted hospital application to one codebase that runs as **self-hosted**, **cloud-hosted**, or **hybrid** (hospital Connector + cloud services) — selected entirely through configuration (`DEPLOYMENT_MODE` and four independent provider-selection env vars), with zero forked code paths.

## Phase-by-phase summary

| Phase | Name | Status | What it delivered |
|---|---|---|---|
| 0 | Preparation | ✅ | `DEPLOYMENT_MODE` scaffolding (defined, unread — activation deferred to Phase 8), initial Tenant table. |
| 1 | Tenant Foundation | ✅ | `tenant_id` added across ~110 entities (Stage A, additive/nullable), then Stage B's tenant-resolution infrastructure (4 resolver strategies), `TenantScopedRepository` (dry-run mode), and per-module tenant-scoping across every Business module. |
| 2 | Infrastructure Abstraction | ✅ | Four Infrastructure interfaces (`IObjectStorageProvider`, `ILicenseProvider`, `INotificationTransport`, `IOracleTransport`) with exactly one bound implementation each (zero behavior change), plus a CI import-boundary guardrail. |
| 3 | Storage Providers | ✅ | `S3StorageProvider` (second `IObjectStorageProvider` impl), `STORAGE_DRIVER` mode-selection, tenant-prefixed object keys, MinIO-backed CI conformance suite. |
| 4 | Licensing Providers | ✅ | `SubscriptionLicenseProvider`, `LICENSE_PROVIDER_MODE` mode-selection, `ILicenseProvider` conformance suite. |
| 5 | Notification Providers | ✅ | `CloudNotificationProvider` (AWS SES/SNS), `NOTIFICATION_PROVIDER_MODE` mode-selection, conformance suite. |
| 6 | Connector | ✅ (sandbox-reachable scope) | `packages/oracle-client` extracted, Message Transport protocol, standalone `connector/` package with its own CI and versioning doc — builds and runs, nothing in production talks to it yet at the end of this phase. |
| 7 | Cloud Oracle Transport | ✅ (sandbox-reachable scope) | `CloudOracleTransport` (second `IOracleTransport` impl, relays through the Connector over Redis), `ORACLE_TRANSPORT` mode-selection, conformance suite, circuit-breaker/retry parity with `DirectOracleTransport`. |
| 8 | Multi-Tenancy Activation | ✅ (sandbox-reachable scope) | The architectural turning point: `tenantId`/`tenantSlug` on JWTs, `SubdomainTenantMiddleware`, `TenantScopeGuard` (staged rollout via `TENANT_SCOPE_GUARD_MODE`), tenant-scoped setup/widget flows, tenant-iterated cron jobs, `DEPLOYMENT_MODE`-keyed CORS. This is where HDSP actually becomes multi-tenant, not just multi-tenant-ready. |
| 9 | Cloud Deployment | ✅ (IaC written, unapplied) | Dockerfiles for backend/worker/frontend/Connector, ECS Fargate task definitions, full Terraform (RDS, ElastiCache, S3/CloudFront, ALB/WAF), `PROCESS_ROLE` API/worker split, `LOG_TO_STDOUT`/`REDIS_TLS` fixes, `CLOUD_DEPLOY.md` runbook. Two real gaps in the roadmap's own claims found and fixed (Redis TLS negotiation, production console logging). |
| 10 | Tenant Provisioning | ✅ (roadmap-literal scope) | A purpose-built, resumable 10-step provisioning pipeline (not built on `document-platform`'s workflow-engine, which turned out unsuitable), `SUPER_ADMIN`-only admin API, narrow pilot-rollback path. Two schema realities (global-unique Role/Permission, singleton Settings tables) forced documented reinterpretations of the spec's literal steps. |
| 11 | Feature Flags | ✅ (roadmap-literal scope) | `FeatureFlag` entity/service beneath module licensing, `@RequireFeature()`/`RequireFeatureGuard`, one real pilot migration (CMS emergency-broadcast — the "AI Assistant" example named in the roadmap doesn't exist as a real feature in this codebase), admin API. |
| 12 | CI/CD and Release Packaging | ✅ (roadmap-literal scope) | Hardened CI (`npm ci`, E2E smoke test), versioned image build/push (ECR + GHCR), cloud deploy automation with a manual production approval gate, a second self-hosted Docker-based deployment path, a formalized Backend/Connector compatibility matrix, an N-2 support-window policy. |

## Architectural decisions that shaped the whole migration

- **Provider abstraction, not a rewrite.** Every cloud capability (storage, licensing, notifications, Oracle transport) was added as a second implementation behind an existing or newly-introduced interface, selected by one env var, with the unset/default value always being byte-for-byte the pre-existing self-hosted behavior. This is why Phase 9's runbook could truthfully claim "no code change" for four of five deployment-mode flips.
- **Tenant resolution is layered, not monolithic.** Four distinct resolver strategies (session-JWT, Oracle/HIS-derived, chain/branch-derived, subdomain-derived) cover every entry point into the system, because no single mechanism could — a kiosk token flow, an HIS-login-derived session, and a browser hitting `hospital.hdsp.cloud` all need tenant identity resolved differently.
- **The Connector is architecturally separate, not a backend feature.** Its own package, own CI, own versioning discipline, own compatibility matrix — deliberately decoupled so a hospital's on-prem Oracle connectivity component can evolve independently of the cloud backend's release cadence.
- **Roadmap-literal discipline, with forks surfaced, not silently resolved.** At every point where the roadmap's stated scope diverged from a broader, tempting alternative (Phase 6's capability-interfaces question, Phase 10's SaaS-operations-layer vision, Phase 11's infra-toggle framing), the fork was raised explicitly rather than picked unilaterally. This kept every phase's actual surface area matching its roadmap entry, and kept the broader ideas from being lost — they're recorded, not discarded.

## Known deferred items

Nothing below was overlooked — each is a deliberate scope boundary, recorded at the phase that found it, with its own reasoning.

**Product/operational capabilities deferred at Phase 10** (`PHASE_10_DEFERRED_BACKLOG.md`): Vendor Portal self-service onboarding, full tenant lifecycle management (suspend/reactivate/rename/delete — today only a narrow pilot-rollback `deprovision()` exists), Connector fleet management (including actually consuming the Phase 10 pairing-key credential — no protocol-level handshake exists yet), subscription lifecycle automation, secret/credential rotation tooling, operational dashboards, and genuine per-tenant Roles/Permissions/Settings (currently global singletons by schema design).

**Deferred at Phase 11:** percentage-based gradual feature-flag rollout (field exists, not evaluated), frontend flag-aware UI and admin management UI (backend-only this phase), any infrastructure/provider-selection toggle (explicitly kept out of the Feature Flag system by design, per the user's own recorded decision).

**Deferred at Phase 12:** a live connect-time compatibility handshake between a running backend and Connector (today's check is install/deploy-time only), automated release-notes generation, telemetry to actually measure the self-hosted install-base's version distribution.

**Explicitly out of scope for the entire migration** (per the roadmap's own boundaries, reaffirmed at multiple phases): monitoring/observability, Kubernetes, performance optimization, auto-scaling. These are valuable but distinct from what a hybrid-architecture and release-packaging migration set out to do.

## Environment verification still required

This entire migration was implemented in a sandbox with no real Oracle instance, no real AWS account, no real multi-tenant traffic, and no real GitHub Actions runner. Every phase has been reasoned through carefully and, where testable, verified against mocked dependencies or conformance suites — but nothing here should be treated as verified against production-representative infrastructure. `ARCHITECTURE_STATUS.md`'s "Outstanding environment verification" section holds the full, itemized list (14 items as of Phase 12); the two highest-priority follow-ups are:

1. **Real-Oracle parity** for `packages/oracle-client` and the full Phase 10 provisioning flow — neither has run against a live Oracle instance or a live cloud Postgres/Connector.
2. **A real first release through the Phase 12 pipeline** — OIDC roles, repository secrets, GitHub Environment protection rules, and `.tfvars` files all need one-time manual setup (listed in `PHASE_12_IMPLEMENTATION_PLAN.md`'s pilot note) before `build-images.yml`/`deploy-cloud.yml`/`install.sh` can be trusted for a real hospital.

## Next major milestone

Per the roadmap's own framing, the remaining work from here is **real-world validation**, not more architecture: exercising this pipeline against the actual office environment, a real staging cloud account, and a first pilot tenant. That shifts the nature of the work from architecture decisions to deployment, testing, and operational hardening — a different kind of effort than the 13 phases this document summarizes.
