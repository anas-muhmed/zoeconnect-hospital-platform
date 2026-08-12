# HDSP — Security Guide

**Audience:** system administrators, DevOps, and security reviewers. Every control below is cited to the exact file/config that implements it; every gap is stated as a gap, not inferred.

---

## 1. SSH

`scripts/setup.sh` (self-hosted host bootstrap) configures UFW with a default-deny inbound policy, explicitly allowing SSH. Recommended hardening (not currently scripted, apply manually): restrict SSH to key-based auth only (`PasswordAuthentication no`), disable root login (`PermitRootLogin no`), and restrict source IPs where feasible. The OCI demo server is administered via SSH as the `opc` user (OCI/Oracle-Linux default cloud user) — see `OCI_DEMO_DEPLOYMENT.md` for open items (bastion/console usage not confirmed).

## 2. Firewalls

- **Self-hosted:** `scripts/setup.sh` — UFW default-deny inbound, allow only 22/80/443. Postgres and Redis are not exposed externally in the Docker Compose path (`127.0.0.1:5432`/`127.0.0.1:6379` bindings in `docker-compose.selfhosted.yml`); the same discipline should be applied to the bare-metal PM2 path (bind Postgres/Redis to localhost, or firewall them explicitly).
- **Redis hardening** (`scripts/setup.sh`): `bind 127.0.0.1`, `requirepass <generated>`, `protected-mode yes`.
- **Cloud:** Security Groups (defined in `infrastructure/terraform/ecs.tf`/`rds.tf`/`elasticache.tf`) should scope ALB→internet (443/80), ECS-tasks→ALB-only, RDS/ElastiCache→ECS-tasks-only. Verify these directly in Terraform before go-live — not exhaustively re-verified in this document.

## 3. Least Privilege

- Recommended Oracle HIS account: read-only (`HDSP_READONLY` in `DEPLOY.md`'s example) — not enforced by code, an operational recommendation for whoever creates the Oracle user on the hospital side.
- PM2/Docker processes run as a dedicated non-root user: PM2 path runs under the `hdsp` system user created by `scripts/setup.sh`; Docker images (`backend.Dockerfile`, `connector.Dockerfile`) create a non-root `hdsp` group/user and `USER hdsp` before the final `ENTRYPOINT`/`CMD` — builder stages run as root (needed for `npm ci`/native module compilation) but the runtime stage does not.
- Cloud: ECS execution role should be scoped to only `secretsmanager:GetSecretValue` on the `hdsp/*` secret namespace (per `secrets.tf`'s intent) — verify the IAM policy in Terraform matches this scope, not a broader wildcard.
- `dumb-init` is used as PID 1 in both `backend.Dockerfile` and `connector.Dockerfile` for correct signal handling/zombie reaping — standard container hygiene, correctly applied.

## 4. Database Security

- PostgreSQL 15, `synchronize: false` hardcoded in every TypeORM DataSource (`data-source.ts`, `database.config.ts`) — schema changes only via reviewed migrations, in every environment.
- Application connects as a dedicated role (`hdsp_app` in examples), not a superuser — an operational convention shown in `DEPLOY.md`, not enforced by code.
- Tenant isolation is **application-layer only** (`TenantScopedRepository`, opt-in per entity, excludes writes) — there is **no PostgreSQL Row-Level Security** anywhere in the migrations. This is a documented architectural gap (see `HDSP_Current_Architecture_Analysis.md`), directly relevant to a security review: a bug in application-layer scoping is not backstopped at the database level.
- `DB_SSL` env var exists (`database.config.ts`) — enable it for any deployment where the Postgres connection crosses an untrusted network (always for RDS in production).

## 5. Secrets Management

- **Runtime, both self-hosted and cloud: plain environment variables.** No `@aws-sdk/client-secrets-manager` (or equivalent vault SDK) call exists anywhere in `backend/src` — confirmed by exhaustive grep. The app always reads `process.env`, validated at boot by a Joi schema (`env.validation.ts`, `abortEarly: false` — every invalid/missing required var is reported together, then the app refuses to start).
- **Self-hosted:** secrets live in a plaintext `.env` file on disk. Protect its file permissions (`chmod 600`, owned by the `hdsp` user only) — not automated by any script, an operational responsibility.
- **Cloud:** Terraform (`infrastructure/terraform/secrets.tf`) provisions AWS Secrets Manager secret *shells*. Some are Terraform-derived and live automatically (`hdsp/rds-connection`, `hdsp/elasticache-connection`, `hdsp/app-config`); others are manual-population placeholders with `lifecycle.ignore_changes` so re-applies never clobber a real value once set (`hdsp/jwt`, `hdsp/aws-notifications`). The actual mechanism that gets a secret into a running container is the ECS task definition's `secrets` block (Secrets Manager ARN → env var, injected by the execution role at container start) — this is standard AWS practice, not a custom mechanism, and it means the application code itself never needs Secrets Manager permissions or SDK calls.
- **Known drift risk:** `infrastructure/ecs/worker-task-definition.json` references a `hdsp/s3` secret that does not exist in `secrets.tf`/Terraform (which correctly uses `hdsp/app-config:s3Bucket`) — the hand-kept JSON reference files can drift from the real Terraform source of truth. Treat `ecs.tf` as authoritative, not the JSON files, when auditing what's actually deployed.

## 6. JWT

- HMAC signing (HS256, no algorithm override found anywhere), two **separate** secrets for access vs. refresh tokens (`JWT_SECRET`, `JWT_REFRESH_SECRET`), both required and validated to be ≥32 characters at boot.
- Access token TTL: 15 minutes default (`JWT_EXPIRES_IN`). Refresh token TTL: 7 days default (`JWT_REFRESH_EXPIRES_IN`).
- Every token carries a `jti` (uuid v4). A **Redis-backed blacklist** (`hdsp:jwt:blacklist:<jti>`, TTL matched to the token's remaining lifetime) is checked on every authenticated request (`JwtStrategy.validate()`), and populated on logout, password change, branch selection (old token blacklisted when a new branch-scoped token is minted), widget-token renewal, and refresh-token rotation.
- **Refresh rotation is real**: `AuthService.refreshToken()` verifies, checks the blacklist, checks idle-session-timeout, mints an entirely new access+refresh pair, and immediately blacklists the just-used refresh token's `jti` — the old refresh token cannot be replayed.
- **Rotating `JWT_SECRET`/`JWT_REFRESH_SECRET` invalidates every active session immediately** — no dual-secret/grace-period mechanism exists. Plan rotations for a maintenance window (see `PRODUCTION_DEPLOYMENT_RUNBOOK.md` §8).
- Two narrower JWT types (kiosk/reservation-capability, workstation-session tokens) are trusted purely on signature — they skip the DB user lookup entirely by design, for lightweight embedded/kiosk flows. Treat their signing secret with the same care as the main JWT secret.

## 7. TLS

- **No TLS termination in application code** — the backend listens on plain HTTP (`app.listen(port, '0.0.0.0')`, Fastify, no cert options anywhere in `main.ts`). TLS is entirely the reverse proxy's/load balancer's responsibility.
- Self-hosted: Nginx terminates TLS (`infrastructure/nginx/hdsp.conf`, `listen 443 ssl; http2 on;`). The default cert shipped by both `scripts/setup.sh` and `DEPLOY.md` is **self-signed** — both files explicitly flag this as a placeholder to replace before production.
- Cloud: ALB terminates TLS via an ACM certificate (DNS-validated, covering the wildcard + apex domain).
- HSTS (`Strict-Transport-Security`) is set **only** in the Nginx config, not in the application's Fastify Helmet config — a deployment that bypasses the provided Nginx config loses HSTS entirely. If you introduce a different reverse proxy, re-add this header explicitly.

## 8. Certificate Renewal

No automated renewal exists for the self-hosted path (no `certbot`/ACME client anywhere in the repo) — this is a manual gap to close, recommended approach documented in `DOMAIN_AND_DNS_SETUP.md` §8. ACM (cloud) renews automatically as long as DNS validation records remain in place.

## 9. Security Headers (application layer)

`@fastify/helmet`, registered in `main.ts`:
```ts
await app.register(helmet, {
  crossOriginResourcePolicy: false,   // disabled to allow static media/CMS uploads to be served cross-origin
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"], imgSrc: ["'self'", 'data:'], mediaSrc: ["'self'"],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});
```
Note `scriptSrc` has no `'unsafe-inline'` (inline `<script>` is CSP-blocked), while `styleSrc` does. A second, independent layer is set at Nginx (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection`, `Referrer-Policy`, HSTS, a broader CSP, `Permissions-Policy`) — see §7's caveat about relying on Nginx for HSTS specifically.

## 10. CORS

Configured in `main.ts` via `@fastify/cors`, `app.enableCors()`. Base allowlist: `localhost:3000/3001/4001`, the configured `FRONTEND_URL`, plus anything in the comma-separated `CORS_ORIGIN` env var (**note: this env var is currently dead-wired** — `main.ts` reads `app.corsOrigin` but `app.config.ts` never defines that key, so setting `CORS_ORIGIN` today has no effect; flag for engineering follow-up before relying on it). A private-IP regex allows RFC1918 ranges (`10.x`, `172.16–31.x`, `192.168.x`, `localhost`, `127.0.0.1`) unconditionally — appropriate for self-hosted LAN access. In cloud mode only (`DEPLOYMENT_MODE=cloud` + `CLOUD_BASE_DOMAIN` set), a **tenant-scoped wildcard check** allows `https://<subdomain>.<cloud_base_domain>` origins only if `<subdomain>` resolves to a real, active `Tenant` — not a blanket wildcard allow.

## 11. Rate Limiting

Global default: 100 requests/60s, **hardcoded** in `app.module.ts`'s `ThrottlerModule.forRoot()` — related env vars (`THROTTLE_TTL`, `THROTTLE_LIMIT`) are Joi-validated but **not actually wired into the throttler config**, a confirmed dead-code path worth fixing. Route-specific overrides on `auth.controller.ts` (all hardcoded, not env-driven): login 5/min, HIS-login 10/min, refresh 10/min, widget-login 5/min, widget-bootstrap 30/min, forgot-password 5/min.

**Important limitation:** the throttler's storage is explicitly **in-memory, not Redis-backed** (`redis.config.ts` sets `THROTTLER_STORAGE: useValue: null` with a comment noting Redis-backed storage would be needed "when cluster mode is needed"). Under PM2's 2-instance cluster or any horizontally-scaled cloud deployment, **each process/task enforces its own independent counter** — actual effective limits are roughly N× the documented per-route numbers, where N is the instance count. Treat this as a real capacity-planning and abuse-mitigation gap, not a theoretical one, for any multi-instance deployment.

Nginx adds a second, independent layer (`limit_req zone=login burst=3`, `zone=api burst=50`, `zone=general burst=20`, `limit_conn conn_limit 20`) — this layer *is* shared across all backend instances since it operates at the single Nginx process, partially mitigating the gap above for self-hosted deployments that keep Nginx in front. Cloud deployments behind an ALB (no Nginx) do not get this mitigation — the ALB does not perform equivalent per-route rate limiting; WAF rate-based rules would need to fill this role, and their exact configuration should be verified directly in `waf.tf`.

## 12. Password Policy

- Bcrypt cost factor **12**, hardcoded in `auth.service.ts` (`BCRYPT_ROUNDS = 12`).
- Account lockout: **5** failed attempts → **15-minute** lock (`MAX_FAILED_ATTEMPTS`, `LOCK_DURATION_MINUTES` constants in `auth.service.ts`), with the counter reset on successful login.
- **No server-side password complexity policy was found in `auth.service.ts`** (length/character-class rules) — this should be verified against `change-password.dto.ts`'s class-validator decorators specifically before asserting a total absence in any external-facing statement, but nothing in the service layer enforces one. If organizational policy requires complexity rules, they are not currently implemented and would need to be added.

## 13. Audit Logs

`backend/src/modules/audit/` — fire-and-forget via a Bull queue (`QUEUE_NAMES.AUDIT_LOGS`), persisted to the `audit_logs` Postgres table by `AuditProcessor` (3 retry attempts, exponential backoff). Captures `user_id`, `tenant_id`, `action`, `module`, `entity_type`/`entity_id`, `old_value`/`new_value` (jsonb diff), `ip_address`, `user_agent`, `request_id`, `metadata`, `created_at`. Auth-related events logged: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `BRANCH_SELECTED`, `WIDGET_TOKEN_RENEWED`, `PASSWORD_CHANGED`, `SUPER_ADMIN_SETUP`, plus several `@Audit()`-decorated attempt events; other modules (CMS, token/queue, feedback) have their own audit sub-services.

**Retention: not implemented.** No scheduled purge, TTL, or retention policy exists anywhere in the audit module — rows accumulate indefinitely. Plan a manual archival/purge strategy proportional to your compliance requirements and disk budget; this is unbuilt, not misconfigured.

## 14. Connector Security

- **SQL-template allow-list is the core security boundary**: `SqlTemplateRegistry` (`connector/src/protocol/sql-template-registry.ts`) — the Connector will only execute a pre-registered `sqlTemplateId`, never an arbitrary SQL string received over the wire; unknown template IDs throw `UnknownSqlTemplateError`. Confirmed as the only call path from `Connector.handleRequest()` into the Oracle client.
- **Redis authentication**: the Connector authenticates purely via its `CONNECTOR_REDIS_URL` connection string (embedded credential/token, or TLS via a `rediss://` scheme) — no separate application-level auth handshake exists.
- **Multi-tenant Connector binding is not cryptographically enforced today.** A `TenantConnectorPairing` entity (bcrypt-hashed pairing key, generated once at tenant provisioning) exists in the schema, but **nothing in the Connector consumes it** — confirmed by the entity's own doc comment and by inspecting the Connector's transport code. In practice, any Connector instance that can reach the relevant Redis channel can service requests published there; tenant separation for the Connector relies entirely on Redis-level network/credential isolation (e.g., a dedicated Redis instance or channel per tenant/hospital), not on this pairing key. This is a documented, tracked gap (`PHASE_10_DEFERRED_BACKLOG.md`) — treat it as a real limitation when designing multi-hospital cloud-relay deployments, not a resolved control.

## 15. Oracle Connectivity

- `ORACLE_HOST`/`ORACLE_USER`/`ORACLE_PASSWORD` are the only credential group in the entire Joi validation schema that is optional/allow-empty — the platform boots and degrades gracefully without HIS connectivity, by design.
- Recommended: a dedicated, read-only Oracle account for HDSP's use (not enforced by code).
- Direct mode (`ORACLE_TRANSPORT=direct`, self-hosted default): backend dials Oracle directly — ensure this connection path is confined to the hospital's internal network, not exposed over the public internet.
- Cloud-relay mode (`ORACLE_TRANSPORT=cloud_relay`): avoids the cloud backend ever needing direct network access to a hospital's on-prem Oracle instance — the Connector, running at the hospital's edge, is the only component that dials Oracle, relaying only allow-listed query results over Redis (§14).

## 16. Non-Root Containers

Confirmed for `backend.Dockerfile` and `connector.Dockerfile`: multi-stage builds, non-root `hdsp` user in the final runtime stage, `dumb-init` as PID 1. `frontend.Dockerfile` and the `vendor-portal/*` Dockerfiles were not independently re-verified in this pass for the same pattern — confirm directly before asserting parity in an external-facing security statement.

## 17. Summary of Confirmed Gaps (for a security review / remediation backlog)

- No Postgres Row-Level Security — tenant isolation is application-layer only.
- Rate limiting is per-process/in-memory, not shared across replicas (Redis-backed throttler storage not wired in).
- `CORS_ORIGIN` env var is dead code — has no effect despite being documented/validated.
- No audit log retention/purge job — unbounded growth.
- No server-side password complexity policy confirmed in the auth service layer.
- `TenantConnectorPairing` key generated but never validated — Connector-to-tenant binding relies on Redis-level auth only.
- No automated TLS certificate renewal for self-hosted (no ACME client wired in).
- No AWS Secrets Manager automatic rotation configured for RDS/ElastiCache credentials.
- No CloudWatch Alarms/dashboards for the cloud environment (monitoring gap with security-relevant blast radius — undetected anomalies).
