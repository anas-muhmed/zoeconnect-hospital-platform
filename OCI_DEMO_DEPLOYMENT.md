# HDSP — Current Demo Deployment (Oracle Cloud Infrastructure)

> **Status: this is the environment that is actually running today.** It is a sales/demo deployment, not the target production architecture. For the intended future production topology, see `CLOUD_DEPLOY.md` (AWS/Terraform — written but not yet applied). For customer-site installs at a hospital, see `DEPLOY.md` (self-hosted runbook) and `infrastructure/installer/`.
>
> **Environment:** Single Oracle Cloud Infrastructure (OCI) Compute VM · accessed via SSH as the `opc` user · Nginx reverse proxy on the box · public-IP access (no DNS/domain currently attached)

---

## 1. What this environment is

This is a single OCI Compute instance running the HDSP self-hosted stack (the same application code and deployment pattern documented in `DEPLOY.md` — Node.js/NestJS backend, Next.js frontend, PostgreSQL, Redis, Nginx), stood up to give prospects and internal stakeholders a working demo. It is **not** the AWS reference architecture described in `CLOUD_DEPLOY.md`/`infrastructure/terraform/` — none of that Terraform has been applied anywhere, including here.

Architecturally it is best understood as **one instance of the "self-hosted" deployment pattern, hosted on OCI infrastructure instead of on-premise hospital hardware**, used for demonstration purposes:

- Single `Tenant` row (`code: 'default'`), matching the codebase's self-hosted default (see `HDSP_Current_Architecture_Analysis.md` §1–2) — this box does not exercise the multi-tenant/subdomain routing path (`SubdomainTenantMiddleware`'s cloud behavior) since there is no wildcard DNS or second tenant configured.
- `DEPLOYMENT_MODE` is effectively `self_hosted` (or unset/default) on this box, not `cloud` — the four provider-abstraction env vars (`STORAGE_DRIVER`, `ORACLE_TRANSPORT`, `LICENSE_PROVIDER_MODE`, `NOTIFICATION_PROVIDER_MODE`) should be assumed to be at their `local`/`direct`/`file` defaults unless confirmed otherwise on the box itself.
- Access is by **public IP address only** — there is no domain or subdomain currently pointed at this VM. Nginx's `server_name` on this box should be treated as IP-based/default-catch-all rather than the `hdsp.hospital.local` placeholder shown in `infrastructure/nginx/hdsp.conf`.

## 2. Access model

| Aspect | Detail |
|---|---|
| Cloud provider | Oracle Cloud Infrastructure (OCI), Compute (IaaS) VM instance |
| OS user for administration | `opc` (OCI/Oracle Linux's default cloud-init provisioned sudo user) |
| Access method | SSH (key-based, via the `opc` user — no console/bastion service in front of it as far as this documentation set has visibility into) |
| Public exposure | Public IP address directly; no load balancer, no CDN, no WAF in front of it |
| DNS | None currently — accessed as `https://<public-ip>` (or `http://`, if TLS has not been configured) |
| Reverse proxy | Nginx running on the VM itself, in front of the Node.js backend/frontend processes (same role as `infrastructure/nginx/hdsp.conf` plays in the self-hosted runbook) |
| Process management | Not confirmed in this documentation set whether the backend/frontend run under PM2 (bare-metal, per `DEPLOY.md` §6) or under Docker Compose (`infrastructure/docker/docker-compose.selfhosted.yml`) on this specific box — **operators should confirm and record this here** the next time this doc is updated. Both are supported self-hosted patterns in the codebase; this demo box uses one of them. |
| Database / cache | PostgreSQL and Redis, running either as OS packages or as Docker containers on the same VM (single-box topology either way — no managed RDS/ElastiCache involved, unlike the AWS target architecture) |
| Oracle HIS connectivity | Not applicable / not connected for demo purposes — this is a sales demo box, not wired to a real hospital's Oracle HIS. `/api/health`'s Oracle indicator on this box is expected to show `unreachable`/`degraded`, which the codebase treats as non-critical (see `DEPLOY.md`'s post-deploy checklist). |

## 3. Why this is architecturally distinct from the AWS target

| Concern | OCI Demo (this doc) | AWS Target Production (`CLOUD_DEPLOY.md`) | Self-Hosted Hospital (`DEPLOY.md`) |
|---|---|---|---|
| Purpose | Sales/internal demo | Intended production SaaS environment for real hospital tenants | Real hospital's own install, on their premises or their own cloud account |
| Provisioned via | Manual SSH setup on one OCI VM | Terraform (`infrastructure/terraform/`) — ALB, ECS Fargate, RDS Multi-AZ, ElastiCache, S3 + CloudFront, WAF | `infrastructure/installer/install.sh` + `DEPLOY.md`'s manual runbook |
| Tenant model exercised | Single implicit tenant (`'default'`) | Many tenants, wildcard-subdomain routing (`*.CLOUD_BASE_DOMAIN`) | Single implicit tenant (`'default'`) — same as OCI demo |
| Reverse proxy / edge | Nginx directly on the VM, IP-based, no TLS termination guarantees, no WAF | AWS ALB with wildcard host-header rule + WAF + CloudFront | Nginx directly on the customer's server, single fixed hostname |
| Compute | One VM, one of everything | ECS Fargate — API service (≥2 tasks) + Worker service (1 task, cron-lock constraint) + Frontend service | One server (bare-metal or the customer's own VM), PM2 cluster mode or Docker Compose |
| Database | Local Postgres on the same VM | RDS Postgres, Multi-AZ | Local/bare-metal Postgres on the customer's server |
| Object storage | Local disk (`LocalStorageProvider`) | S3 (`S3StorageProvider`) | Local disk (`LocalStorageProvider`) |
| Verified against real infra? | Yes — this one is actually running | **No** — `CLOUD_DEPLOY.md` explicitly states it has never been applied against a real AWS account in this project's history | Documented and used as the basis for real customer installs, but each install should follow its own checklist |

The key point: **the OCI demo VM is architecturally a self-hosted deployment, not the multi-tenant cloud architecture.** It happens to run on OCI's IaaS layer rather than a hospital's own hardware, but it does not exercise wildcard-subdomain tenant routing, S3 storage, RDS, ElastiCache, or any of the AWS-specific Terraform. Prospects viewing the demo are seeing the same single-tenant application behavior a hospital would see on their own server — not a preview of the multi-tenant SaaS control plane, which remains unimplemented against real infrastructure.

## 4. Known gaps / things to confirm and fill in on this box

This section intentionally lists open items rather than fabricating specifics that haven't been confirmed against the actual VM:

- [ ] Confirm and record: PM2 bare-metal vs. Docker Compose on this VM (§2 above).
- [ ] Confirm and record: whether TLS/HTTPS is configured (self-signed cert per `DEPLOY.md` §7, a real cert, or plain HTTP).
- [ ] Confirm and record: OCI shape/size (CPU/RAM/disk) and OCI region.
- [ ] Confirm and record: whether OCI Security List / Network Security Group rules are scoped narrowly (SSH + 80/443 only) or broader.
- [ ] Confirm and record: backup strategy for this box, if any (the self-hosted `pg_dump` cron pattern in `DEPLOY.md` §13 is the default assumption, not yet confirmed here).
- [ ] Decide whether this demo box should eventually get a real subdomain/DNS entry, or remain IP-only.

## 5. Relationship to other deployment docs in this repo

- **`DEPLOY.md`** — the generic self-hosted runbook this demo box's setup should match in spirit (Nginx + PM2, or Nginx + Docker Compose). Treat `DEPLOY.md` as the procedure; this document as the record of one specific, already-running instance of that procedure, on OCI instead of a hospital's own server.
- **`CLOUD_DEPLOY.md`** — the *target* multi-tenant AWS production architecture. Not deployed anywhere yet, including here. Do not confuse this OCI demo box with that target architecture when discussing "the cloud deployment" internally or with prospects.
- **`HDSP_Current_Architecture_Analysis.md`** — the code-verified architecture report; its Section 12 diagram and Section 1 (Overall Deployment Architecture) have been updated to show this OCI demo as the third, currently-live deployment topology alongside the AWS target and the generic self-hosted pattern.
