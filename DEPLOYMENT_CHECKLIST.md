# HDSP — Production Deployment Checklist

Use this checklist for any new production environment (a new hospital self-hosted install, or a real cloud environment once AWS is applied for the first time). Items are grouped to match `PRODUCTION_DEPLOYMENT_RUNBOOK.md`'s structure. Items marked **(cloud only)** or **(self-hosted only)** apply to that path exclusively; unmarked items apply to both.

## Before Deployment

```
[ ] Target OS confirmed: Ubuntu 22.04 LTS (self-hosted) — the only OS the installer/setup scripts actually automate
[ ] Hardware sized per SELF_HOSTED_SETUP.md §1 (repository does not specify minimums — this is an engineering recommendation, confirm it fits your expected load)
[ ] Node.js 20 LTS available (self-hosted) / confirmed in Dockerfile base images (node:20-bookworm-slim)
[ ] Oracle Instant Client 21c Basic+SDK downloaded (if ORACLE_MODE=thick) — license-restricted, must be obtained directly from Oracle
[ ] Decided: PM2 bare-metal vs. Docker Compose (self-hosted) — do not mix
[ ] (cloud only) AWS account + credentials with permission to create every resource in infrastructure/terraform/
[ ] (cloud only) Existing VPC with public+private subnets confirmed available — Terraform does not create one
```

## Infrastructure

```
[ ] (self-hosted) Firewall (UFW) configured: default-deny inbound, allow only 22/80/443
[ ] (self-hosted) Postgres and Redis bound to 127.0.0.1 only, not exposed to the LAN
[ ] (cloud only) terraform init / plan / apply run successfully against a real staging.tfvars
[ ] (cloud only) ALB, ECS cluster, RDS, ElastiCache, S3, CloudFront, WAF all show as created in the AWS console
[ ] (cloud only) WAF confirmed attached to the ALB (not just defined in .tf — verify in console)
[ ] (cloud only) RDS Multi-AZ explicitly set true for production (rds_multi_az var) — not a default guarantee
[ ] (cloud only) RDS deletion_protection confirmed on for production
```

## Secrets

```
[ ] JWT_SECRET and JWT_REFRESH_SECRET generated (≥32 chars each, different values) — Joi validation will refuse boot otherwise
[ ] DB_PASSWORD, REDIS_PASSWORD set to strong, unique values (not the CHANGE_ME/dev placeholders)
[ ] (cloud only) hdsp/jwt Secrets Manager secret populated manually (Terraform only writes REPLACE_ME placeholders)
[ ] (cloud only) hdsp/aws-notifications populated if NOTIFICATION_PROVIDER_MODE=cloud
[ ] (cloud only) VENDOR_PORTAL_API_KEY and HDSP_PROVISIONING_API_KEY set to the SAME value on both HDSP backend and Vendor Portal backend
[ ] Vendor Portal's own JWT_SECRET and DEFAULT_ADMIN_PASSWORD changed from the insecure repository defaults (vendor-jwt-secret-change-me / VendorAdmin@123)
[ ] (self-hosted Docker) No CHANGE_ME placeholders remain in infrastructure/docker/.env — install.sh will refuse to start otherwise, but verify manually too
[ ] Never reuse staging secrets in production, and never reuse a self-hosted install's secrets in a cloud environment (explicit warning in CLOUD_DEPLOY.md)
```

## Database

```
[ ] PostgreSQL 15 provisioned (bare-metal, Docker, or RDS)
[ ] Extensions enabled (pgcrypto, pg_stat_statements, btree_gist) — automatic via infrastructure/postgres/init.sql for the dev/Docker path; confirm manually for bare-metal/RDS
[ ] Database + application role created (hdsp_app or equivalent) with least-privilege grants
[ ] npm run migration:run executed and npm run migration:show confirms all migrations applied
[ ] synchronize confirmed false (it is hardcoded false in every DataSource — verify no local override exists)
[ ] Initial tenant + SUPER_ADMIN user provisioned (npm run provision:self-hosted, or the cloud TenantProvisioningService flow via Vendor Portal)
[ ] Default SUPER_ADMIN password changed immediately after first login
```

## SSL

```
[ ] TLS certificate obtained — CA-signed or commercial, NOT the default self-signed cert shipped by scripts/setup.sh/DEPLOY.md
[ ] Certificate paths correctly referenced in infrastructure/nginx/hdsp.conf (self-hosted) or ACM ARN in variables.tf (cloud)
[ ] (cloud only) ACM certificate covers both the wildcard (*.company.com) and the apex domain, DNS-validated, issued BEFORE terraform apply
[ ] HSTS confirmed present (set at Nginx layer only — verify it's not lost if bypassing the provided Nginx config)
[ ] Renewal process confirmed: manual for self-hosted (no certbot automation exists in-repo — add it, or track manually), automatic for ACM (verify DNS validation records remain in place)
```

## Domain / DNS

```
[ ] Root domain registered and confirmed resolvable
[ ] (self-hosted) A record for the install's hostname points to the correct server IP
[ ] (cloud only) One wildcard CNAME/ALIAS record created: *.company.com -> <alb_dns_name>
[ ] (cloud only) Apex record also points to the ALB, matching alb.tf's host_header rule
[ ] Confirmed the reverse proxy / ALB forwards the original Host header unmodified — SubdomainTenantMiddleware depends entirely on this
[ ] admin./vendor./api. subdomains (if used) routed to the Vendor Portal service, not accidentally left to fall through to HDSP's tenant resolution
```

## Firewall

```
[ ] Inbound: only 22 (restricted to admin IPs), 80, 443 open externally
[ ] Postgres (5432) and Redis (6379) NOT reachable from outside the host/VPC
[ ] (cloud only) Security Groups scoped: ALB accepts 443/80 from the internet; ECS tasks accept traffic only from the ALB Security Group; RDS/ElastiCache accept traffic only from ECS tasks' Security Group
[ ] Oracle HIS connectivity path confirmed (outbound only, from backend or Connector to the hospital's Oracle listener port)
```

## Backups

```
[ ] scripts/backup.sh tested manually and produces a valid .sql.gz file
[ ] Cron entry installed (0 2 * * * /opt/hdsp/scripts/backup.sh ...) — NOT automated by any installer, must be added manually
[ ] Backup retention confirmed (30 days by default in backup.sh) meets your compliance requirements — adjust RETENTION_DAYS if not
[ ] Uploads directory / hdsp_uploads volume included in backup scope (NOT covered by backup.sh itself)
[ ] keys/ directory (license keys) included in backup scope
[ ] (cloud only) RDS backup/snapshot strategy explicitly configured — NOT automated in Terraform today, this is new work, not a default
[ ] A restore has actually been tested (see PRODUCTION_DEPLOYMENT_RUNBOOK.md §13) — not just assumed to work
```

## Monitoring

```
[ ] /health, /health/live, /health/ready all return expected status on the deployed environment
[ ] (self-hosted) External uptime monitor polling /health/live configured (nothing built-in pushes alerts)
[ ] (cloud only) CloudWatch Log groups confirmed populated for all 4 ECS services
[ ] (cloud only) CloudWatch Alarms configured — NOT present in Terraform by default, must be added
[ ] pm2 monit / docker stats reviewed for baseline resource usage (self-hosted)
```

## Logs

```
[ ] Log rotation confirmed working: logs/combined/ (30-day retention) and logs/errors/ (90-day retention)
[ ] LOG_TO_STDOUT set correctly for the environment (false for self-hosted/PM2 — file transports active; true for cloud/ECS — file transports skipped, stdout captured by CloudWatch instead)
[ ] Nginx access/error logs confirmed writing (self-hosted): /var/log/nginx/{access,error}.log
[ ] Disk space monitored — audit_logs table has NO retention/purge job in code; plan manual archival before disk fills
```

## Alerting

```
[ ] Failed-login lockout behavior understood by support staff (5 attempts -> 15 min lock) to avoid false "system down" reports
[ ] Notification failure alerting process defined (check Notifications -> Notification Log manually — no automated alert exists in code)
[ ] License expiry monitoring in place (Settings -> License banner; no automated external alert exists in code)
[ ] Incident response contacts/process defined per PRODUCTION_DEPLOYMENT_RUNBOOK.md §11 — no paging/status-page integration exists in this codebase
```

## Testing

```
[ ] Backend CI green on the release commit/tag: lint, unit tests, build, S3 conformance test, e2e smoke test
[ ] Frontend CI green: type-check, lint, build (no automated test suite exists for the frontend today — manual QA substitutes)
[ ] Connector CI green if Connector is in use for this deployment
[ ] Manual smoke test performed against the actual target environment (not just CI) — login, a core workflow, health endpoints
[ ] (cloud only) check-compatibility.js confirms Backend/Connector version compatibility if a Connector is deployed
```

## Go-Live

```
[ ] Final version tag identified and confirmed deployed (check /health or a version endpoint, and the version-manifest.json build artifact)
[ ] DNS cutover performed (if migrating from a previous environment/IP)
[ ] Default credentials (SUPER_ADMIN, Vendor Portal admin) changed
[ ] Stakeholders notified of go-live window
[ ] Rollback plan confirmed and understood by whoever is on point (PRODUCTION_DEPLOYMENT_RUNBOOK.md §3)
```

## Post-Deployment Verification

```
[ ] curl -k https://<host>/api/health -> all indicators healthy (Oracle "degraded" acceptable if HIS is not yet connected)
[ ] curl -k https://<host>/api/health/live -> 200
[ ] curl -k https://<host>/api/health/ready -> 200
[ ] Frontend loads login page over HTTPS with a valid (non-self-signed) certificate
[ ] Login succeeds with the (now-changed) admin credentials
[ ] A representative end-to-end workflow tested manually (not just health checks)
[ ] (cloud only) Confirm tenant subdomain routing works: a request to <tenant>.company.com resolves the correct tenant (check JWT claims / TenantScopeGuard logs for mismatches)
[ ] (cloud only) Confirm hdsp-worker service shows desiredCount=1 exactly — not scaled up
[ ] Backup cron/schedule confirmed active post-deploy, not just pre-deploy
[ ] This checklist filed/archived with the deployment record for future audit reference
```
