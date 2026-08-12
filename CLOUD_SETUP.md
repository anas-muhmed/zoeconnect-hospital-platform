# HDSP — Cloud (AWS) Deployment Guide

**Audience:** DevOps/cloud engineers standing up the multi-tenant SaaS environment.

> **This describes a target architecture, not a running environment.** Every AWS resource, workflow, and procedure below is written and present in the repository (`infrastructure/terraform/`, `infrastructure/ecs/*.json`, `.github/workflows/deploy-cloud.yml`, `CLOUD_DEPLOY.md`) but **has never been applied against a real AWS account**. `CLOUD_DEPLOY.md` states this explicitly: *"Not attempted in this sandbox. No real AWS account, credentials, or DNS zone exist here."* This document is written as production-readiness documentation for when that changes, and every section flags implemented-but-unvalidated vs. genuinely missing pieces. The environment actually running today is the self-hosted-pattern OCI demo server (`OCI_DEMO_DEPLOYMENT.md`), which does not exercise anything in this document.

---

## 1. AWS Architecture Overview

Source of truth: `infrastructure/terraform/` (ALB, CloudFront, ECR, ECS, ElastiCache, RDS, S3, WAF, Secrets Manager, IAM). `infrastructure/ecs/*.json` are hand-kept reference task definitions — Terraform's `ecs.tf` is the actual deploy source; a documented drift risk exists between the two (see §9).

```
Internet → Route53/DNS (manual, no automation) → CloudFront (static assets) + ALB (dynamic, wildcard host rule)
         → WAF (attached to ALB) → ECS Fargate (API, Worker, Frontend services)
         → RDS Postgres (Multi-AZ) + ElastiCache Redis + S3 (uploads)
         → Connector (per-hospital, edge-deployed, outside this VPC) → hospital's on-prem Oracle HIS
```

## 2. ALB (Application Load Balancer)

`infrastructure/terraform/alb.tf` — a single ALB with a **wildcard host-header rule**:
```hcl
condition {
  host_header {
    values = ["*.${var.cloud_base_domain}", var.cloud_base_domain]
  }
}
```
One rule matches every tenant subdomain; routing is split only by path — `/api/*` (priority 100) → backend target group, everything else (priority 200) → frontend target group. This is deliberately **not** per-tenant target groups/rules — tenant identity is resolved inside the application (`SubdomainTenantMiddleware` reading the `Host` header), not by the ALB. **Status: written, not applied.**

## 3. ECS (Elastic Container Service, Fargate)

Four task families defined (`infrastructure/terraform/ecs.tf`, mirrored by `infrastructure/ecs/*.json`):

| Service | CPU / Memory | Desired count | Scaling notes | Health check |
|---|---|---|---|---|
| `hdsp-api` | 512 / 1024 | ≥2, rolling deploy (`minimumHealthyPercent=100`, `maximumPercent=200` — zero-downtime) | Safe to scale beyond 2; stateless HTTP | `curl /api/health/live`, 30s interval |
| `hdsp-worker` | 512 / 1024 | **Capped at 1** | Explicitly documented constraint: `@nestjs/schedule`'s in-process `@Cron` jobs have no distributed lock — running >1 worker would double-execute scheduled jobs. Bull queue *consumers* are separately noted as safe to scale >1 (Bull's per-job Redis lock handles concurrency correctly) — the constraint is specifically about the cron scheduler, not the queue consumers | None defined — worker never calls `app.listen()`, ECS falls back to container-alive status |
| `hdsp-frontend` | 256 / 512 | Scalable | Stateless Next.js SSR | `curl /` on 3000, 30s interval |
| `hdsp-connector` | 256 / 512 | N/A — one per hospital, not a cloud VPC service | Marked in its own task-definition comment as "provided for completeness only... not wired into any Terraform service" — the Connector runs at the hospital's network edge, not inside this ECS cluster | `curl /health` on 4100 |

Both `hdsp-api` and `hdsp-worker` run the **identical** `hdsp-backend` image, distinguished only by the `PROCESS_ROLE` environment variable (`worker` on the worker task; unset/`all` on the API task per the API task definition's own note). This is the practical meaning of "one image, two roles" referenced throughout the codebase's architecture notes.

## 4. RDS (PostgreSQL)

`infrastructure/terraform/rds.tf` — provisions RDS Postgres. Multi-AZ is a configuration flag (`rds_multi_az` var, referenced in `CLOUD_DEPLOY.md`'s production-cutover checklist as something to confirm `true` before go-live, alongside `deletion_protection`) — **not confirmed enabled by default in the base `.tfvars`**; treat Multi-AZ as something to explicitly set per environment, not an automatic guarantee. Same shared-schema, `tenant_id`-column tenancy model as self-hosted (no schema-per-tenant, no database-per-tenant) — RDS is a hosting change, not an isolation-model change.

## 5. ElastiCache (Redis)

`infrastructure/terraform/elasticache.tf` — provisions ElastiCache Redis, referenced by `hdsp/elasticache-connection` in Secrets Manager (`secrets.tf`, Terraform-derived, not a placeholder). `REDIS_TLS=true` is expected in cloud mode (matches ElastiCache's `transit_encryption_enabled`). Used for the same purposes as self-hosted Redis (JWT blacklist, session activity, cache, BullMQ queues) — **plus the same documented gap**: the app's rate limiter does not use Redis-backed throttler storage, so per-instance in-memory counters still apply even at cloud scale (each ECS task has its own counters).

## 6. S3 + CloudFront

- S3 (`infrastructure/terraform/s3.tf`): backs `STORAGE_DRIVER=s3` (`S3StorageProvider`, tenant-prefixed object keys — `<tenantId>/...`). Bucket name surfaced to the app via the `hdsp/app-config` Secrets Manager entry (`s3Bucket` key), Terraform-derived, not a manual placeholder.
- CloudFront (`infrastructure/terraform/cloudfront.tf`): fronts static assets. Exact origin configuration (S3 vs. the frontend ECS service, or both) is defined in this file — verify current cache-behavior rules against the file directly before relying on this summary for a real deploy, since CDN cache-invalidation strategy is not otherwise documented anywhere in this repository.

## 7. WAF

`infrastructure/terraform/waf.tf` — attached to the ALB. Rule specifics (managed rule groups, rate-based rules, IP reputation lists) are defined in this file; the production-cutover checklist in `CLOUD_DEPLOY.md` calls out "WAF confirmed attached" as a go-live gate item, implying it is not automatically guaranteed to be attached in every apply — verify explicitly per environment.

## 8. Terraform

Directory: `infrastructure/terraform/` — `alb.tf`, `cloudfront.tf`, `ecr.tf`, `ecs.tf`, `elasticache.tf`, `outputs.tf`, `providers.tf`, `rds.tf`, `s3.tf`, `secrets.tf`, `variables.tf`, `waf.tf`, plus a `README.md`. Does **not** create a VPC — an existing VPC with public+private subnets is a prerequisite (`README.md`). Standard flow:
```bash
cd infrastructure/terraform
terraform init
terraform plan  -var-file=staging.tfvars     # create from variables.tf first — not committed
terraform apply -var-file=staging.tfvars
```
Creates: RDS, ElastiCache, S3+CloudFront, ECR repos, the ECS cluster (empty services until images are pushed), ALB + target groups + listener rules, WAF, IAM roles, CloudWatch log groups, and Secrets Manager secret **shells** (see §11 — some are real Terraform-derived values, some are `REPLACE_ME` placeholders requiring manual population).

## 9. Container Registry / Image Publishing

Two registries, two purposes (`.github/workflows/build-images.yml`):
- **ECR** (private) — every push to `main` and every version tag builds and pushes `backend`/`frontend`/`connector` images, tagged `<version>` and (for real releases only) `latest`. This is the cloud/ECS deploy path.
- **GHCR** (public, `ghcr.io/<owner>/hdsp-*`) — only for tagged releases (`is_release == 'true'`), for the self-hosted installer path, authenticated via the workflow's own `GITHUB_TOKEN` (no extra secret needed). Rationale quoted from the workflow: *"a hospital installer should only ever see real, numbered releases, never a `0.0.0-<sha>` dev build."*

Build context for all three images is the **monorepo root** (not the subdirectory) because the Dockerfiles resolve `file:` workspace-package dependencies — a common mistake to avoid when scripting a manual build. AWS auth uses OIDC (`aws-actions/configure-aws-credentials` with `secrets.AWS_ECR_PUSH_ROLE_ARN`), not long-lived access keys.

A **version manifest** is also generated and uploaded as a build artifact: `hdspVersion`, `connectorVersion` (from `connector/package.json`), `minCompatibleConnectorVersion` (from `connector/COMPATIBILITY.json`), and `schemaVersion` (latest migration filename prefix) — useful for confirming exactly what's deployed.

## 10. GitHub Actions — Deployment Flow

`deploy-cloud.yml` — **manual `workflow_dispatch` only**, requiring a `version` input. Explicit rationale in the workflow: *"NOT automatically on every image build, because 'which released version goes to production, and when' is an operational/business decision, not a CI event."*

Two sequential jobs, gated by **GitHub Environments** (not `if:` conditionals):
1. **deploy-staging** (`environment: staging`) — OIDC via `secrets.AWS_DEPLOY_ROLE_ARN`, `terraform apply -var-file=staging.tfvars -var="api_image_tag=<version>"` (same tag applied to api/worker/frontend), captures the ALB DNS name output, smoke-tests `/api/v1/health/live` (30 retries × 10s).
2. **deploy-production** (`needs: deploy-staging`, `environment: production`) — same flow against `production.tfvars`. The **required-reviewer approval gate lives in GitHub repository settings** (the "production" Environment's protection rules), not expressible in the YAML itself — this must be configured once your own Git server/CI is stood up, since environment-protection semantics vary by provider (see `GIT_WORKFLOW.md`).

This is the closest thing in the repository to a rolling/blue-green deployment mechanism: ECS's own rolling-update behavior (`minimumHealthyPercent`/`maximumPercent` on the API service) provides zero-downtime rolling deploys; there is **no separate blue/green (CodeDeploy) configuration** — `ecs.tf` should be checked directly if true blue/green (traffic-shifted, instant-rollback) deployment is required, as it is not confirmed present in this pass.

## 11. Environment Variables and Secrets

Non-sensitive config is set as plaintext `environment` blocks in the ECS task definitions (Terraform's `local.common_environment` in `ecs.tf` is the real source; the hand-kept JSON files in `infrastructure/ecs/` can drift — a mismatch was found where `worker-task-definition.json` references a nonexistent `hdsp/s3` secret while the API task/Terraform correctly use `hdsp/app-config:s3Bucket`, a concrete example of this drift risk). Sensitive config is injected via ECS `secrets` blocks referencing Secrets Manager ARNs, populated into the container's environment at task start by the ECS execution role (standard AWS pattern) — **the application itself never calls the Secrets Manager SDK at runtime** (confirmed: no `@aws-sdk/client-secrets-manager` import anywhere in `backend/src`); it only ever reads plain `process.env`, same as self-hosted.

Secret shells provisioned by `secrets.tf`:

| Secret | Populated by | Status |
|---|---|---|
| `hdsp/rds-connection` | Terraform (generated password, real endpoint) | Live once applied |
| `hdsp/elasticache-connection` | Terraform (host/port/authToken/connectorUrl) | Live once applied |
| `hdsp/jwt` (`secret`, `refreshSecret`, `vendorPortalApiKey`) | **Manual** — Terraform writes `REPLACE_ME_BEFORE_FIRST_DEPLOY` placeholders with `lifecycle.ignore_changes` so re-applies never overwrite a real value | Must populate before first deploy |
| `hdsp/aws-notifications` (SES/SNS creds) | Manual | Must populate if `NOTIFICATION_PROVIDER_MODE=cloud` |
| `hdsp/app-config` (`s3Bucket`, `cloudBaseDomain`) | Terraform | Live once applied |
| `hdsp/connector-oracle-<tenant-code>` | Manual, out-of-band, per-tenant (Phase 10) | Not automated |

The four provider-selection env vars that flip together for cloud mode (`STORAGE_DRIVER=s3`, `ORACLE_TRANSPORT=cloud_relay`, `LICENSE_PROVIDER_MODE=subscription`, `NOTIFICATION_PROVIDER_MODE=cloud`), plus `DEPLOYMENT_MODE=cloud`, `REDIS_TLS=true`, and `LOG_TO_STDOUT=true`, are already baked into the ECS task definitions/Terraform as the target configuration — no code changes are required to flip them; this is purely configuration, by design (`ARCHITECTURE_STATUS.md`'s provider-abstraction pattern).

**Note:** `LICENSE_PROVIDER_MODE=subscription` is code-complete but reads from a `subscription_licenses` table that **has no writer** — no Stripe/billing integration exists anywhere in the codebase. This mode is not production-usable for real billing today despite being wired into the cloud environment template.

## 12. Scaling

- API service: horizontally scalable, stateless, rolling-deploy safe (`desiredCount` ≥2 recommended).
- Worker service: **hard-capped at 1 task** due to the undistributed cron-lock limitation (§3). Scaling this requires either adding a distributed lock (e.g., Redis-based) around `@Cron` handlers, or splitting cron-only concerns from Bull-consumer concerns into separate deployables — neither exists in code today.
- Frontend: stateless, horizontally scalable.
- Database: RDS vertical scaling (instance class) and read replicas are standard RDS capabilities but no read-replica Terraform resource or read/write-split code was found — the application always talks to a single connection (§4).

## 13. Disaster Recovery

**Largely unimplemented; this is the weakest area of the cloud architecture.** No backup automation, no documented RPO/RTO, no cross-region replication, and no AWS Backup/RDS-automated-snapshot Terraform resource were found anywhere in `infrastructure/terraform/`. `CLOUD_DEPLOY.md` itself has zero mentions of "backup." The production-cutover checklist mentions only a generic "DR drill (AZ failure simulation) completed" as a go-live gate — described as a requirement, not something automated by this codebase. Before any real tenant is provisioned onto this architecture, DR planning (RDS automated backups/snapshots, cross-AZ failover testing, and a documented RTO/RPO target) needs to be built — treat this as new work, not configuration.

## 14. Monitoring

- CloudWatch Logs: all four ECS services use the `awslogs` log driver (`/ecs/hdsp-{api,worker,frontend,connector}` log groups, per-service stream prefixes) — this is real and Terraform-provisioned.
- Health checks: ALB target-group health checks point at `/api/health/live` (API) and `/` (frontend); ECS container-level health checks are also defined per task (§3 table).
- **No CloudWatch Alarms, dashboards, or metric-based autoscaling policies were found in `infrastructure/terraform/`** — logs are captured, but nothing in this repository alerts on them or scales based on them. This is a gap to close before production use, not an existing capability to document further.

## 15. Deployment Flow (end to end, first deploy)

1. `terraform apply` (provisions everything empty/shell-state per §8).
2. Populate `hdsp/jwt` and `hdsp/aws-notifications` secrets manually (§11).
3. Build and push images to ECR (§9), tagged with a real version.
4. Run database migrations once against RDS from a one-off task or bastion (`DB_HOST=<rds-endpoint> ... npm run migration:run --prefix backend`).
5. Point DNS: `CNAME *.staging.<domain> → <alb_dns_name>` and `CNAME staging.<domain> → <alb_dns_name>` (or an ALIAS record if using Route53).
6. Seed at least one real `Tenant` row with a non-null `subdomain` for a first smoke test — `CLOUD_DEPLOY.md` is explicit that this is a one-off pilot step, not a provisioning-flow substitute (real tenant provisioning is the Vendor Portal → `TenantProvisioningService` flow, Phase 10).
7. Re-run `terraform apply` with the real image tags (or `aws ecs update-service --force-new-deployment`) to roll the new images out.
8. Verify per the checklist in `CLOUD_DEPLOY.md` §9 (health endpoints, tenant-subdomain routing, JWT tenant claims, `TenantScopeGuard` log-only output, S3 round-trip, SES/SNS test send, ECS console confirms worker/API role split, CloudWatch Logs populated, full regression suite re-run).
9. Production cutover only after staging runs clean for a representative period, with separate `production.tfvars`, separate ACM cert/DNS, separate Secrets Manager values (never share JWT secrets between staging and production), `rds_multi_az=true` and `deletion_protection` confirmed, WAF confirmed attached, and a DR drill completed.

## 16. What Already Exists vs. What Requires Real Validation

**Exists and is real (code/IaC complete):**
- Full Terraform for ALB, ECS (4 task families), RDS, ElastiCache, S3, CloudFront, WAF, Secrets Manager, IAM, CloudWatch log groups.
- Working CI/CD: image build+push to ECR/GHCR (`build-images.yml`), manual-dispatch staging→production Terraform deploy with environment gating (`deploy-cloud.yml`).
- Application-level multi-tenant support: `SubdomainTenantMiddleware`, tenant-scoped CORS, `PROCESS_ROLE` api/worker split, all four provider abstractions (storage/Oracle-transport/licensing/notifications) switchable purely by env var with no code changes.
- Health/readiness/liveness endpoints wired to ALB and ECS health checks.

**Implemented but never validated against real infrastructure:**
- The entire deployment (never applied to a real AWS account, per `CLOUD_DEPLOY.md`'s own admission).
- Multi-AZ RDS and WAF attachment (configuration flags to set, not defaults confirmed on).
- The full staging→production smoke-test/verification checklist (written, never executed for real).
- Worker/API `PROCESS_ROLE` split — code exists but is described elsewhere in this doc set as an "incomplete split" (Bull consumers still run in both roles today, not fully separated).

**Missing / not implemented at all:**
- Disaster recovery automation (backups, cross-AZ/region failover, RPO/RTO).
- CloudWatch Alarms, dashboards, autoscaling policies.
- Billing/Stripe integration behind `LICENSE_PROVIDER_MODE=subscription`.
- Distributed locking to allow the worker service to scale beyond 1 task.
- DNS automation (Route53 records are a manual step per §15.5 — no Terraform `aws_route53_record` resource was found for tenant subdomains).
- True blue/green (CodeDeploy-style) deployment — only ECS rolling updates are confirmed.
