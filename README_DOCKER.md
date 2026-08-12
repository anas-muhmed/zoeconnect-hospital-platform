# HDSP / ZoeConnect — Docker Compose Production Deployment

Operator guide for running the Hospital Platform and Vendor Portal on a
plain Ubuntu Server using Docker + Docker Compose, with images pulled from
GitHub Container Registry (GHCR). No Node.js, npm, TypeScript, Nest CLI,
or build toolchain is required on the server — only Docker and Docker
Compose.

This deployment path is fully additive to the repository. It does not
replace or modify `infrastructure/` (the AWS/ECS/Terraform cloud path),
`vendor-portal/docker-compose.yml` (the vendor portal's standalone dev
stack), or any application code.

---

## 1. Architecture Overview

Two independent applications, each with its own database, sharing one
Ubuntu server and one Docker network:

```
                              Internet
                                 │
                        80 / 443 (optional)
                                 │
                          ┌──────▼──────┐
                          │  hdsp-nginx │  (profiles: proxy, full)
                          └──────┬──────┘
                 ┌───────────────┼────────────────────┐
                 │               │                    │
        ┌────────▼───────┐ ┌─────▼──────┐   ┌─────────▼────────┐
   3000 │  hdsp-frontend │ │hdsp-backend│3001│  (Hospital Platform)
        └────────┬───────┘ └─────┬──────┘
                  │               │
                  │        ┌──────┴───────┐
                  │        │              │
                  │  ┌─────▼─────┐  ┌─────▼─────┐
                  │  │hdsp-redis │  │hdsp-postgres│   (internal only)
                  │  └───────────┘  └────────────┘
                  │
        ┌─────────▼────────┐ ┌──────────────┐
   4001 │ vendor-frontend  │ │vendor-backend│ 4000  (Vendor Portal)
        └──────────────────┘ └──────┬───────┘
                                     │
                               ┌──────▼───────┐
                               │vendor-postgres│        (internal only)
                               └───────────────┘

         ┌─────────▼────────┐
    3010 │    zoeconnect    │                   (ZoeConnect App)
         └──────────────────┘
```

- **Hospital Platform** (`hdsp-frontend`, `hdsp-backend`, `hdsp-postgres`,
  `hdsp-redis`) — the main hospital-facing application. Backend talks to
  the hospital's on-prem Oracle HIS directly (`ORACLE_MODE=thin` by
  default, no Instant Client needed — see § Environment Variables).
- **Vendor Portal** (`vendor-frontend`, `vendor-backend`,
  `vendor-postgres`) — a separate license-management application used by
  your vendor/support team. Entirely independent database and session
  state from the Hospital Platform; the two only talk to each other over
  HTTP for the optional cloud-tenant-provisioning flow.
- **ZoeConnect** (`zoeconnect`) — independent Next.js application that integrates
  with the Hospital Backend and Vendor Portal APIs.
- **hdsp-nginx** — optional reverse proxy in front of both apps (off by
  default; see § Deployment). Prepared for TLS but ships HTTP-only until
  you add certificates (§ Security).
- Postgres and Redis are never published to the host — only reachable
  inside the `hdsp_net` Docker network, by service name.

Full service definitions: [`docker-compose.yml`](./docker-compose.yml).
Image build logic: [`docker/`](./docker/).

---

## 2. Prerequisites

| Component             | Minimum version | Notes |
|------------------------|-----------------|-------|
| Ubuntu                | 22.04 LTS       | Other Debian-based distros likely work but are untested here |
| Docker Engine         | 24.0+           | `docker --version` |
| Docker Compose plugin | v2.20+          | `docker compose version` (needed for `depends_on: condition:`, `profiles:`, `pull_policy:`) |
| PostgreSQL (in-image) | 15              | Pulled automatically as `postgres:15` |
| Redis (in-image)      | 7               | Pulled automatically as `redis:7` |
| Node.js (in-image)    | 20 LTS          | Only inside the containers — nothing to install on the host |

Install Docker + Compose on a fresh Ubuntu 22.04 server:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # log out/in after this
sudo apt-get install -y docker-compose-plugin
```

**Firewall.** Open only what you intend to expose publicly:

```bash
sudo ufw allow 22/tcp        # SSH
sudo ufw allow 3000/tcp      # Hospital frontend (skip if using Nginx only)
sudo ufw allow 3001/tcp      # Hospital backend   (skip if using Nginx only)
sudo ufw allow 4000/tcp      # Vendor backend      (skip if using Nginx only)
sudo ufw allow 4001/tcp      # Vendor frontend     (skip if using Nginx only)
sudo ufw allow 8080/tcp      # Nginx (if using the proxy/full profile)
# sudo ufw allow 8443/tcp    # Nginx HTTPS, once TLS is enabled — see § Security
sudo ufw enable
```

Do **not** open 5432 or 6379 — Postgres and Redis are intentionally never
published to the host (see `docker-compose.yml`'s networking notes).

---

## 3. Directory Layout

Everything lives under the repository root on the server:

```
HDSP_HYBRID/
├── docker-compose.yml
├── .env.production            # you create this — copy from .env.production.example, never commit it
├── docker/
│   ├── backend.Dockerfile
│   ├── frontend.Dockerfile
│   ├── vendor-backend.Dockerfile
│   ├── vendor-frontend.Dockerfile
│   └── nginx/
│       ├── nginx.conf
│       ├── conf.d/hdsp.conf
│       └── ssl/                # you place real certs here (gitignored) — see § Security
├── backend/
│   └── keys/                  # license-public.pem — bind-mounted read-only into hdsp-backend
├── vendor-portal/
│   └── keys/                  # RSA private key — bind-mounted read-only into vendor-backend
```

Runtime state lives in **named Docker volumes**, not on the host
filesystem directly (inspect with `docker volume ls` / `docker volume
inspect`):

| Volume                  | Mounted into      | Contents |
|--------------------------|-------------------|----------|
| `hdsp_postgres_data`     | `hdsp-postgres`   | Hospital database |
| `hdsp_redis_data`        | `hdsp-redis`      | Redis persistence (RDB snapshots) |
| `hdsp_uploads`           | `hdsp-backend`    | User-uploaded files (display media, CMS media, feedback images) |
| `hdsp_logs`              | `hdsp-backend`    | Winston log files — empty if `LOG_TO_STDOUT=true` |
| `vendor_postgres_data`   | `vendor-postgres` | Vendor Portal database |

`backend/keys/` and `vendor-portal/keys/` are **bind mounts**, not
volumes — they're read-only and sourced directly from the repo checkout
on the host, since they're static credentials you manage yourself, not
runtime-generated state.

---

## 4. Environment Variables

All configuration lives in one file: `.env.production` (create it by
copying [`.env.production.example`](./.env.production.example)). It does
two jobs — see the comment block at the top of that file for the full
explanation:

1. Supplies `${VAR}` interpolation used directly inside `docker-compose.yml`
   (image tags, ports, Postgres init credentials).
2. Is passed to `hdsp-backend`/`hdsp-migrate` via `env_file:`, using the
   exact variable names `backend/.env.example` and
   `backend/src/config/env.validation.ts` already expect — nothing
   renamed, nothing new invented.

**Hospital variables are unprefixed** (`DB_USER`, `JWT_SECRET`, ...) —
they map 1:1 to what the NestJS backend's Joi schema validates at boot.

**Vendor variables are `VENDOR_`-prefixed** (`VENDOR_DB_USER`,
`VENDOR_JWT_SECRET`, ...) because vendor-backend's own variable names
would otherwise collide with the hospital's (and differ in places — e.g.
vendor uses `DB_PASS`, hospital uses `DB_PASSWORD`). `docker-compose.yml`
maps each `VENDOR_*` value to the literal name vendor-backend expects
inside its `environment:` block — you don't need to do anything for this
beyond filling in the `VENDOR_*` values.

**Required, no default** (the app refuses to boot without these):
`DB_USER`, `DB_PASSWORD`, `DB_NAME`, `REDIS_PASSWORD`, `JWT_SECRET`
(≥32 chars), `JWT_REFRESH_SECRET` (≥32 chars), `VENDOR_DB_USER`,
`VENDOR_DB_PASS`, `VENDOR_DB_NAME`, `VENDOR_JWT_SECRET`.

**Recommended defaults already set in the example file:**

- `ORACLE_MODE=thin` — oracledb's pure-JS driver, no Oracle Instant
  Client needed. `docker/backend.Dockerfile` does not bundle Instant
  Client (Oracle's license forbids redistributing it). If your HIS
  genuinely requires `thick` mode (Oracle 11g/12c), you must additionally
  mount a real Instant Client directory into the container:
  ```yaml
  # add under hdsp-backend.volumes: in docker-compose.yml
  - /opt/oracle/instantclient_21_x:/opt/oracle/instantclient:ro
  ```
  then set `ORACLE_MODE=thick` in `.env.production`. `libaio1` (the one
  OS-level dependency thick mode needs) is already installed in the
  image either way.
- `LOG_TO_STDOUT=true` — routes backend logs through `docker compose
  logs` via the shared `x-logging` json-file driver (10MB × 5 files per
  container) instead of the `hdsp_logs` volume. Set to `false` if you'd
  rather keep rotating log files in that volume.
- `DEPLOYMENT_MODE=self_hosted` — matches this single-hospital Compose
  topology. Only change to `cloud` if you specifically need the
  multi-tenant cloud behavior (requires additional vars — see
  `env.validation.ts`).

---

## 5. Deployment

```bash
# 1. Clone the repo and check out the version you want to deploy
git clone <your-repo-url> HDSP_HYBRID && cd HDSP_HYBRID

# 2. Create and fill in your environment file
cp .env.production.example .env.production
nano .env.production   # fill in every CHANGE_ME value

# 3. Authenticate to GHCR (only needed if the package is private)
echo "$GHCR_TOKEN" | docker login ghcr.io -u <your-username> --password-stdin

# 4. Pull the versioned images
docker compose --env-file .env.production pull

# 5. Start the databases first and run migrations
docker compose --env-file .env.production --profile migration up -d hdsp-postgres vendor-postgres
docker compose --env-file .env.production --profile migration build hdsp-migrate vendor-migrate
docker compose --env-file .env.production --profile migration run --rm hdsp-migrate
docker compose --env-file .env.production --profile migration run --rm vendor-migrate

# 6. Start everything
docker compose --env-file .env.production --profile full up -d
# — or, to run only one application:
#   docker compose --env-file .env.production --profile hospital up -d
#   docker compose --env-file .env.production --profile vendor up -d

# 7. Verify
docker compose --env-file .env.production ps
curl -f http://localhost:3001/api/v1/health/live
curl -f http://localhost:3000/
curl -f http://localhost:4000/   # vendor-backend has no dedicated health route — any response means it's up
curl -f http://localhost:4001/
```

Migrations are **never** run automatically on container start (see the
"Migrations" note at the top of `docker-compose.yml`) — step 5 above is
required on first deploy and again on any update that adds a migration.

---

## 6. Updating

```bash
cd HDSP_HYBRID
git pull                                          # if you track compose/Dockerfile changes in git

# 1. Pull the new image versions
#    Bump HDSP_VERSION in .env.production first if you pin to a specific
#    release tag rather than `latest`/`main`.
docker compose --env-file .env.production pull

# 2. Run any new migrations (safe to run even if there's nothing pending)
docker compose --env-file .env.production --profile migration build hdsp-migrate vendor-migrate
docker compose --env-file .env.production --profile migration run --rm hdsp-migrate
docker compose --env-file .env.production --profile migration run --rm vendor-migrate

# 3. Recreate containers with the new images
docker compose --env-file .env.production --profile full up -d

# 4. Verify (same health checks as § Deployment step 7)
```

**Rolling back:** set `HDSP_VERSION` in `.env.production` back to the
previous known-good tag, then repeat steps 1 and 3 above (skip step 2 —
never revert a migration by rolling the image back; if the new version's
migration must be undone, use `npm run migration:revert` via the same
builder-stage pattern as `hdsp-migrate`, or restore from a pre-update
database backup — see § Disaster Recovery).

### Image retention

`docker-ghcr.yml` publishes several tags per image per push (branch name,
short SHA, semver, `latest`). Left unmanaged, GHCR storage grows
indefinitely. Recommended policy (configure via GHCR's package settings
or a scheduled cleanup workflow using `actions/delete-package-versions`):

- **Keep forever:** semver release tags (`1.4.2`, `1.4`, `1`) — these are
  your deployable, pinnable versions.
- **Keep current only:** `latest` and `main` (each push overwrites the
  previous one, so there's nothing to retain).
- **Keep a rolling window:** other branch-name tags — e.g. the last 5-10
  builds per branch, enough to bisect a recent regression.
- **Safe to prune aggressively:** bare short-SHA tags older than your
  retention window, once their corresponding branch/release tag exists.

---

## 7. Backups

Three things need backing up: the Postgres data, the uploads volume, and
the two `keys/` directories (which aren't volumes but should still be
backed up like any other credential material).

```bash
# ── PostgreSQL — logical backup (recommended: portable, restorable into
#    a different Postgres version if ever needed) ──────────────────────
docker compose --env-file .env.production exec hdsp-postgres \
  pg_dump -U "$DB_USER" -d "$DB_NAME" -F c -f /tmp/hdsp_backup.dump
docker compose --env-file .env.production cp hdsp-postgres:/tmp/hdsp_backup.dump ./backups/

docker compose --env-file .env.production exec vendor-postgres \
  pg_dump -U "$VENDOR_DB_USER" -d "$VENDOR_DB_NAME" -F c -f /tmp/vendor_backup.dump
docker compose --env-file .env.production cp vendor-postgres:/tmp/vendor_backup.dump ./backups/

# ── Uploads volume ───────────────────────────────────────────────────
docker run --rm -v hdsp_hybrid_hdsp_uploads:/data -v "$PWD/backups":/backup \
  alpine tar czf /backup/hdsp_uploads_$(date +%Y%m%d).tar.gz -C /data .
#   ^ volume name is prefixed with the Compose project name (usually the
#     repo directory name) — check the real name with `docker volume ls`.

# ── Keys (bind-mounted, not a volume — just copy the directories) ──────
tar czf backups/keys_$(date +%Y%m%d).tar.gz backend/keys vendor-portal/keys

# ── SSL certificates (once you've added them under docker/nginx/ssl/) ──
tar czf backups/ssl_$(date +%Y%m%d).tar.gz docker/nginx/ssl
```

Automate the above with cron and ship backups off-host (S3, another
server, etc.) — a backup that only lives on the same disk as the database
it protects isn't a backup. Note the application also has its own
in-product backup module (`BACKUP_*` env vars, see
`BACKUP_RESTORE_MODULE.md`) for database-content-level backups triggered
from within the app; the steps above are the *infrastructure*-level
backup you need regardless of whether that module is configured.

---

## 8. Troubleshooting

```bash
# Service status + health
docker compose --env-file .env.production ps

# Logs — all services, or one
docker compose --env-file .env.production logs -f
docker compose --env-file .env.production logs -f hdsp-backend

# Shell into a running container
docker compose --env-file .env.production exec hdsp-backend sh

# One-off command in a fresh container (e.g. checking env resolution)
docker compose --env-file .env.production run --rm hdsp-backend env

# Inspect the network — confirm services can resolve each other
docker network inspect hdsp_hybrid_hdsp_net

# Inspect a volume's actual size/contents
docker run --rm -v hdsp_hybrid_hdsp_uploads:/data alpine du -sh /data

# Health check status directly (bypasses Compose's cached view)
docker inspect --format='{{json .State.Health}}' hdsp-backend | jq

# Force-recreate one service without touching the others
docker compose --env-file .env.production up -d --force-recreate --no-deps hdsp-backend
```

**Common issues:**

- **`hdsp-backend` stuck "unhealthy" / restarting** — check `docker
  compose logs hdsp-backend`; almost always a missing/invalid required
  env var (see § Environment Variables), or `hdsp-postgres`/`hdsp-redis`
  not yet healthy — `depends_on: condition: service_healthy` should
  prevent this, but a first-boot Postgres taking longer than
  `start_period: 20s` to initialize can still race on a slow disk.
- **Vendor Portal can't reach the Hospital backend** (cloud-tenant
  provisioning flow) — confirm `VENDOR_HDSP_BACKEND_URL` points at
  `http://hdsp-backend:3001` (the Docker service name), not `localhost`.
- **`docker compose pull` fails with "unauthorized"** — the GHCR package
  is private and you haven't run `docker login ghcr.io` on this host, or
  your token lacks `read:packages`.
- **Migration container can't reach Postgres** — confirm you started
  `hdsp-postgres`/`vendor-postgres` first (step 5 in § Deployment); the
  `migration` profile does not automatically start them as a side effect
  of `run`.

---

## 9. Security

- **`.env.production`** contains every secret in this deployment (DB
  passwords, JWT secrets, Oracle credentials). Set restrictive
  permissions and keep it out of version control:
  ```bash
  chmod 600 .env.production
  ```
- **Postgres and Redis are never published to the host** — by design,
  they're only reachable inside `hdsp_net`. Don't add `ports:` to
  `hdsp-postgres`/`vendor-postgres`/`hdsp-redis` in production.
- **`backend/keys/` and `vendor-portal/keys/`** hold license/signing key
  material — both are already mounted read-only (`:ro`) into their
  containers; keep host filesystem permissions tight (`chmod 700`) too.
- **Firewall** — only open the ports you actually intend to expose (§
  Prerequisites). If you're running `hdsp-nginx`, prefer exposing only
  Nginx's port(s) and firewalling off 3000/3001/4000/4001 directly, per
  the note already in `docker-compose.yml`'s header comment.
- **TLS** — `docker/nginx/ssl/` is prepared and gitignored (`.gitkeep`
  only). To enable HTTPS:
  1. Obtain/generate a certificate + key (Let's Encrypt via `certbot`, or
     an internal CA for a hospital LAN deployment).
  2. Place them at `docker/nginx/ssl/hdsp.crt` / `hdsp.key` (and
     `vendor.crt`/`vendor.key` if using a separate vendor hostname).
  3. Uncomment the `443:443` mapping under `hdsp-nginx.ports:` in
     `docker-compose.yml` and the HTTPS server blocks in
     `docker/nginx/conf.d/hdsp.conf`.
  4. `docker compose --env-file .env.production up -d hdsp-nginx`.
  No other files change.
- **Non-root containers** — every application image (`hdsp-backend`,
  `hdsp-frontend`, `vendor-backend`, `vendor-frontend`) runs as the
  unprivileged `hdsp` user (see each `docker/*.Dockerfile`); only Postgres
  and Redis's own official images run as their own image-default users.
- **Image provenance** — every published image carries an SBOM and a
  signed build-provenance attestation (`docker-ghcr.yml`), viewable under
  the package's "Attestations" tab on GHCR — use `gh attestation verify`
  to confirm an image was actually built by this repo's CI before
  deploying it to a hospital's production server.

---

## 10. Disaster Recovery

Assumes total loss of the server (or a from-scratch redeploy elsewhere).

```bash
# 1. Provision a new Ubuntu 22.04 server, install Docker + Compose (§ Prerequisites)
# 2. Clone the repo, restore .env.production and keys/ from your backups
git clone <your-repo-url> HDSP_HYBRID && cd HDSP_HYBRID
tar xzf keys_YYYYMMDD.tar.gz          # restores backend/keys, vendor-portal/keys
cp /secure/backup/location/.env.production .   # never store this in the repo/backup tarball unencrypted
chmod 600 .env.production

# 3. Bring up just the databases
docker compose --env-file .env.production --profile migration up -d hdsp-postgres vendor-postgres
# wait for both to report healthy: docker compose ps

# 4. Restore PostgreSQL from your pg_dump backups
docker compose --env-file .env.production cp ./backups/hdsp_backup.dump hdsp-postgres:/tmp/
docker compose --env-file .env.production exec hdsp-postgres \
  pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists /tmp/hdsp_backup.dump

docker compose --env-file .env.production cp ./backups/vendor_backup.dump vendor-postgres:/tmp/
docker compose --env-file .env.production exec vendor-postgres \
  pg_restore -U "$VENDOR_DB_USER" -d "$VENDOR_DB_NAME" --clean --if-exists /tmp/vendor_backup.dump

# 5. Restore the uploads volume
docker volume create hdsp_hybrid_hdsp_uploads
docker run --rm -v hdsp_hybrid_hdsp_uploads:/data -v "$PWD/backups":/backup \
  alpine tar xzf /backup/hdsp_uploads_YYYYMMDD.tar.gz -C /data

# 6. Restore SSL certs, if used
tar xzf backups/ssl_YYYYMMDD.tar.gz

# 7. Pull images and bring everything up
docker compose --env-file .env.production pull
docker compose --env-file .env.production --profile full up -d

# 8. Verify (§ Deployment step 7's health checks)
```

Since migrations were already applied to the database you restored in
step 4, do **not** re-run `hdsp-migrate`/`vendor-migrate` as part of a
restore — only run them afterward if the version you're deploying is
*newer* than the one the backup was taken from.

---

## 11. CI/CD Pipeline — Release-Gated Deployment

`.github/workflows/docker-ghcr.yml` implements a mandatory-review release
process: no code reaches production without passing through a Pull
Request, and only a merge into `main` (or a tagged release) can publish
images or touch the production server.

```text
Developer
   │
   ▼
feature/* branch, commits
   │
   ▼
git push feature/xyz  →  Open Pull Request
   │
   ▼
GitHub Actions (pull_request event)
   • ci-backend.yml / ci-frontend.yml — lint, unit tests, production build
   • docker-ghcr.yml's build-and-push job — builds all 4 Docker images
     (proves docker/*.Dockerfile actually build) with `push: false`.
     Nothing is published to GHCR. deploy-oracle-cloud does not run —
     its `if:` condition excludes pull_request unconditionally.
   │
   ▼
Code Review  →  Approval  →  Merge into main
   │
   ▼
GitHub Actions (push to main / v*.*.* tag)
   • build-and-push job — same 4 images, this time `push: true`
   • version-manifest job
   • deploy-oracle-cloud job:
       1. SSH into the Oracle Cloud host (secrets below)
       2. docker compose --env-file .env.production pull
       3. Run hdsp-migrate / vendor-migrate (the same one-shot services
          from Phase 3 — no new migration mechanism, no automatic
          migration baked into the image's ENTRYPOINT)
       4. docker compose --env-file .env.production --profile full up -d
       5. Poll container health status; curl the public health endpoints
       6. Fail the job (non-zero exit) if health never turns green,
          leaving the previous containers' images still pullable for a
          manual rollback (§ 6 Updating)
   │
   ▼
Deployment complete
```

**Required repository configuration for the deploy step to run:**

Configure a GitHub **Environment** named `production`
(*Settings → Environments*) and add these as **Environment secrets**
(preferred — scopes them to only run after any environment protection
rules you add, e.g. required reviewers) or **Repository secrets**:

| Secret | Purpose |
|--------|---------|
| `ORACLE_CLOUD_HOST` | SSH hostname/IP of the Oracle Cloud instance |
| `ORACLE_CLOUD_USER` | SSH user (must have `docker`/`docker compose` access — group membership, not root) |
| `ORACLE_CLOUD_SSH_KEY` | Private key for that user (use a dedicated deploy key, not a personal key) |
| `ORACLE_CLOUD_SSH_PORT` | Optional, defaults to 22 |

And these as **Repository variables** (*Settings → Variables*):

| Variable | Purpose |
|----------|---------|
| `ORACLE_CLOUD_DEPLOY_PATH` | Path to the cloned repo on the server, default `/opt/hdsp` |
| `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_APP_NAME` | Baked into the frontend image at build time |

If `ORACLE_CLOUD_HOST` isn't set, `deploy-oracle-cloud` logs a message
and exits cleanly (does not fail the workflow) — so this file works
correctly as pure CI (build + push only) before you've provisioned a
server, and starts deploying automatically the moment those secrets
exist. `.env.production` itself is **never** written or transmitted by
this workflow — it must already exist on the server (provisioned once,
by hand, per § 5 Deployment), matching the "never bake secrets into
images or CI" rule the whole Docker setup follows.

---

## 12. Repository Protection

Recommended GitHub branch protection for `main`
(*Settings → Branches → Add branch protection rule*), so the guarantees
§ 11 describes are actually enforced by GitHub, not just by this
workflow's own `if:` conditions:

- **Protect the `main` branch** — apply the rule to `main` specifically.
- **Require a pull request before merging** — disables direct pushes to
  `main` entirely, including for repo admins if you also enable
  "Do not allow bypassing the above settings".
- **Require at least one approval** — no self-merge of unreviewed code.
- **Dismiss stale approvals when new commits are pushed** — an approval
  given before a force-push/new commit no longer counts; the reviewer
  must look again.
- **Require status checks to pass before merging**, and mark these as
  required:
  - `CI - Backend` / `CI - Frontend` (existing `ci-*.yml` gates)
  - `Build & push (backend)`, `Build & push (frontend)`,
    `Build & push (vendor-backend)`, `Build & push (vendor-frontend)`
    (this workflow's `build-and-push` matrix jobs, running in
    validate-only mode on the PR)
- **Require branches to be up to date before merging** — forces a rebase/
  merge of `main` into the feature branch first, so what gets tested is
  what will actually run after merge.
- **Restrict who can push to matching branches** — limit direct-push
  bypass (if any is ever granted) to a small release-manager group.
- **Restrict who can modify `.github/workflows/`** — via a `CODEOWNERS`
  entry (`/.github/workflows/ @your-release-managers`) requiring their
  review specifically on workflow changes, since a workflow edit is the
  one thing that could otherwise let a PR grant itself deploy
  credentials. Combine with "Require review from Code Owners" in the
  branch protection rule.

None of the above is configurable from a YAML file in this repo — it's a
one-time manual setup step in the GitHub repository settings UI (or via
the GitHub API/Terraform's `github_branch_protection` resource, if you
manage repo settings as code elsewhere).

---

## Appendix: Compose profile reference

| Profile     | Starts |
|-------------|--------|
| `hospital`  | `hdsp-postgres`, `hdsp-redis`, `hdsp-backend`, `hdsp-frontend` |
| `vendor`    | `vendor-postgres`, `vendor-backend`, `vendor-frontend` |
| `full`      | Everything above, plus `hdsp-nginx` |
| `migration` | Both Postgres services + the two one-shot migration runners (`hdsp-migrate`, `vendor-migrate`) — start Postgres first, then `run --rm`, don't just `up` |
| `proxy`     | `hdsp-nginx` alone — use this if `hospital`/`vendor` are already running and you're adding the reverse proxy on top |
