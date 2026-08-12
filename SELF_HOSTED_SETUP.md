# HDSP — Self-Hosted Setup Guide

**Audience:** hospital IT administrators, systems integrators, DevOps engineers performing a from-scratch install.
**Status of this document:** production documentation. It supersedes the narrower `DEPLOY.md` runbook by adding hardware/network/security context; `DEPLOY.md` remains valid as the terse command reference for the PM2 path. Every claim below is cited to a file in the repository. Where the repository does not specify a value (e.g. hardware sizing), this is stated explicitly and a recommendation is offered rather than presented as a repository fact.

This document covers **two supported self-hosted install paths** that both exist in the codebase today:
- **Path A — PM2 bare-metal** (`infrastructure/pm2/ecosystem.config.js`, `scripts/setup.sh`, `DEPLOY.md`)
- **Path B — Docker Compose** (`infrastructure/docker/docker-compose.selfhosted.yml`, `infrastructure/installer/install.sh`)

A given install uses one path, not both. The current live OCI demo server (`OCI_DEMO_DEPLOYMENT.md`) is one running instance of this same pattern; its exact PM2-vs-Docker split was not confirmed at the time that document was written.

---

## 1. Hardware Requirements

**Not specified anywhere in the repository** — no `.tf`, Dockerfile resource limit, or doc file states minimum CPU/RAM/disk for a self-hosted install. The recommendations below are derived from the stack's known components (Node.js cluster mode at 2 PM2 instances, PostgreSQL 15, Redis 7, Nginx, optional Oracle Instant Client) and should be treated as an engineering recommendation, not a repository-verified requirement.

| Resource | Minimum (small hospital, pilot) | Recommended (production) |
|---|---|---|
| CPU | 4 vCPU | 8 vCPU |
| RAM | 8 GB | 16 GB |
| Disk | 80 GB SSD | 200 GB+ SSD (audit logs and uploads grow unbounded — see §16) |
| Network | 1 Gbps NIC | 1 Gbps NIC |

Sizing notes grounded in code: the backend runs in PM2 **cluster mode with 2 instances**, each capped at `max_memory_restart: '512M'` (`infrastructure/pm2/ecosystem.config.js`); the frontend runs 1 instance, also capped at 512M. Postgres and Redis sizing is not specified — `infrastructure/postgres/init.sql`'s commented-out tuning block (`shared_buffers`, `effective_cache_size`, `work_mem`) is provided as an optional starting point, not applied automatically.

## 2. Supported Operating Systems

The only OS explicitly automated and documented is **Ubuntu 22.04 LTS**:
- `DEPLOY.md` header: *"Environment: On-premise Linux server (Ubuntu 22.04 LTS recommended)"*.
- `scripts/setup.sh` uses `apt-get` throughout (NodeSource repo, PostgreSQL 15, Redis 7, Nginx, UFW) — this script will not run unmodified on a non-Debian-family OS.
- The Docker Compose path (`docker-compose.selfhosted.yml`) is OS-agnostic in principle (any host with Docker Engine + Compose plugin) but is only tested/documented against Linux hosts; `infrastructure/installer/install.sh` assumes a POSIX shell and `docker compose` CLI.

No RHEL/CentOS/Windows Server install path exists in the repository. If a hospital requires a different OS, only the Docker Compose path is realistically portable, and even then, unverified.

## 3. Network Requirements

| Requirement | Detail | Source |
|---|---|---|
| Outbound internet (install time) | Required to pull npm packages, Docker images (GHCR), apt packages, and Oracle Instant Client (manual download) | `scripts/setup.sh`, `install.sh` |
| Outbound internet (runtime) | Not required for core operation once installed; only needed if `NOTIFICATION_PROVIDER_MODE=cloud` (AWS SES/SNS) or `WHATSAPP_ENABLED=true` (Meta Graph API) are configured | env var reference, Part A of research |
| Inbound from hospital LAN | HTTPS (443) to the Nginx reverse proxy; optionally HTTP (80) for redirect-to-HTTPS | `infrastructure/nginx/hdsp.conf` |
| Connectivity to Oracle HIS | The backend (in `ORACLE_TRANSPORT=direct` mode, the self-hosted default) dials the hospital's Oracle HIS server directly on the Oracle listener port | `oracle.config.ts`, `packages/oracle-client` |
| DNS | See `DOMAIN_AND_DNS_SETUP.md`. Not required — the app functions with a bare IP and a self-signed cert, though this is not recommended for production | `infrastructure/nginx/hdsp.conf` comment: "Replace with actual hostname/IP" |

## 4. Firewall Ports

| Port | Direction | Purpose | Source |
|---|---|---|---|
| 22 | Inbound (restricted to admin IPs) | SSH administration | `scripts/setup.sh` UFW rule `allow ssh` |
| 80 | Inbound | HTTP → HTTPS redirect | `hdsp.conf` `listen 80` block |
| 443 | Inbound | HTTPS (Nginx TLS termination) | `hdsp.conf` `listen 443 ssl` |
| 3000 | Localhost only (proxied by Nginx) | Next.js frontend — **should not be exposed externally** | `ecosystem.config.js` `PORT: 3000` |
| 3001 | Localhost only (proxied by Nginx) | NestJS backend API — **should not be exposed externally** | `ecosystem.config.js` `PORT: 3001` |
| 5432 | Localhost only (or Docker-internal) | PostgreSQL | `docker-compose.selfhosted.yml` binds `127.0.0.1:5432:5432` |
| 6379 | Localhost only (or Docker-internal) | Redis | `docker-compose.selfhosted.yml` binds `127.0.0.1:6379:6379` |
| 1521 (or hospital-specific) | Outbound only, backend → Oracle HIS | Oracle listener | `oracle.config.ts` `ORACLE_PORT` default 1521 |

`scripts/setup.sh` configures UFW with a default-deny inbound policy, explicitly allowing only SSH, 80, and 443. Postgres/Redis are bound to `127.0.0.1` in the Docker Compose path and should be firewalled off entirely (not exposed to the LAN) in the PM2/bare-metal path too.

## 5. DNS Requirements

Not mandatory to run the application. A production deployment should have a real hostname (see `DOMAIN_AND_DNS_SETUP.md` for full detail) because:
- `hdsp.conf`'s `server_name` directive expects a real hostname to match against, and TLS certificates (Let's Encrypt or commercial) require a resolvable domain for issuance/validation.
- The OCI demo server currently runs **without** DNS (public IP only) — this is explicitly documented as non-production practice in `OCI_DEMO_DEPLOYMENT.md`.

## 6. SSL Requirements

- TLS is terminated **entirely at Nginx**; the Node.js backend listens on plain HTTP (`app.listen(port, '0.0.0.0')` in `main.ts`, no `https.createServer`/cert options anywhere in the backend).
- `hdsp.conf` references `ssl_certificate /etc/nginx/ssl/hdsp.crt` and `ssl_certificate_key /etc/nginx/ssl/hdsp.key`.
- `scripts/setup.sh` and `DEPLOY.md` §7 both generate a **self-signed** certificate by default (`openssl req -x509 -nodes -days 365 -newkey rsa:2048`) — explicitly flagged in both as a placeholder: *"replace with CA cert for production."*
- No ACME/Let's Encrypt automation (e.g. `certbot` invocation) exists anywhere in the repository for the self-hosted path — this is a manual step. See `DOMAIN_AND_DNS_SETUP.md` for recommended Let's Encrypt setup.
- HSTS (`Strict-Transport-Security`) is set only at the Nginx layer (`hdsp.conf`), not in the application's Helmet config — if a deployment bypasses the provided Nginx config, HSTS is lost.

## 7. Oracle Requirements

| Item | Detail | Source |
|---|---|---|
| Oracle Instant Client | Version 21c, Basic + SDK packages — **must be downloaded manually** from Oracle's site (license-restricted, cannot be redistributed) | `DEPLOY.md` §1, `scripts/setup.sh` |
| Install path | `/opt/oracle/instantclient_21_x`, registered via `/etc/ld.so.conf.d/oracle.conf` + `ldconfig` | `DEPLOY.md` §1 |
| Connection mode | `ORACLE_MODE=thick` (default) requires Instant Client; `ORACLE_MODE=thin` (Oracle 19c+) does not | `oracle.config.ts`, env validation |
| Transport | `ORACLE_TRANSPORT=direct` (self-hosted default) — backend dials Oracle directly. `cloud_relay` (via the Connector) is the cloud-mode alternative, not applicable here | `env.validation.ts` |
| Credentials | `ORACLE_HOST`, `ORACLE_PORT` (1521 default), `ORACLE_SERVICE`, `ORACLE_USER`, `ORACLE_PASSWORD` — all optional/allow-empty in validation; the platform boots and degrades gracefully without HIS connectivity (`/api/health` shows Oracle as unreachable, treated as non-critical) | `oracle.config.ts` |
| Recommended DB user | Read-only account (`HDSP_READONLY` in examples) — not enforced by code, an operational recommendation | `DEPLOY.md` §4 example |

## 8. PostgreSQL Requirements

- **Version 15**, pinned in both `docker-compose.selfhosted.yml` (`postgres:15`) and `scripts/setup.sh` (`postgresql-15` apt package).
- Extensions enabled at first boot via `infrastructure/postgres/init.sql`: `pgcrypto` (UUID generation), `pg_stat_statements` (query performance monitoring), `btree_gist`.
- `synchronize` is **hardcoded `false`** in every TypeORM DataSource definition (`data-source.ts`, `database.config.ts`) — schema changes are migration-only, never auto-applied, in every environment including dev.
- Connection pool defaults: `DB_POOL_MIN=2`, `DB_POOL_MAX=20` (`database.config.ts`).
- Database/role creation example (`DEPLOY.md` §2): `CREATE USER hdsp_app WITH PASSWORD '...'; CREATE DATABASE hdsp_db OWNER hdsp_app;`.

## 9. Redis Requirements

- **Version 7**, pinned in `docker-compose.selfhosted.yml` (`redis:7`) and `scripts/setup.sh` (`redis-server` with `bind 127.0.0.1`, `requirepass`, `protected-mode yes` hardening applied by the script).
- Used for: JWT blacklist (`hdsp:jwt:blacklist:<jti>` keys), session activity tracking, general caching (`REDIS_CACHE_TTL`, default 300s), and BullMQ job queues (`NOTIFICATIONS`, `AUDIT_LOGS`, `LOYALTY_EVENTS`, `CAMPAIGN_TRIGGERS`, `ATTENDANCE_REALTIME`).
- **Known limitation to plan around:** the NestJS rate limiter (`ThrottlerModule`) explicitly does **not** use Redis-backed storage (`redis.config.ts` sets `THROTTLER_STORAGE: useValue: null` with a comment that Redis-backed throttler storage would be needed for multi-instance rate-limit sharing). Under PM2's 2-instance cluster mode, each process enforces its own independent rate-limit counters — effective limits are roughly double the documented per-route numbers. This is a real, code-confirmed gap, not a theoretical one.

## 10. Node.js Requirements

- **Node.js 20 LTS**, installed via `nvm` per `DEPLOY.md` §1 and `scripts/setup.sh` (NodeSource `setup_20.x`).
- `npm ≥ 10` (bundled with Node 20).

## 11. Path A — PM2 Deployment (bare-metal)

Full sequence (condensed from `scripts/setup.sh` + `DEPLOY.md`; see those files for exact copy-paste commands):

1. **Host bootstrap** (`scripts/setup.sh`): `apt-get update/upgrade`; create system user `hdsp`; install Node 20 + PM2 globally; install and enable Nginx, PostgreSQL 15, Redis 7 (hardened per §9); generate self-signed cert; copy `infrastructure/nginx/{nginx.conf,hdsp.conf}`; create the Postgres role/DB; configure UFW; `pm2 startup systemd`. The script explicitly does **not** install Oracle Instant Client — it prints a warning and a manual download link.
2. **Oracle Instant Client** — manual download + unzip to `/opt/oracle`, `ldconfig` (§7 above).
3. **Deploy application code**: clone/rsync the repo to `/opt/hdsp`; `backend`: `cp .env.example .env`, edit, `npm ci --omit=dev`, `npm run build`, `npm run migration:run`; `frontend`: `cp .env.example .env.local`, edit `NEXT_PUBLIC_API_URL`, `npm ci --omit=dev`, `npm run build` (`DEPLOY.md` §3).
4. **Required env vars** — see the full reference in this repo's environment variable audit; minimum required (fail-fast if missing, per `env.validation.ts` Joi schema): `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `REDIS_HOST`, `JWT_SECRET` (min 32 chars), `JWT_REFRESH_SECRET` (min 32 chars).
5. **License setup**: generate an RSA keypair offline (`npx ts-node scripts/generate-license.ts keygen`), copy only the public key to the server, issue a license (`... issue`), upload via Settings → License in the UI, or rely on the 30-day trial (`LICENSE_TRIAL_DAYS`, `LICENSE_PROVIDER_MODE=file` default).
6. **Start with PM2**: `pm2 start infrastructure/pm2/ecosystem.config.js`, `pm2 save`, `pm2 startup`. Config detail: backend runs `dist/main.js` in **cluster mode, 2 instances**, `max_memory_restart: 512M`, restart backoff (`restart_delay: 3000ms`, `max_restarts: 10`, `min_uptime: 10s`); frontend runs `next start -p 3000` in **fork mode, 1 instance** (Next.js self-clusters). Logs to `/opt/hdsp/logs/pm2/{backend,frontend}-{out,error}.log`.
7. **Nginx**: copy `infrastructure/nginx/nginx.conf` → `/etc/nginx/nginx.conf`, `hdsp.conf` → `/etc/nginx/conf.d/hdsp.conf`; edit hostname/cert paths; `nginx -t && systemctl reload nginx`.
8. **Post-deploy checklist** — see §21 below (mirrors `DEPLOY.md` §8).

## 12. Path B — Docker Deployment

1. Ensure Docker Engine + `docker compose` plugin are installed (not automated by any script in this repo — a prerequisite).
2. First run: `./infrastructure/installer/install.sh <version>` with no existing `.env` — it copies `env.selfhosted.template` to `.env` and exits, instructing you to edit it.
3. Edit `infrastructure/docker/.env`, replacing every `CHANGE_ME_*` placeholder. `install.sh` **refuses to proceed** while any `CHANGE_ME` string remains (`grep -q "CHANGE_ME"` check).
4. Re-run `./install.sh <version>`. It then: checks Connector version compatibility if the connector service is enabled (`check-compatibility.js`); `docker compose pull`; starts `postgres`/`redis` and polls their Docker healthchecks (up to 90s); runs `docker compose run --rm backend npm run migration:run`; runs `docker compose run --rm backend npm run provision:self-hosted` (idempotent — safe on upgrade); brings up the full stack (`docker compose up -d`); polls `http://localhost:3001/api/v1/health/live` (up to 90s) and reports success/failure.
5. Compose topology (`docker-compose.selfhosted.yml`): `postgres` (image `postgres:15`, `127.0.0.1:5432` only, healthcheck `pg_isready`), `redis` (image `redis:7`, `127.0.0.1:6379` only, healthcheck `redis-cli ping`), `backend` (image `ghcr.io/<owner>/hdsp-backend:<version>`, depends on healthy postgres+redis, port `3001:3001`, volumes `hdsp_uploads`/`hdsp_keys`, HTTP healthcheck against `/api/v1/health/live`), `frontend` (port `3000:3000`, no healthcheck defined in the compose file). A `connector` service is present but commented out — enable only if relaying Oracle via a Connector instance. All services `restart: unless-stopped`.
6. Images are published to **GHCR** (`ghcr.io/<owner>/hdsp-{backend,frontend,connector}`) only for tagged releases (`build-images.yml`'s `publish-self-hosted-images` job) — a hospital installer intentionally only sees numbered releases, never dev builds.
7. Nginx still fronts the stack the same way as Path A (§13) — Docker Compose does not include an Nginx service by default in `docker-compose.selfhosted.yml`; TLS termination remains a host-level Nginx responsibility.

## 13. Nginx Configuration

`infrastructure/nginx/nginx.conf` (global: upstreams `hdsp_backend` (127.0.0.1:3001), `hdsp_frontend` (127.0.0.1:3000), rate-limit zone definitions, `include /etc/nginx/conf.d/*.conf`) + `infrastructure/nginx/hdsp.conf` (per-site):
- `server_name hdsp.hospital.local;` — **must be edited** to the real hostname/IP.
- `location /api/v1/auth/login` — proxied to backend with `limit_req zone=login burst=3 nodelay;` (tightest zone).
- `location /api/` — proxied to backend, `limit_req zone=api burst=50;`.
- `location /socket.io/` — proxied to backend with WebSocket upgrade headers (`Upgrade`/`Connection`).
- `location /` — proxied to frontend, `limit_req zone=general burst=20;`.
- `limit_conn conn_limit 20;` — per-IP concurrent connection cap.
- Security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection`, `Referrer-Policy`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, CSP, `Permissions-Policy`.
- TLS: `listen 443 ssl; http2 on;` with cert paths as in §6; `listen 80` block redirects to HTTPS.

## 14. Backup Strategy

- `scripts/backup.sh` exists in the repository and is real, functioning code: `pg_dump --format=custom --compress=9 --no-owner --no-acl` piped to gzip, written to `/opt/hdsp/backups/hdsp_<timestamp>.sql.gz`, with automatic pruning of backups older than 30 days (`find ... -mtime +30 -delete`).
- **Scheduling is NOT automated.** The script's own header comment instructs the operator to add it to cron manually: `0 2 * * * /opt/hdsp/scripts/backup.sh >> /opt/hdsp/logs/backup.log 2>&1`. No installer step, systemd timer, or automated scheduling registers this — you must add the cron entry yourself.
- Redis: `docker-compose.yml`'s dev config saves an RDB snapshot on a schedule (60s/300s/3600s save points); the same pattern should be replicated for the self-hosted Redis instance if Redis-persisted state (queues in flight, cache) needs to survive a restart — not automated by any script for the production compose file.
- Uploaded files (local disk storage, `LocalStorageProvider`, `./uploads`) are **not** included in `backup.sh` — back up the `hdsp_uploads` Docker volume (or `/opt/hdsp/backend/uploads` in the PM2 path) separately.
- License keys directory (`/opt/hdsp/keys`) should also be included in your backup scope — losing the private-key-derived public key mapping can affect license validation continuity.

## 15. Restore Strategy

Not scripted anywhere in the repository — `scripts/backup.sh` includes only a commented reference to the restore command, not an executable restore script. Manual procedure, derived from the backup format:

```bash
# Stop the application first
pm2 stop all   # or: docker compose -f docker-compose.selfhosted.yml stop backend frontend

# Restore from a pg_dump custom-format backup
pg_restore --clean --if-exists --no-owner --no-acl -U hdsp_app -d hdsp_db /opt/hdsp/backups/hdsp_<timestamp>.sql.gz
# (gunzip first if the file was double-compressed beyond pg_dump's own --compress=9)

# Run any migrations newer than the backup
cd /opt/hdsp/backend && npm run migration:run

# Restart
pm2 start all   # or: docker compose up -d
```
Treat this as a documented procedure requiring validation in a non-production environment before relying on it — it is not verified against a real disaster scenario in this codebase.

## 16. Upgrades

**Path A (PM2)** — `DEPLOY.md` §9, zero-downtime: `git pull`; backend `npm ci --omit=dev && npm run build && npm run migration:run` (**always run migrations before reload**); frontend `npm ci --omit=dev && npm run build`; `pm2 reload infrastructure/pm2/ecosystem.config.js --update-env` (PM2 cluster mode keeps requests alive during reload); `pm2 save`.

**Path B (Docker)** — `install.sh <new-version> --upgrade`: requires an existing `.env` (fails if absent, rather than bootstrapping one); pulls new images; re-runs migrations (`docker compose run --rm backend npm run migration:run`); re-runs the idempotent provisioning script; brings the stack up; polls health. `check-compatibility.js` validates the Backend↔Connector version compatibility matrix (`connector/COMPATIBILITY.json`) before upgrading if the Connector is in use — it will refuse an upgrade that would break compatibility.

## 17. Rollback

`DEPLOY.md` §10: identify the last known-good commit/tag (`git log --oneline -10`), `git checkout v1.2.3`, revert the migration if the schema changed (`npm run migration:revert` — reverts one migration at a time, run repeatedly if multiple need reverting), rebuild, `pm2 reload`. For Docker, the equivalent is re-running `install.sh <previous-version>` against the same `.env`, then `npm run migration:revert` inside the backend container as needed. **No automated rollback tooling exists** — this is a manual, git-tag-driven procedure in both paths.

## 18. Monitoring

- **Health endpoints** (`backend/src/app.controller.ts`, `@nestjs/terminus`): `GET /health` (full: Postgres, Redis, Oracle HIS, Bull queues, memory heap ≤512MB, disk ≤95% used — 503 if any check fails), `GET /health/live` (trivial, always 200), `GET /health/ready` (Postgres + Redis only).
- `DEPLOY.md` §11 monitoring table maps observable signals to actions: `pm2 status` showing `errored` → check `pm2 logs`; `/health` showing `down` → check Postgres/Redis; disk >80% → archive/rotate logs; notification failure rate >5% → check `WHATSAPP_ACCESS_TOKEN` expiry; license banner EXPIRED → reissue; Oracle `unreachable` → non-critical, notify HIS team.
- **No external monitoring/alerting integration (Prometheus, Datadog, CloudWatch, Nagios) is wired into the self-hosted codebase** — the health endpoints exist for an operator or external monitor to poll; nothing in this repo pushes metrics anywhere automatically for self-hosted installs.

## 19. Logging

- Winston + `winston-daily-rotate-file` (`backend/src/common/utils/logger.util.ts`), no separate config file — configured in code.
- Two rotating file transports: combined log (`LOG_DIR/combined/hdsp-%DATE%.log`, 50MB max size, 30-day retention, gzip-archived) and error-only log (`LOG_DIR/errors/hdsp-error-%DATE%.log`, 90-day retention). `LOG_DIR` defaults to `./logs`.
- Console transport is added when `NODE_ENV !== 'production'` or `LOG_TO_STDOUT=true`; for self-hosted production (`LOG_TO_STDOUT` unset/false), only file transports are active — PM2 separately captures the process's own stdout/stderr to `logs/pm2/*.log`.
- Nginx logs: `/var/log/nginx/access.log`, `/var/log/nginx/error.log` (standard Nginx defaults, referenced in `DEPLOY.md` §12).
- **No centralized log shipping (ELK, Loki, CloudWatch Logs) is configured for self-hosted** — logs remain on the local filesystem; plan external rotation/archival if retention beyond the built-in 30/90-day windows is required.

## 20. Troubleshooting

| Symptom | Likely cause | Check |
|---|---|---|
| `pm2 status` shows `errored` | Crash loop, bad env var, DB unreachable | `pm2 logs hdsp-backend --err --lines 100` |
| `/api/health` → `status: down` (Postgres) | Postgres service down, wrong credentials | `systemctl status postgresql` or `docker compose logs postgres` |
| `/api/health` → Oracle `unreachable` | Expected if HIS is down/misconfigured — non-critical, app still serves other functionality | Confirm `ORACLE_*` env vars; check HIS-side network path |
| Boot fails immediately with a Joi validation error | A required env var (`DB_HOST`, `JWT_SECRET`, etc.) is missing or fails validation (e.g., JWT secret <32 chars) | Check the exact Joi error message printed at startup — it lists every failing var (`abortEarly: false`) |
| 502 from Nginx | Backend/frontend process not running or wrong upstream port | `pm2 status` / `docker compose ps`; confirm `nginx.conf` upstream ports match `.env` `PORT` values |
| Login always fails after 5 attempts | Intentional account lockout — 5 failed attempts locks the account for 15 minutes (`auth.service.ts` `MAX_FAILED_ATTEMPTS=5`, `LOCK_DURATION_MINUTES=15`) | Wait, or clear `lockedUntil`/`failedLoginCount` on the `users` row |
| Rate-limit errors under moderate load with only 1 backend replica expected | Global throttle default is 100 req/60s per process (`app.module.ts`, hardcoded) — verify this isn't being hit by legitimate traffic, and remember PM2's 2 cluster instances each keep independent counters | `app.module.ts` `ThrottlerModule.forRoot()`; login-specific throttle is 5/min (`auth.controller.ts`) |
| Disk filling up | Unbounded `audit_logs` table growth (no retention/purge job exists in code) and/or uploads directory growth | Plan a manual purge/archival strategy — not automated |

## 21. Security Hardening

See `SECURITY_GUIDE.md` for the full guide; self-hosted-specific highlights:
- UFW default-deny inbound, only SSH/80/443 open (`scripts/setup.sh`).
- Redis hardened with `bind 127.0.0.1`, `requirepass`, `protected-mode yes` (`scripts/setup.sh`) — do not expose Redis to the network.
- Postgres/Redis bound to `127.0.0.1` only in the Docker Compose path.
- Replace the self-signed TLS cert with a CA-signed one before go-live (§6).
- Rotate `JWT_SECRET`/`JWT_REFRESH_SECRET` (min 32 chars, validated at boot) — rotating invalidates all existing sessions (no dual-secret grace period exists in code).
- Bcrypt cost factor 12 for password hashing (`auth.service.ts` `BCRYPT_ROUNDS = 12`); no server-side password complexity policy was found beyond presence/type validation — consider adding organizational policy enforcement at the identity-provider layer if required.
- Account lockout: 5 failed attempts → 15-minute lock (`auth.service.ts`).
- Run the backend service as the dedicated non-root `hdsp` system user (PM2 path) or rely on the Docker image's built-in non-root `hdsp` user + `dumb-init` PID 1 (Docker path, `backend.Dockerfile`).

## 22. Post-Deploy Verification Checklist

(Mirrors `DEPLOY.md` §8; see `DEPLOYMENT_CHECKLIST.md` for the full production checklist.)

```
[ ] curl -k https://<server>/api/health           → all indicators healthy (or Oracle "degraded", which is acceptable)
[ ] curl -k https://<server>/api/health/live       → 200 { status: 'ok' }
[ ] Frontend loads login page in a browser
[ ] Default SUPER_ADMIN login works — change the password immediately
[ ] License uploaded, or trial period confirmed active (Settings → License)
[ ] Oracle HIS connectivity status visible in /api/health (degraded is acceptable, down is not if HIS integration is required)
[ ] Test notification send (Notifications → Notification Log) if WhatsApp/email is configured
[ ] pm2 status shows all processes online (Path A) / docker compose ps shows all healthy (Path B)
[ ] Log rotation confirmed working: ls logs/backend/combined/
[ ] Backup cron entry installed and a manual test run of scripts/backup.sh succeeds
[ ] TLS certificate is CA-signed, not the default self-signed cert
[ ] UFW / firewall rules confirmed (only 22/80/443 inbound)
```
