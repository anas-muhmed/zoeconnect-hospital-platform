# HDSP — Daily Operations Guide

**Audience:** whoever is on rotation for day-to-day operation of a running HDSP environment (self-hosted hospital install, the OCI demo, or — once live — a cloud environment). This is the routine-maintenance companion to `PRODUCTION_DEPLOYMENT_RUNBOOK.md` (incident/change procedures) and `SECURITY_GUIDE.md`.

---

## 1. Checking Services

**PM2 path:**
```bash
pm2 status                          # process list, uptime, restart count, memory
pm2 monit                           # live CPU/memory dashboard
pm2 describe hdsp-backend           # detailed info for one process
```
Backend runs 2 cluster instances; frontend runs 1 fork-mode instance. Both are capped at 512MB (`max_memory_restart`) — a restart triggered by hitting this cap is expected behavior, not necessarily a bug, but frequent restarts warrant investigation.

**Docker path:**
```bash
docker compose -f infrastructure/docker/docker-compose.selfhosted.yml ps
# look at the STATUS column — postgres/redis/backend all have healthchecks defined;
# frontend does not (no healthcheck block in the compose file for it)
```

**Cloud path:**
```bash
aws ecs describe-services --cluster <cluster> --services hdsp-api hdsp-worker hdsp-frontend
# confirm runningCount == desiredCount for each; hdsp-worker's desiredCount should always be 1
```

**Application-level check (any environment):**
```bash
curl -s https://<host>/api/health | jq .        # full dependency status
curl -s https://<host>/api/health/live           # trivial liveness
curl -s https://<host>/api/health/ready          # Postgres + Redis only
```

## 2. Checking Logs

| Environment | Location |
|---|---|
| PM2 backend | `/opt/hdsp/logs/pm2/backend-{out,error}.log`, plus app-level Winston logs at `logs/combined/hdsp-YYYY-MM-DD.log` (50MB rotation, 30-day retention) and `logs/errors/hdsp-error-YYYY-MM-DD.log` (90-day retention) |
| PM2 frontend | `/opt/hdsp/logs/pm2/frontend-{out,error}.log` |
| Docker | `docker compose logs -f backend` / `docker compose logs -f frontend` / `docker compose logs -f postgres redis` |
| Nginx | `/var/log/nginx/access.log`, `/var/log/nginx/error.log` |
| Cloud (ECS) | CloudWatch Logs: `/ecs/hdsp-api`, `/ecs/hdsp-worker`, `/ecs/hdsp-frontend`, `/ecs/hdsp-connector` (per-service stream prefixes); `LOG_TO_STDOUT=true` in cloud mode means Winston skips file transports entirely and relies on stdout capture — do not look for on-disk log files inside ECS containers, they won't be there |

Winston format: JSON for file transports, colorized human-readable text for console (dev only, or when `LOG_TO_STDOUT=true`). Search tip: every log line includes a `timestamp` and, where applicable, a `request_id` you can correlate against `audit_logs.request_id` for a specific incident.

## 3. Restarting Services

**PM2:**
```bash
pm2 restart hdsp-backend            # both cluster instances, one at a time (zero downtime)
pm2 reload hdsp-backend             # equivalent, preferred for zero-downtime graceful reload
pm2 restart hdsp-frontend
```

**Docker:**
```bash
docker compose -f infrastructure/docker/docker-compose.selfhosted.yml restart backend
docker compose -f infrastructure/docker/docker-compose.selfhosted.yml restart frontend
```

**Cloud:**
```bash
aws ecs update-service --cluster <cluster> --service hdsp-api --force-new-deployment
```
Never restart `hdsp-worker` in a way that temporarily runs 2+ tasks simultaneously (e.g. a manual scale-up during restart) — the cron scheduler has no distributed lock and would double-execute scheduled jobs.

## 4. Disk Space

Primary growth sources, in order of typical impact:
- **`audit_logs` Postgres table** — no retention/purge job exists in code (confirmed absence, see `SECURITY_GUIDE.md` §13); this table grows indefinitely unless manually archived/pruned.
- **Uploaded files** (`LocalStorageProvider`, `./uploads` directory or the `hdsp_uploads` Docker volume) — grows with CMS media, form attachments, feedback uploads, etc. Switch to `STORAGE_DRIVER=s3` for cloud deployments to move this off local disk entirely.
- **Rotated logs** — bounded by design (30-day/90-day retention, 50MB max file size, gzip-archived), but confirm the rotation is actually functioning (`ls logs/combined/` should show a bounded, gzip-compressed set of recent files, not an ever-growing pile).
- **Postgres/Redis data volumes** — grow with normal usage; monitor via `df -h` on the host or `docker system df` for Docker volume sizes.

`/api/health`'s disk check fails at 95% usage — treat approaching this threshold as an operational trigger, not a surprise.

## 5. Database Maintenance

```bash
# Applied vs. pending migrations
cd backend && npm run migration:show

# Postgres-native maintenance (standard practice, not HDSP-specific automation)
psql -U hdsp_app -d hdsp_db -c "VACUUM ANALYZE;"
psql -U hdsp_app -d hdsp_db -c "SELECT pg_size_pretty(pg_database_size('hdsp_db'));"

# Check audit_logs table size specifically, given the known no-retention gap
psql -U hdsp_app -d hdsp_db -c "SELECT pg_size_pretty(pg_total_relation_size('audit_logs'));"
```
`pg_stat_statements` is enabled by default (`infrastructure/postgres/init.sql`) — use it to identify slow queries: `SELECT query, calls, total_exec_time FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;`. No automated VACUUM/ANALYZE scheduling beyond Postgres's own autovacuum is configured by this codebase — autovacuum defaults apply unless you've customized `postgresql.conf` (commented-out tuning suggestions exist in `init.sql` but are not applied automatically).

## 6. Redis Maintenance

```bash
redis-cli -a <password> INFO memory        # memory usage
redis-cli -a <password> DBSIZE             # key count
redis-cli -a <password> KEYS "hdsp:jwt:blacklist:*" | wc -l   # blacklist size (self-expiring, should stay bounded)
```
Redis holds: JWT blacklist (`hdsp:jwt:blacklist:<jti>`, self-expiring per token TTL), session activity keys, general cache (default TTL 300s), and BullMQ queue state (`NOTIFICATIONS`, `AUDIT_LOGS`, `LOYALTY_EVENTS`, `CAMPAIGN_TRIGGERS`, `ATTENDANCE_REALTIME`). Bull jobs are configured with `removeOnComplete: true` and bounded `removeOnFail` counts, so completed job data does not accumulate — a growing `DBSIZE` over time more likely indicates a cache-key leak or a stuck queue than expected behavior; investigate rather than assume it's fine.

## 7. Backups

```bash
# Manual on-demand backup (same command the cron entry should be running)
/opt/hdsp/scripts/backup.sh

# Confirm the cron entry is actually installed — NOT automated by any installer
crontab -l | grep backup.sh

# List recent backups
ls -lh /opt/hdsp/backups/
```
Reminder: `scripts/backup.sh` covers **Postgres only** (`pg_dump --format=custom --compress=9`, 30-day retention, auto-pruned). It does **not** back up the uploads directory, the `keys/` license directory, or Redis — these need a separate backup step if required for your recovery objectives. No cloud/RDS backup automation exists in Terraform today — see `PRODUCTION_DEPLOYMENT_RUNBOOK.md` §12 for the cloud gap.

## 8. Restores

See `PRODUCTION_DEPLOYMENT_RUNBOOK.md` §6 and §13 for the full procedure and a recommended quarterly drill cadence. Quick reference:
```bash
pm2 stop all   # or: docker compose stop backend frontend
pg_restore --clean --if-exists --no-owner --no-acl -U hdsp_app -d hdsp_db /opt/hdsp/backups/hdsp_<timestamp>.sql.gz
cd backend && npm run migration:run    # catch up any migrations newer than the backup
pm2 start all   # or: docker compose up -d
```
This procedure is not scripted end-to-end in the repository (only the backup half is) — treat it as a documented manual runbook, and validate it periodically rather than assuming it works because the backup file exists.

## 9. Monitoring (routine checks)

No built-in alerting exists for self-hosted deployments — the following should be checked on a regular cadence (daily, or via an external uptime monitor polling the same endpoints):
```
[ ] curl /api/health — all dependencies healthy (Oracle "degraded" is acceptable if HIS integration is expected to be intermittent)
[ ] pm2 status / docker compose ps — all processes/containers up, restart counts not climbing
[ ] Disk usage — trending toward the 95% health-check threshold?
[ ] License status — Settings → License, confirm not expired/expiring soon (no automated external alert exists)
[ ] Notification failure rate — Notifications → Notification Log, investigate if failures exceed ~5% (per DEPLOY.md's own guidance) — usually a WhatsApp/SES token expiry
```
Cloud environments additionally have CloudWatch Logs populated automatically, but **no CloudWatch Alarms exist in Terraform** — this routine-check discipline applies there too until alarms are added.

## 10. Alerts

No paging/alerting integration (PagerDuty, Opsgenie, etc.) exists anywhere in this codebase. Today, "alerting" means a human following §9's routine-check list, or an externally-configured uptime monitor (e.g. a simple cron+curl+webhook, or a third-party service) pointed at `/api/health/live`. If building real alerting, natural hook points already exist and are code-verified: the `/health` endpoint's structured JSON response (per-dependency pass/fail), the `audit_logs` table (queryable for `LOGIN_FAILED` spikes, etc.), and CloudWatch Logs (cloud only) as a source for log-based metric filters and alarms — none of this wiring exists yet, but the raw signals are real and available.
