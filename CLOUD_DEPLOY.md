# HDSP — Cloud Deployment Runbook (Phase 9, Task 9.8)

> **Environment**: AWS ECS Fargate · RDS Postgres (Multi-AZ) · ElastiCache Redis · S3 + CloudFront · ALB + WAF
> **Companion to**: `DEPLOY.md` (self-hosted/PM2 runbook — still the correct doc for on-prem installs), `infrastructure/terraform/README.md`, `PHASE_9_IMPLEMENTATION_PLAN.md`
>
> **This is the target production architecture, not a running environment.** As stated below, this has never been applied against a real AWS account. The environment actually running today is a self-hosted-pattern demo box on Oracle Cloud Infrastructure — see `OCI_DEMO_DEPLOYMENT.md`. Do not confuse the two when discussing "the cloud deployment" with prospects or stakeholders.

This is the first environment where all four provider selections flip to their cloud variant together (`STORAGE_DRIVER=s3`, `ORACLE_TRANSPORT=cloud_relay`, `LICENSE_PROVIDER_MODE=subscription`, `NOTIFICATION_PROVIDER_MODE=cloud`), plus `DEPLOYMENT_MODE=cloud`. Per the roadmap's own instruction for this task, validate the full stack in **staging** before production — never flip an untested combination directly in production.

**Not attempted in this sandbox.** No real AWS account, credentials, or DNS zone exist here — this runbook is unverified against real infrastructure, consistent with this project's standing practice of not fabricating verification that didn't happen (same posture as Phase 6/7's real-Oracle checks). Treat every step below as a documented plan, not a confirmed-working procedure, until someone runs it for real.

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| AWS account + credentials | With permission to create the resources in `infrastructure/terraform/` |
| A registered domain | For `CLOUD_BASE_DOMAIN` (e.g. `hdsp.example.com`) — tenant subdomains resolve under it |
| ACM certificate | Covering `*.${CLOUD_BASE_DOMAIN}` and the apex, DNS-validated, **before** `terraform apply` (see `variables.tf`'s `acm_certificate_arn`) |
| Existing VPC | With public + private subnets — `infrastructure/terraform/` does not create one, see its `README.md` |
| Docker | To build the four images in `infrastructure/docker/` |
| Oracle Instant Client zip | Only if you plan to run a Connector instance in this environment (rare — see `infrastructure/docker/connector.Dockerfile`'s note; the Connector normally runs at the hospital edge, not in this cloud VPC) |

---

## 2. Provision infrastructure

```bash
cd infrastructure/terraform
terraform init
terraform plan  -var-file=staging.tfvars   # create staging.tfvars from variables.tf first
terraform apply -var-file=staging.tfvars
```

This creates: RDS, ElastiCache, S3 + CloudFront, ECR repos, the ECS cluster (with 3 empty-ish services until images are pushed), ALB + target groups + listener rules, WAF, IAM roles, CloudWatch log groups, and Secrets Manager secret *shells*.

## 3. Populate secrets

Terraform intentionally leaves some Secrets Manager values as `REPLACE_ME` placeholders (see `secrets.tf`'s comments — it does not commit real credentials). Before the first deploy, populate:

```bash
# JWT secrets — generate exactly like DEPLOY.md's self-hosted runbook does,
# NEVER reuse a self-hosted install's secret here:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

aws secretsmanager put-secret-value --secret-id hdsp/jwt --secret-string '{
  "secret": "<64-char-hex>",
  "refreshSecret": "<different-64-char-hex>",
  "vendorPortalApiKey": "<a third, different 64-char-hex -- Cloud Tenant
    Onboarding's shared secret. Vendor Portal must be configured with this
    exact value (its own HDSP_PROVISIONING_API_KEY env var, once Cloud
    Tenant Onboarding Phase B implements the consuming side) to call
    POST /platform/tenant-provisioning/provision -- see
    CLOUD_TENANT_ONBOARDING_DESIGN.md and VendorPortalApiKeyGuard>"
}'

aws secretsmanager put-secret-value --secret-id hdsp/aws-notifications --secret-string '{
  "accessKeyId": "<IAM-user-scoped-to-ses:SendEmail+sns:Publish>",
  "secretAccessKey": "<...>",
  "sesFromEmail": "<a verified SES identity>"
}'
```

`hdsp/rds-connection`, `hdsp/elasticache-connection`, and `hdsp/app-config` are already populated by Terraform (generated passwords, real endpoints) — no manual step needed for those.

## 4. Build and push images

Build context is the **monorepo root** for every image (see each Dockerfile's own comment on why):

```bash
cd /path/to/HDSP_HYBRID
ACCOUNT_ID=<...>; REGION=<...>
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

docker build -f infrastructure/docker/backend.Dockerfile  -t $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/hdsp-backend:$(git rev-parse --short HEAD) .
docker build -f infrastructure/docker/frontend.Dockerfile -t $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/hdsp-frontend:$(git rev-parse --short HEAD) \
  --build-arg NEXT_PUBLIC_API_URL=https://staging.${CLOUD_BASE_DOMAIN} .
# No DEPLOYMENT_MODE build-arg here anymore (single-source-of-truth fix,
# 2026-07-20): the frontend used to bake DEPLOYMENT_MODE into a
# NEXT_PUBLIC_* var at `next build` time, a second copy of Section 8's
# runtime value that silently went stale if a running image/process
# outlived a DEPLOYMENT_MODE change -- this is what caused a real
# cross-tenant bug (login page showing the self-hosted-only Vendor
# Connection card on a cloud tenant). The frontend now reads deployment
# mode live from the backend's GET /license/status at runtime, so
# Section 8's DEPLOYMENT_MODE=cloud on the backend/worker ECS tasks is
# the only place this is ever set.

docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/hdsp-backend:$(git rev-parse --short HEAD)
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/hdsp-frontend:$(git rev-parse --short HEAD)
```

The **same** `hdsp-backend` image serves both the `hdsp-api` and `hdsp-worker` ECS services — only `PROCESS_ROLE` differs (see `app.config.ts`'s `processRole` doc comment and `infrastructure/ecs/worker-task-definition.json`).

Then either re-run `terraform apply -var api_image_tag=<tag> -var worker_image_tag=<tag> -var frontend_image_tag=<tag>`, or update the ECS services directly (`aws ecs update-service --force-new-deployment`) once a proper CI/CD pipeline exists (Phase 12 — this is a manual step until then).

## 5. Run database migrations

RDS is provisioned with an empty schema (Task 9.3's own note: "RDS is provisioned with the schema Phase 1 already defined" — meaning the migrations define it, not a seed script). Run once, from a one-off ECS task or bastion with a route to RDS:

```bash
DB_HOST=<rds_endpoint from terraform output> DB_PORT=5432 DB_NAME=hdsp_db DB_USER=hdsp_app DB_PASSWORD=<from Secrets Manager> \
  npm run migration:run --prefix backend
```

## 6. Point DNS

```
CNAME  *.staging.hdsp.example.com  ->  <alb_dns_name from terraform output>
CNAME  staging.hdsp.example.com    ->  <alb_dns_name from terraform output>
```

(Or an ALIAS/A record if using Route53 with the ALB as an alias target — cheaper, no CNAME-at-apex issue.)

## 7. Seed at least one real Tenant with a subdomain

Phase 8's subdomain resolution (`SubdomainTenantMiddleware`, Task 8.2) and cloud CORS (Task 8.7) both need a real `Tenant` row with a non-null `subdomain` to exercise anything beyond the `'default'` fallback path. This is deliberately **not** a Phase 9 concern — tenant creation is Phase 10 — but a first staging smoke test needs at least one to prove the routing/CORS/tenant-scope chain actually works end to end, not just that it degrades gracefully to `'default'`. Insert one directly for this pilot smoke test only; do not build a provisioning flow here (that's Phase 10).

## 8. Flip the four provider selections + DEPLOYMENT_MODE

Already baked into `infrastructure/ecs/api-task-definition.json` / `worker-task-definition.json` (and `ecs.tf`'s `local.common_environment`) as the target configuration:

```env
DEPLOYMENT_MODE=cloud
STORAGE_DRIVER=s3
ORACLE_TRANSPORT=cloud_relay
LICENSE_PROVIDER_MODE=subscription
NOTIFICATION_PROVIDER_MODE=cloud
REDIS_TLS=true
LOG_TO_STDOUT=true
PROCESS_ROLE=worker   # worker service only — api service leaves this unset ('all') until both services are confirmed healthy, see the _process_role_note in api-task-definition.json
```

No code changes are needed to flip any of these — every one is a Phase 3-8 mode-selection env var, all defaulting to self-hosted's exact pre-existing behavior when unset. That is the entire point of the provider-abstraction work done in Phases 3-8: this step is configuration, not a code change.

**Cloud Tenant Onboarding's `VENDOR_PORTAL_API_KEY`** (see
`CLOUD_TENANT_ONBOARDING_DESIGN.md`) is *not* a plain env var to flip here
— it's already wired as a Secrets Manager reference in `ecs.tf`'s
`common_secrets` (sourced from `hdsp/jwt`'s `vendorPortalApiKey` field),
same treatment as `JWT_SECRET`. It only needs the manual population step
in Section 3 above; nothing to add to the plain-env-var block here.

`DEPLOYMENT_MODE` above is now the **only** place deployment mode is set
(single-source-of-truth fix, 2026-07-20). There is no separate frontend
`NEXT_PUBLIC_DEPLOYMENT_MODE` build-time value anymore -- the frontend
reads deployment mode live from the backend's `GET /license/status` at
runtime instead, so Section 4's frontend image build no longer takes a
`DEPLOYMENT_MODE` build-arg at all. One env var, set once, on the
backend/worker ECS tasks; every consumer (backend config, frontend) reads
it from there.

## 9. Verify

```
[ ] curl https://staging.<CLOUD_BASE_DOMAIN>/api/health          → 200, all indicators healthy
[ ] curl https://staging.<CLOUD_BASE_DOMAIN>/api/health/live      → 200
[ ] curl https://<tenant-subdomain>.staging.<CLOUD_BASE_DOMAIN>/  → frontend loads
[ ] Login works; JWT contains tenantId/tenantSlug claims (Phase 8 Task 8.1)
[ ] TenantScopeGuard logs (log-only mode) show no unexpected cross-tenant mismatches
[ ] File upload round-trips through S3 (not local disk)
[ ] A test notification sends via SES/SNS (not the local/stub path)
[ ] ECS console shows hdsp-worker task running, hdsp-api NOT running any cron (once PROCESS_ROLE=api is set on the API service per step 8's note)
[ ] CloudWatch Logs show output for all three services (Task 9.7)
[ ] Full regression suite (every prior phase's testing checklist) re-run against this environment, not just locally — roadmap's own Task 9's testing checklist requirement
```

## 10. Production cutover

Only after staging has run clean for a representative period. Follows standard blue/green or canary practice — kept out of detailed prescription here per the roadmap's own text ("a one-time infrastructure event better covered by a dedicated cutover runbook, not this application-focused roadmap"). At minimum: separate `production.tfvars`, separate ACM cert/DNS, separate Secrets Manager values (never share JWT secrets between staging and production), `rds_multi_az=true` and `deletion_protection` confirmed on, WAF confirmed attached, DR drill (AZ failure simulation) completed per the roadmap's testing checklist before any real tenant is provisioned onto it — Phase 10 is explicitly the *next* phase, not bundled here.

---

## What this runbook deliberately does not cover

Per the user's explicit Phase 9 boundary: tenant onboarding UI/workflow, connector pairing/provisioning ownership, Vendor Portal changes, customer registration flows (all Phase 10), and CI/CD automation (Phase 12, still a manual `docker build`/`terraform apply`/`aws ecs update-service` process here, same spirit as `DEPLOY.md`'s manual `git pull`/`pm2 reload` for self-hosted).
