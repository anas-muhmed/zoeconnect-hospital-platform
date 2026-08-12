# ─────────────────────────────────────────────────────────────────────────────
# HDSP Hospital Backend (NestJS API) — production image
#
# Additive to infrastructure/docker/backend.Dockerfile (ECS/ECR-focused) —
# this is the Docker Compose / GHCR counterpart used by the root
# docker-compose.yml on a plain Ubuntu Server + Docker Compose deployment.
# Same multi-stage shape/reasoning as that file, with two fixes:
#   1. It also builds @hdsp/form-schema (a backend dependency the original
#      file omitted from its packages-builder stage).
#   2. The `backend-builder` stage is a named, reusable build target: the
#      root docker-compose.yml's dedicated `migrate` service (a profile,
#      NOT run automatically on `docker compose up`) targets this stage
#      directly and runs `npm run migration:run` unchanged — that script
#      is ts-node-based (see backend/package.json), so it needs the
#      devDependencies (ts-node, typescript, tsconfig-paths) and src/ this
#      stage already has, not the pruned production `runtime` stage below.
#      This gives a dedicated migration step without adding any new script
#      or changing how migrations run.
#
# Build context MUST be the monorepo root (not backend/) — the backend
# resolves three local workspace packages via `file:` references in its
# package.json: @hdsp/form-schema (../packages/form-schema),
# @hdsp/oracle-client (../packages/oracle-client), @hdsp/connector
# (../connector). All three must be built to dist/ before `npm ci` in
# backend/ can resolve them. Build with:
#   docker build -f docker/backend.Dockerfile -t hdsp-backend .
#
# Oracle Instant Client: NOT bundled here. ORACLE_MODE defaults to `thin`
# (oracledb's pure-JS driver — no native client needed, see
# .env.production.example), which is the default recommended for this
# compose stack. `thick` mode is still supported at runtime: mount an
# Oracle Instant Client directory (obtained separately — Oracle's license
# forbids redistributing it inside this image) to
# /opt/oracle/instantclient and set ORACLE_MODE=thick +
# ORACLE_INSTANT_CLIENT_PATH=/opt/oracle/instantclient. libaio1 (thick
# mode's one OS-level runtime dependency on Debian/Ubuntu) is installed
# below unconditionally so that path works without rebuilding the image.

# ── Stage 1: build the local workspace packages this image depends on ──────
FROM node:20-bookworm-slim AS packages-builder
WORKDIR /repo
# Layer caching for packages-builder
COPY packages/form-schema/package.json packages/form-schema/
RUN --mount=type=cache,id=backend-npm-cache,sharing=locked,target=/root/.npm cd packages/form-schema && npm install --no-audit --no-fund
COPY packages/form-schema packages/form-schema
RUN cd packages/form-schema && npm run build

COPY packages/oracle-client/package.json packages/oracle-client/
RUN --mount=type=cache,id=backend-npm-cache,sharing=locked,target=/root/.npm cd packages/oracle-client && npm install --no-audit --no-fund
COPY packages/oracle-client packages/oracle-client
RUN cd packages/oracle-client && npm run build

COPY connector/package.json connector/
RUN --mount=type=cache,id=backend-npm-cache,sharing=locked,target=/root/.npm cd connector && npm install --no-audit --no-fund
COPY connector connector
RUN cd connector && npm run build

# ── Stage 2: install backend deps + compile ────────────────────────────────
FROM node:20-bookworm-slim AS backend-builder
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3
WORKDIR /repo
# Layer caching: copy package.json files first
COPY packages/form-schema/package.json packages/form-schema/
COPY packages/oracle-client/package.json packages/oracle-client/
COPY connector/package.json connector/
COPY backend/package.json backend/package-lock.json backend/
WORKDIR /repo/backend
RUN --mount=type=cache,id=backend-npm-cache,sharing=locked,target=/root/.npm npm ci --no-audit --no-fund
# Copy compiled workspace packages and backend source
COPY --from=packages-builder /repo/packages/form-schema /repo/packages/form-schema
COPY --from=packages-builder /repo/packages/oracle-client /repo/packages/oracle-client
COPY --from=packages-builder /repo/connector /repo/connector
COPY backend /repo/backend
RUN npm run build

# ── Stage 3: production dependencies ───────────────────────────────────────
# Deliberately NOT dependent on backend-builder (see note below): this stage
# only needs backend/package.json + package-lock.json, which are copied
# directly from the build context, not from another stage. That lets
# BuildKit schedule this stage's `npm ci --omit=dev` in parallel with
# backend-builder's compile step instead of serializing after it — the two
# previously shared a single cache mount id (backend-npm) and a
# COPY --from=backend-builder trick was used to force full serialization
# "to prevent concurrent npm ci from corrupting the shared cache." That
# forced this stage to wait for backend-builder's entire `npm run build`
# (TypeScript compile) to finish first, even though this stage doesn't use
# its output. Giving each stage its own cache mount id removes the
# concurrent-write hazard without giving up parallelism.
FROM node:20-bookworm-slim AS backend-prod-deps
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3
WORKDIR /repo
COPY packages/form-schema/package.json packages/form-schema/
COPY packages/oracle-client/package.json packages/oracle-client/
COPY connector/package.json connector/
COPY backend/package.json backend/package-lock.json backend/
WORKDIR /repo/backend
RUN --mount=type=cache,id=backend-npm-cache,sharing=locked,target=/root/.npm npm ci --omit=dev --no-audit --no-fund

# ── Stage 4: production runtime — slim, no build tools, no source ──────────
FROM node:20-bookworm-slim AS runtime
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends dumb-init libaio1 \
    && groupadd -r hdsp && useradd -r -g hdsp hdsp
WORKDIR /repo/backend
# --chown sets ownership per-file during the copy itself, instead of the
# previous approach (plain COPY + a trailing `chown -R /repo`) which forced
# a second full recursive filesystem walk over every file already placed
# here — including the entire node_modules tree. A real CI run measured
# that `chown -R /repo` step at 458.3s on its own; --chown eliminates that
# second walk entirely since ownership is set as each file is written.
COPY --chown=hdsp:hdsp --from=backend-builder /repo/backend/dist ./dist
COPY --chown=hdsp:hdsp --from=backend-builder /repo/backend/package.json ./package.json
COPY --chown=hdsp:hdsp --from=backend-prod-deps /repo/backend/node_modules ./node_modules
# Copy compiled packages from packages-builder so file: symlinks inside node_modules resolve correctly
COPY --chown=hdsp:hdsp --from=packages-builder /repo/packages/form-schema ../packages/form-schema
COPY --chown=hdsp:hdsp --from=packages-builder /repo/packages/oracle-client ../packages/oracle-client
COPY --chown=hdsp:hdsp --from=packages-builder /repo/connector ../connector
# Only the two freshly-created (empty) directories need a chown here, and
# without -R this is a fast, non-recursive, single-entry operation each.
RUN mkdir -p uploads logs keys \
    && chown hdsp:hdsp uploads logs keys
USER hdsp
ENV NODE_ENV=production
EXPOSE 3001
# CRITICAL FIX (split-state deployment incident, 2026-08): this used to
# hit /health/live, which only proves the Node process is alive -- it says
# nothing about Postgres/Redis connectivity. Docker's own HEALTHCHECK
# status is what Compose's `depends_on: condition: service_healthy` chains
# (hdsp-frontend, hdsp-nginx) AND deploy.sh/rollback.sh's own `--wait`
# flag both key off of, so a liveness-only check here silently
# undermined every one of those downstream guarantees too -- a backend
# with a dead database connection was still reported "healthy" at every
# layer. Matches backend/src/app.controller.ts's GET /health/ready route
# (behind the app's global "api" prefix + URI versioning ->
# /api/v1/health/ready), which actually pings Postgres (TypeOrmHealthIndicator)
# and Redis (RedisHealthIndicator) via @nestjs/terminus, plus application-tier
# subsystems (Oracle/HIS transport, BullMQ, licensing, scheduler).
#
# CRITICAL FIX (interval tuning follow-up, 2026-08): interval tightened
# from 15s to 30s, retries from 5 to 3, start_period raised from 30s to
# 60s. 15s made sense when this healthcheck did nothing but confirm the
# process was alive; now that /health/ready exercises real subsystems
# (the licensing check, in particular, was made deliberately passive/zero-I/O
# specifically so this cadence stays cheap -- see LicenseHealthIndicator's
# own comment), there's no operational need to poll that frequently.
# 30s x 3 retries still detects a genuine failure within 90s -- fast
# enough to matter, without polling forever at a rate tuned for a check
# that no longer does nothing. start_period raised to 60s to give the app
# tier (which itself waits on Postgres/Redis's own health via depends_on)
# comfortable room to finish booting before the first probe counts against
# retries.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3001/api/v1/health/ready',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
