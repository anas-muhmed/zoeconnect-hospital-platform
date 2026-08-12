# HDSP — Infrastructure Architecture Guide

**Purpose:** document every deployment topology this codebase supports, and clearly mark which ones are actually running versus written-but-unapplied. This guide complements `HDSP_Current_Architecture_Analysis.md` (application-level architecture) with an infrastructure-first view.

**Status legend used throughout:**
- 🟢 **LIVE** — actually running today.
- 🟡 **PATTERN, LIVE ELSEWHERE** — this exact pattern runs somewhere (e.g. self-hosted at a real hospital, or the OCI demo), even if this specific document's example isn't a named running instance.
- 🔴 **WRITTEN, NOT APPLIED** — exists as code/IaC, never deployed to real infrastructure.

---

## A. Developer Local Machine 🟡

```
Developer laptop
      │
   Docker (Postgres + Redis only — Oracle HIS is explicitly NOT containerized)
      │         └── infrastructure/docker-compose.yml
      │
      ├── Backend (NestJS, `npm run start:dev`, port 3001, hot reload)
      │
      ├── Frontend (Next.js, `npm run dev`, port 3000, proxies /api/* → backend)
      │
      ├── Postgres 15-alpine (localhost:5432, seeded by infrastructure/postgres/init.sql)
      │
      ├── Redis 7-alpine (localhost:6379)
      │
      └── Oracle (optional, only for HIS-integration work; local instance or
                   remote test HIS; ORACLE_MODE=thick needs Instant Client,
                   ORACLE_MODE=thin does not; platform degrades gracefully
                   with Oracle unreachable — not required to develop most features)
```
Source: `infrastructure/docker-compose.yml`, `DEVELOPMENT_SETUP.md`. This is the standard day-to-day dev environment for every engineer.

---

## B. Hospital Self-Hosted 🟡 (pattern is live — the OCI demo server, topology C, is one instance of it)

```
Internet
   │
Firewall (UFW: default-deny inbound, allow 22/80/443 only)
   │         source: scripts/setup.sh
   │
Nginx (TLS termination, path-based routing, rate-limit zones,
       security headers, single fixed hostname)
   │         source: infrastructure/nginx/{nginx.conf,hdsp.conf}
   │
   ├── /api/*, /api/v1/auth/login, /socket.io/* ──► Backend (NestJS, PM2 cluster
   │                                                  mode ×2, or Docker container,
   │                                                  port 3001)
   │
   └── / ──────────────────────────────────────────► Frontend (Next.js, PM2 fork
                                                        mode ×1, or Docker container,
                                                        port 3000)

Backend also connects to:
   ├── PostgreSQL 15 (bare-metal via apt, or Docker container — localhost only)
   ├── Redis 7 (bare-metal, hardened with bind 127.0.0.1 + requirepass, or Docker container)
   └── Oracle HIS (hospital's own on-prem Oracle instance, ORACLE_TRANSPORT=direct,
                    direct network dial from the backend process)
```
Source: `SELF_HOSTED_SETUP.md`, `DEPLOY.md`, `scripts/setup.sh`, `infrastructure/pm2/ecosystem.config.js`, `infrastructure/docker/docker-compose.selfhosted.yml`. Single implicit tenant per install (`Tenant.code = 'default'`). Two supported process-management paths (PM2 or Docker Compose) exist for the backend/frontend layer; a given install uses one, not both.

---

## C. OCI Demo Server 🟢 LIVE (the only cloud-hosted environment actually running today)

```
Internet
   │
Public IP address only (no DNS/domain attached)
   │
Oracle Cloud Infrastructure — single Compute VM
   │         (administered via SSH as the `opc` user)
   │
Nginx (running on the VM itself — same routing pattern as topology B,
       path-based, single hostname/IP treated as server_name)
   │
   ├── /api/*, /socket.io/* ──► Backend (NestJS — single tenant, 'default')
   │
   └── / ────────────────────► Frontend (Next.js — single build)

Backend also connects to:
   ├── PostgreSQL (local to the VM — bare-metal or Docker container; not confirmed which)
   ├── Redis (local to the VM — bare-metal or Docker container; not confirmed which)
   └── Oracle HIS: NOT connected — sales/demo box, no real hospital HIS wired up
```
Source: `OCI_DEMO_DEPLOYMENT.md`. This is architecturally identical to topology B (the self-hosted pattern), just hosted on OCI IaaS instead of a hospital's own hardware, and used for demonstration rather than production hospital use. It does **not** exercise multi-tenant subdomain routing, S3, RDS, ElastiCache, ALB, or WAF. Open items not yet confirmed and recorded: PM2-vs-Docker split, TLS status, OCI shape/region, backup configuration (see `OCI_DEMO_DEPLOYMENT.md` §4).

---

## D. Future Cloud SaaS 🔴 WRITTEN, NOT APPLIED

```
Internet
   │
DNS (manual — no Route53 automation found in code; one wildcard
     CNAME/ALIAS record: *.<cloud_base_domain> → ALB, created once, manually)
   │
CloudFront (static asset CDN — infrastructure/terraform/cloudfront.tf)
   │
WAF (attached to ALB — infrastructure/terraform/waf.tf)
   │
ALB — wildcard host-header rule: host_header = ["*.<cloud_base_domain>", <cloud_base_domain>]
      split only by path (/api/* → backend target group, /* → frontend target group)
      source: infrastructure/terraform/alb.tf
   │
   ├── ECS Fargate: hdsp-frontend service (256/512, scalable, stateless)
   │
   ├── ECS Fargate: hdsp-api service (512/1024, ≥2 tasks, rolling deploy,
   │                 tenant resolved per-request via SubdomainTenantMiddleware
   │                 reading the Host header — NOT by the ALB)
   │
   └── ECS Fargate: hdsp-worker service (512/1024, CAPPED AT 1 TASK —
                     @nestjs/schedule has no distributed cron lock)
                     Both api and worker run the SAME backend image,
                     differentiated only by PROCESS_ROLE env var.

ECS tasks connect to:
   ├── RDS PostgreSQL (Multi-AZ is a config flag, not a guaranteed default —
   │                    shared schema, tenant_id column isolation, same model
   │                    as self-hosted)
   ├── ElastiCache Redis (TLS via REDIS_TLS=true)
   ├── S3 (object storage, tenant-prefixed keys — STORAGE_DRIVER=s3)
   │
   └── Connector (per-hospital, deployed OUTSIDE this VPC, at the hospital's
                   network edge) ──► Hospital's own on-prem Oracle HIS
                   (ORACLE_TRANSPORT=cloud_relay, relayed over Redis with a
                   SQL-template allow-list as the security boundary)
```
Source: `CLOUD_SETUP.md`, `infrastructure/terraform/*.tf`, `infrastructure/ecs/*.json`, `.github/workflows/deploy-cloud.yml`. **`CLOUD_DEPLOY.md` states explicitly this has never been applied against a real AWS account, real DNS zone, or real credentials.** Multi-tenant subdomain routing, S3 storage, RDS, ElastiCache, ALB, CloudFront, and WAF are all exercised only in this topology — none of A, B, or C touch them.

---

## Cross-Cutting: Vendor Portal (relevant to topology D primarily)

```
Vendor Portal Frontend (Next.js, port 4001) → Vendor Portal Backend (NestJS, port 4000)
      → own Postgres DB (cloud_tenants table)
      → HTTP calls (fetch) to an HDSP Backend's /platform/tenant-provisioning API,
        using HDSP_BACKEND_URL + X-Vendor-Portal-Api-Key
        (provision / check-availability / resume / deprovision)
```
This flow targets topology D's multi-tenant HDSP backend. Self-hosted installs (topologies B/C) instead use the standalone `scripts/provision-self-hosted.ts` script — the Vendor Portal is not involved in provisioning a single-tenant install.

---

## Summary Table

| Topology | Status | Tenant model | TLS termination | Object storage | DB hosting | Oracle path |
|---|---|---|---|---|---|---|
| A. Developer local | 🟡 pattern in daily use | single, local | none (http) | local disk | local Docker Postgres | direct (optional) |
| B. Hospital self-hosted | 🟡 real pattern, per-hospital instances | single (`'default'`) | Nginx | local disk | bare-metal/Docker Postgres | direct |
| C. OCI demo server | 🟢 live today | single (`'default'`) | Nginx (status unconfirmed) | local disk | local Postgres on the VM | not connected |
| D. Future cloud SaaS | 🔴 written, unapplied | many, subdomain-routed | ALB/ACM | S3 | RDS (Multi-AZ optional) | cloud_relay via Connector |

Do not describe topology D as "the cloud deployment" in customer-facing or investor-facing material without the "not yet applied to real infrastructure" caveat — this has caused confusion internally before (see the OCI-demo-vs-AWS-target distinction called out in `HDSP_Current_Architecture_Analysis.md` and `OCI_DEMO_DEPLOYMENT.md`).
