# HDSP — Developer Onboarding Guide

**Audience:** engineers joining the HDSP project, starting from a blank laptop.
**Status:** production documentation, code-verified against the repository's actual scripts and configuration as of this writing.

---

## 1. Repository Structure (what you're cloning)

Root `package.json` (`hdsp-monorepo`) declares npm **workspaces**: `["packages/*", "connector"]`. Only `packages/*` (`form-schema`, `oracle-client`, `canvas-engine`, `canvas-engine-react`, `form-renderer-react`) and `connector` are true npm-workspace members with a shared root lockfile. `backend/` and `frontend/` are **plain subfolders**, each with their own `package.json` and `package-lock.json` — they are driven via `npm --prefix`/`cd && npm run`, not `npm run --workspace`. `vendor-portal/backend` and `vendor-portal/frontend` are a separate, independent application (separate dependency versions — MUI v5 vs. the main frontend's MUI v6, React Query 5.17 vs 5.59) not covered by any CI workflow. There is no Turborepo/Nx — no `turbo.json`/`nx.json` exists.

## 2. Prerequisites — Install in This Order

### 2.1 Git
Any recent Git client. No repository-specific Git hooks exist (**no Husky, no `.husky/` directory, no pre-commit automation found anywhere in the repo** — lint/test enforcement is CI-only today).

### 2.2 Node.js 20 LTS
Install via `nvm` (matches `DEPLOY.md`'s production guidance and the `node:20-bookworm-slim` base image used by every Dockerfile):
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20 && nvm use 20 && nvm alias default 20
npm install -g pm2   # only needed if you'll run the self-hosted PM2 path locally
```

### 2.3 Docker Desktop
Required for the local Postgres/Redis dev stack (`infrastructure/docker-compose.yml`) and if you want to build/run the production-shaped images locally. Not required to run backend/frontend in dev mode against a manually-installed Postgres/Redis.

### 2.4 Oracle Instant Client (optional, only if testing HIS integration locally)
Only needed if you're working on `his`/HIS-sync code with `ORACLE_MODE=thick` (the default) against a real or test Oracle instance. Not required for most feature work — the platform boots and functions with Oracle unreachable (`ORACLE_HOST`/`ORACLE_USER`/`ORACLE_PASSWORD` are optional/allow-empty in the Joi validation schema). If needed: download Instant Client 21c Basic+SDK from Oracle (license-restricted, cannot be committed to the repo), unzip locally, set `ORACLE_INSTANT_CLIENT_PATH` in your `.env`, and `ldconfig`/equivalent for your OS. `ORACLE_MODE=thin` avoids this entirely if your target Oracle version is 19c+.

## 3. Clone and Install

```bash
git clone <repo-url> hdsp && cd hdsp

# Root install: installs backend, frontend, and root workspace deps
npm run install:all
# equivalent to: npm i --prefix backend && npm i --prefix frontend && npm install

# Build the shared packages the backend/frontend depend on via file: references
npm run build:packages
# builds, in order: @hdsp/form-schema → canvas-engine → canvas-engine-react → form-renderer-react → oracle-client → connector
```
`backend`'s `package.json` depends on `file:../connector`, `file:../packages/form-schema`, `file:../packages/oracle-client` — these must be built (not just installed) before `backend` will compile, which is why `build:packages` is a separate, required step and why CI (`ci-backend.yml`) always runs it before the backend job.

## 4. Start Local Infrastructure (Postgres + Redis)

```bash
npm run infra:up
# = docker compose -f infrastructure/docker-compose.yml up -d
```
This starts `postgres:15-alpine` (port 5432, seeded via `infrastructure/postgres/init.sql` — enables `pgcrypto`/`pg_stat_statements`/`btree_gist`) and `redis:7-alpine` (port 6379, dev password, 256MB maxmemory/allkeys-lru). Optional dev UIs (`pgAdmin`, `redis-commander`) are available behind a Compose profile:
```bash
npm run infra:tools
# = docker compose -f infrastructure/docker-compose.yml --profile tools up -d
```
Tear down with `npm run infra:down`. Note: this compose file is dev-only — it does **not** include `backend`/`frontend` services (Oracle HIS is also explicitly not containerized here).

## 5. Environment Variables

```bash
cd backend && cp .env.example .env
cd ../frontend && cp .env.example .env.local   # if present; otherwise create manually per next.config.mjs's env keys
```
The backend fails fast at boot if required vars are missing or invalid — `ConfigModule.forRoot()` runs a Joi schema (`backend/src/config/env.validation.ts`) with `abortEarly: false`, so a bad `.env` prints **every** validation failure at once, not just the first. Minimum required for local dev: `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `REDIS_HOST`, `JWT_SECRET` (≥32 chars), `JWT_REFRESH_SECRET` (≥32 chars, different from `JWT_SECRET`). Generate secrets locally with:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Everything else (Oracle, S3, licensing, notifications, tenant/deployment-mode flags) has a working default suitable for local dev — see the full environment variable reference for the complete list and defaults, including the provider-selection flags (`STORAGE_DRIVER`, `ORACLE_TRANSPORT`, `LICENSE_PROVIDER_MODE`, `NOTIFICATION_PROVIDER_MODE`, `DEPLOYMENT_MODE`) which all default to their local/self-hosted-equivalent values.

## 6. Run Database Migrations and Seed

```bash
npm run migrate    # = bash scripts/migrate.sh run  → backend: npm run migration:run
npm run seed       # = bash scripts/migrate.sh seed → backend: ts-node .../seed-platform.ts
```
There are **98 migration files** under `backend/src/database/migrations/`; `synchronize` is hardcoded `false` in every DataSource definition (`data-source.ts`, `database.config.ts`) — there is no auto-sync path, even in dev. To create a new migration after changing an entity: `cd backend && npm run migration:generate -- src/database/migrations/<DescriptiveName>`. Other useful commands: `npm run migration:revert`, `npm run migration:show`.

For a single-tenant local dev environment, also run the self-hosted provisioning script once to create the initial tenant + SUPER_ADMIN user:
```bash
cd backend && npx ts-node scripts/provision-self-hosted.ts
# (in production this runs as: npm run provision:self-hosted, against the compiled dist/)
```

## 7. Start the Backend

```bash
cd backend
npm run start:dev     # nest start --watch — hot reload
```
Other backend scripts you'll use: `npm run start:prod` (`node dist/main` — requires `npm run build` first), `npm run start:worker` (`PROCESS_ROLE=worker node dist/main` — runs the cron/queue-worker role instead of the HTTP API role; useful for testing `document-platform`/attendance background jobs in isolation). Backend listens on `PORT` (default 3001), API prefix `/api/v1`.

## 8. Start the Frontend

```bash
cd frontend
npm run dev     # next dev -p 3000
```
`next.config.mjs` proxies `/api/*` and `/socket.io/*` to `BACKEND_URL` (default `http://localhost:3001`) so the browser only ever calls same-origin `/api/*` — you do not need to configure CORS for local dev; the rewrite handles it. Frontend listens on port 3000.

## 9. Start the Connector (only if working on Oracle-relay/cloud-transport code)

```bash
npm run dev:connector
# = npm run start --workspace=@hdsp/connector
```
The Connector is a standalone process (not imported by the backend) that talks to Oracle directly and relays over Redis using a SQL-template allow-list (`connector/src/protocol/sql-template-registry.ts` — it will refuse to execute any `sqlTemplateId` not pre-registered). Relevant only if `ORACLE_TRANSPORT=cloud_relay` is set on the backend, which is not the local-dev default. Serves its own `/health` endpoint on `CONNECTOR_HEALTH_PORT` (default 4100).

## 10. Vendor Portal (separate app, optional)

```bash
cd vendor-portal/backend && npm ci && npm run start:dev   # port 4000, own Postgres DB (default port 5433)
cd vendor-portal/frontend && npm ci && npm run dev         # port 4001
```
This is a genuinely separate application with its own database, JWT secret, and no shared code with the main frontend/backend. It has **no `lint` or `test` npm scripts defined at all**, and is not covered by any `.github/workflows/*.yml` — treat it as lower CI rigor than the main apps until that's addressed.

## 11. Testing

| App | Command | Framework | Notes |
|---|---|---|---|
| Backend | `cd backend && npm test` | Jest (`ts-jest`) | `npm run test:cov` for coverage, `npm run test:e2e` for the separate e2e Jest config |
| Connector | `npm run test:connector` (root) or `cd connector && npm test` | Jest | |
| `packages/*` | `npm run test:packages` (root) | Jest (`canvas-engine-react`/`form-renderer-react` add `jest-environment-jsdom`) | |
| Frontend | — | **No test framework is configured** (`ci-frontend.yml`'s own comment confirms this explicitly) | type-checking and linting substitute for tests today |
| Vendor Portal | — | **No test script defined** in either `package.json` | |

CI also runs an **S3 storage conformance test** (`ci-backend.yml`'s `storage-s3-conformance` job, against a real `minio` container) and an **e2e smoke test** (`e2e-smoke` job — boots the compiled backend against real Postgres+Redis containers and polls `/api/v1/health/live` and `/health/ready`). Reproduce locally with Docker if you're changing storage-provider or health-check code.

## 12. Linting

```bash
cd backend && npm run lint     # eslint "{src,apps,libs,test}/**/*.ts" --fix
cd frontend && npm run lint    # next lint
cd frontend && npm run type-check   # tsc --noEmit
```
**Important, code-verified gap:** no `.eslintrc*`/`eslint.config.*` file exists at the project level in `backend/`, `frontend/`, `connector/`, or the repo root (only vendored copies inside `node_modules`). Likewise, no `.prettierrc*` file exists despite both apps having a `"format": "prettier --write ..."` script. This means `npm run lint`/`npm run format` may currently run against ESLint/Prettier defaults rather than a real project-specific ruleset — verify this is still the case when you set up your environment, and flag it to the team if config files are genuinely missing rather than just not yet located.

TypeScript strictness (from each `tsconfig.json`): backend has `strictNullChecks`, `noImplicitAny`, `strictBindCallApply`, `noFallthroughCasesInSwitch` individually enabled (not full `strict: true`); frontend and connector both use full `strict: true`.

## 13. Debugging

- Backend: standard Node/NestJS debugging works with `nest start --watch` under a debugger attach, or add `--inspect` to the `start:dev` invocation.
- Health endpoints are your fastest sanity check while developing: `GET /health` (full dependency check), `GET /health/live` (trivial), `GET /health/ready` (Postgres+Redis only).
- Logs: Winston writes to `backend/logs/combined/` and `backend/logs/errors/` by default (`LOG_DIR`) in addition to console output (console is always on when `NODE_ENV !== 'production'`).
- Common local gotcha: the global rate limiter (`ThrottlerModule.forRoot`, hardcoded 100 req/60s) and the login-specific throttle (5/min, `auth.controller.ts`) apply in dev too — if you're scripting repeated login calls while testing, you will get rate-limited.

## 14. VS Code Recommendations

Not codified in the repository (no `.vscode/extensions.json` or `.vscode/settings.json` found) — the following is a team recommendation, not a repository-sourced requirement:
- ESLint and Prettier extensions (once project-level configs are confirmed/added — see §12's gap).
- Prisma/TypeORM extension for migration authoring.
- Docker extension for managing the local Compose stack.
- Path IntelliSense, given both backend (`@/`, `@config/`, `@common/`, `@modules/`) and frontend (`@/`, `@components/`, `@lib/`, `@types/`, `@providers/`) use TypeScript path aliases.

## 15. Common Problems

| Problem | Cause | Fix |
|---|---|---|
| Backend fails to boot with a wall of Joi errors | Missing/invalid `.env` values | Read every line of the error — `abortEarly: false` reports all failures at once; fix each |
| `Cannot find module '@hdsp/form-schema'` (or similar) when building backend/frontend | Shared `packages/*` not built yet | `npm run build:packages` from repo root |
| Frontend can't reach the backend / CORS-looking errors in dev | `BACKEND_URL` misconfigured, or you're calling the backend directly instead of through the `/api/*` proxy | Confirm `frontend/.env.local`'s `BACKEND_URL` and that you're hitting `http://localhost:3000/api/...`, not `:3001` directly from the browser |
| Migrations fail with a role/database-does-not-exist error | Local Postgres not started, or `.env` DB vars don't match the Docker Compose defaults | `npm run infra:up` first; check `infrastructure/docker-compose.yml`'s Postgres env against your `.env` |
| Login always fails after a handful of attempts | Account lockout: 5 failed attempts locks for 15 minutes (`auth.service.ts`) | Wait, or reset `failedLoginCount`/`lockedUntil` directly in the `users` table for your dev user |
| Oracle-related errors on boot | Expected if you have no local Oracle instance — Oracle connectivity is optional and the platform degrades gracefully | Confirm this isn't blocking your actual task; only relevant if you're working on `his`/attendance code |
| `npm ci` fails for `connector` or `packages/oracle-client` | These have no per-package lockfile — only the root `package-lock.json` covers npm-workspace members | Run `npm ci` from the repo root, not inside those subfolders |
