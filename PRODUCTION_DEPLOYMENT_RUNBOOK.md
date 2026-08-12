# HDSP — Production Deployment Runbook

**Audience:** on-call engineers and DevOps performing live operations. This is the action-oriented companion to `SELF_HOSTED_SETUP.md`/`CLOUD_SETUP.md` (the "how it's built" docs) and `DEPLOYMENT_CHECKLIST.md` (the "before you go live" gate). Procedures are separated by deployment type where they differ; commands are quoted from the actual scripts/configs, not invented.

---

## 1. First Deployment

**Self-hosted:** follow `SELF_HOSTED_SETUP.md` §11 (PM2) or §12 (Docker) end to end. Key ordering that must not be skipped: run migrations (`npm run migration:run`) **before** first start; run `npm run provision:self-hosted` (Docker path) or the equivalent `scripts/provision-self-hosted.ts` (PM2 path) to create the initial `'default'` tenant and SUPER_ADMIN user — the app will boot without this, but no login will be possible until it runs.

**Cloud:** follow `CLOUD_SETUP.md` §15. Order matters: `terraform apply` → populate `hdsp/jwt` and `hdsp/aws-notifications` secrets manually → build/push images → run migrations against RDS from a one-off task → point DNS (one wildcard record) → seed one real `Tenant` row with a subdomain for smoke testing → re-apply/force-new-deployment with real image tags → verify (§9 checklist in `CLOUD_DEPLOY.md`).

## 2. Rolling Update

**Self-hosted, PM2:** `DEPLOY.md` §9 — `git pull`, rebuild backend + **run migrations before reload**, rebuild frontend, `pm2 reload infrastructure/pm2/ecosystem.config.js --update-env`, `pm2 save`. PM2 cluster mode (2 backend instances) keeps requests flowing during reload — this is a true rolling update at the process level.

**Self-hosted, Docker:** `infrastructure/installer/install.sh <version> --upgrade` — pulls new images, runs migrations, re-runs idempotent provisioning, brings the stack up, polls `/api/v1/health/live`. If a Connector is in use, `check-compatibility.js` will refuse the upgrade if it would break the Backend↔Connector compatibility matrix (`connector/COMPATIBILITY.json`).

**Cloud:** trigger `deploy-cloud.yml` (`workflow_dispatch`, provide `version`) — runs `terraform apply` against staging first (smoke-tested via `/api/v1/health/live`, 30×10s retries), then production after the GitHub Environment's required-reviewer approval. ECS's own rolling-update settings (`minimumHealthyPercent=100`, `maximumPercent=200` on the API service) provide zero-downtime rollout at the task level. **Always confirm the worker service (`hdsp-worker`) stays at exactly 1 desired task** — scaling it up during a deploy would double-execute scheduled cron jobs (no distributed lock exists).

## 3. Rollback

**Self-hosted:** `DEPLOY.md` §10 — `git checkout <previous-tag>`, `npm run migration:revert` if the schema changed (repeat per migration if multiple need reverting — check with `npm run migration:show` first), rebuild, `pm2 reload` (or re-run the Docker installer at the previous version tag).

**Cloud:** re-run `deploy-cloud.yml` with the previous `version`, or manually `terraform apply -var api_image_tag=<prev> -var worker_image_tag=<prev> -var frontend_image_tag=<prev>`. Manually run `npm run migration:revert` against RDS first if the version being rolled back from introduced a schema change — ECS/Terraform rollback does not touch the database automatically.

No automated rollback tooling exists in either path — this is manual and tag-driven throughout.

## 4. Scaling

**Self-hosted:** limited to the box's own resources — PM2 cluster `instances: 2` for the backend is fixed in `ecosystem.config.js`; raise it (and re-tune `max_memory_restart`) if the host has spare CPU/RAM, or move to the cloud topology if a single box is no longer sufficient.

**Cloud:** `hdsp-api` and `hdsp-frontend` ECS services can scale horizontally (`desiredCount`, or an autoscaling policy — **note: no autoscaling policy currently exists in Terraform**, scaling today is manual via `desiredCount` changes). `hdsp-worker` **must remain at 1 task** (§2's caveat) until a distributed cron lock is implemented — do not scale this service up as a response to load; if the worker is under load, investigate whether Bull queue consumers (which *are* safe to scale) are the actual bottleneck versus the cron scheduler itself.

## 5. Database Migration

Always run migrations as a discrete step, before restarting/redeploying application instances, never automatically on boot (no `synchronize`/auto-migrate path exists — confirmed `synchronize: false` hardcoded in every DataSource). Commands:
```bash
cd backend
npm run migration:show      # see what's applied vs. pending
npm run migration:run       # apply pending migrations
npm run migration:revert    # revert the most recently applied migration (repeat for multiple)
npm run migration:generate -- src/database/migrations/<Name>   # after an entity change, to create a new migration
```
Cloud: run from a one-off ECS task or bastion with a route to RDS, with `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` pointed at the RDS endpoint. There are 98 migration files as of this writing — always check `migration:show` before assuming a fresh environment's state.

## 6. Emergency Recovery

**Application down (self-hosted):**
1. `pm2 status` (or `docker compose ps`) — identify which process is down.
2. `pm2 logs hdsp-backend --err --lines 100` (or `docker compose logs backend`) — find the error.
3. Check `/api/health` for dependency status (Postgres/Redis/Oracle/Bull/memory/disk) — a 503 here narrows the cause immediately.
4. If Postgres/Redis are the cause: `systemctl status postgresql redis` (bare-metal) or `docker compose ps postgres redis` (Docker) — restart the dependency, then `pm2 restart all`/`docker compose restart backend`.
5. If nothing else works and a recent deploy is the suspected cause: follow §3 rollback.

**Application down (cloud):** check ECS service events in the console/CLI (`aws ecs describe-services`), check the ALB target group health, check CloudWatch Logs (`/ecs/hdsp-api`, `/ecs/hdsp-worker`, `/ecs/hdsp-frontend`) for the actual error. If a bad deploy is suspected, roll back per §3.

**Database corruption/loss:** stop the application (§ above), restore from the most recent backup per §12/§13, run any migrations newer than the backup, restart. **This procedure is not automated or drill-tested in this codebase — validate it in a non-production environment first if you have not done so recently.**

## 7. Certificate Renewal

**Self-hosted / OCI demo:** no automated renewal exists today (no `certbot` timer configured anywhere in the repo). If Let's Encrypt is adopted per `DOMAIN_AND_DNS_SETUP.md` §8, `certbot`'s own systemd timer/cron entry handles renewal automatically once installed — until then, self-signed or commercial certs must be renewed and swapped into `/etc/nginx/ssl/hdsp.{crt,key}` manually, followed by `nginx -t && systemctl reload nginx`.

**Cloud:** ACM certificates renew automatically as long as DNS validation records remain in place — no manual action required, but confirm the validation CNAME records were not removed from DNS after initial issuance (a common cause of failed ACM auto-renewal).

## 8. Secret Rotation

**JWT secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`):** rotating either one **invalidates every existing session** — no dual-secret grace-period/rotation window exists in `jwt.strategy.ts` or `jwt.config.ts`. Plan rotation for a maintenance window; all users will need to log in again. Generate new secrets with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` (must be ≥32 chars per the Joi schema).

**Self-hosted:** edit `.env`, restart the application (`pm2 reload`/`docker compose up -d --force-recreate backend`).

**Cloud:** update the `hdsp/jwt` Secrets Manager secret's `secret`/`refreshSecret` fields, then force a new ECS deployment (`aws ecs update-service --force-new-deployment` for both `hdsp-api` and `hdsp-worker`, since both read the same secret) so tasks restart with the new value injected.

**Database/Redis passwords:** rotate at the source (Postgres `ALTER ROLE ... PASSWORD`, Redis `requirepass`/ElastiCache auth token rotation), update the corresponding `.env` or Secrets Manager entry, restart the application. RDS/ElastiCache-managed rotation (AWS Secrets Manager automatic rotation) is **not configured** in `secrets.tf` — this is a manual process today.

**`VENDOR_PORTAL_API_KEY`:** must be rotated **simultaneously** on both the HDSP backend (`VENDOR_PORTAL_API_KEY` env var) and the Vendor Portal backend (`HDSP_PROVISIONING_API_KEY` env var) — they must match exactly (constant-time compared by `VendorPortalApiKeyGuard`), or tenant provisioning calls will start failing with 401/403.

## 9. Monitoring

**Self-hosted:** poll `/health`, `/health/live`, `/health/ready` externally (no built-in alerting exists — see `OPERATIONS_GUIDE.md` for a daily-check routine). `pm2 status`/`pm2 monit` for process-level visibility.

**Cloud:** CloudWatch Logs are populated for all four ECS services (`awslogs` driver, real). **No CloudWatch Alarms or dashboards exist in Terraform today** — set these up manually or add them to `infrastructure/terraform/` as a follow-up; ALB target-group health and ECS service-event history are the only built-in signals currently available without additional configuration.

## 10. Health Checks

| Endpoint | Checks | Use |
|---|---|---|
| `GET /health` | Postgres, Redis, Oracle HIS, Bull queues, memory heap ≤512MB, disk ≤95% | Full dependency status — use for manual investigation, not as a load-balancer target (a transient Oracle blip would mark the whole app unhealthy) |
| `GET /health/live` | None — always 200 | Liveness probe target (ALB/ECS/Docker healthcheck) |
| `GET /health/ready` | Postgres + Redis only | Readiness probe target — narrower than `/health` deliberately, since Oracle HIS degrading shouldn't pull a task out of rotation |

## 11. Incident Response

1. **Detect** — health check failure, PM2/ECS alert, or user report.
2. **Triage** — check `/health` for which dependency is failing; check logs (Winston files or CloudWatch) for the actual error/stack trace.
3. **Contain** — if a bad deploy is the cause, roll back immediately (§3) rather than attempting a forward fix under pressure.
4. **Communicate** — no incident-status-page or automated alerting/paging integration exists in this codebase; this is a manual/organizational process to define separately.
5. **Resolve** — apply the fix (rollback, dependency restart, or a hotfix per `GIT_WORKFLOW.md` §5).
6. **Post-incident** — check `audit_logs` for relevant events around the incident window (no retention/purge job exists, so historical data should still be present); write up findings; if the incident revealed a documentation or automation gap (e.g., missing alerting, missing DR automation — both flagged elsewhere in this doc set as absent), track it as follow-up work rather than re-discovering it next time.

## 12. Backup Verification

**Self-hosted:** `scripts/backup.sh` produces `/opt/hdsp/backups/hdsp_<timestamp>.sql.gz` via `pg_dump --format=custom --compress=9`. Verify a backup is restorable **periodically, not just after creation** — a backup file existing is not proof it's valid:
```bash
# Verify integrity without a full restore
pg_restore --list /opt/hdsp/backups/hdsp_<timestamp>.sql.gz
# Full restore-test into a scratch database, e.g. hdsp_db_restoretest, on a non-production host
createdb hdsp_db_restoretest
pg_restore --no-owner --no-acl -d hdsp_db_restoretest /opt/hdsp/backups/hdsp_<timestamp>.sql.gz
```
Confirm the cron entry is actually installed (`crontab -l | grep backup.sh`) — scheduling is **not automated by any installer**, so a fresh deployment has no backups running until this is added manually (see `SELF_HOSTED_SETUP.md` §14).

**Cloud:** **no backup automation exists in Terraform** (no AWS Backup plan, no explicit RDS automated-snapshot configuration confirmed in `rds.tf` beyond whatever RDS default applies). This is a genuine gap — before production tenant data exists in this environment, configure and verify RDS automated backups/snapshots and a documented restore drill. Do not assume backups exist here simply because they exist for self-hosted.

## 13. Restore Verification Drill (recommended cadence: quarterly)

1. Restore the most recent backup into an isolated scratch environment (never directly into production).
2. Run migrations forward from the backup's point-in-time to current (`npm run migration:run`).
3. Boot the application against the restored database, confirm `/health` passes and a test login succeeds.
4. Document the time taken (informs your actual RTO, since none is currently documented anywhere in this codebase) and any issues encountered.
5. Record the drill result and date — this record does not currently exist anywhere in the repository and should be started as an operational practice.
