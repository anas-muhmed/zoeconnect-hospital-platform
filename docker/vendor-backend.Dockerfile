# ─────────────────────────────────────────────────────────────────────────────
# HDSP Vendor Portal Backend (NestJS API) — production image
#
# Replaces vendor-portal/backend/Dockerfile (kept, untouched) for the root
# docker-compose.yml / GHCR pipeline: that file is single-stage, runs as
# root, and has no healthcheck. This version fixes those without changing
# any application code.
#
# Unlike the hospital backend, vendor-backend has no local `file:`
# workspace dependencies (see vendor-portal/backend/package.json) — no
# packages-builder stage is needed.
#
# Build context MUST be the monorepo root, to stay consistent with the
# other three images in this docker/ directory (all four are built the
# same way by the root docker-compose.yml and the GHCR workflow). Build
# with:
#   docker build -f docker/vendor-backend.Dockerfile -t hdsp-vendor-backend .
#
# `vendor-backend-builder` is a named, reusable target: the root
# docker-compose.yml's dedicated `vendor-migrate` service (a profile, not
# run automatically) targets this stage and runs
# `npm run migration:run` unchanged (ts-node-based, via
# typeorm-ts-node-commonjs — see vendor-portal/backend/package.json),
# which needs the devDependencies (ts-node, typescript, tsconfig-paths)
# and src/ this stage has, not the pruned `runtime` stage below.

# ── Stage 1: install deps + compile ────────────────────────────────────────
FROM node:20-bookworm-slim AS vendor-backend-builder
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3
WORKDIR /repo/vendor-portal/backend
COPY vendor-portal/backend/package.json vendor-portal/backend/package-lock.json ./
RUN --mount=type=cache,id=backend-npm-cache,sharing=locked,target=/root/.npm npm ci --no-audit --no-fund
COPY vendor-portal/backend .
RUN npm run build

# ── Stage 2: production dependencies ───────────────────────────────────────
# Deliberately NOT dependent on vendor-backend-builder: only needs the
# package manifests from the build context, so this stage's
# `npm ci --omit=dev` can run in parallel with the builder stage's compile
# instead of serializing after it (see docker/backend.Dockerfile's comment
# for the full rationale — same fix applied here).
FROM node:20-bookworm-slim AS vendor-backend-prod-deps
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3
WORKDIR /repo/vendor-portal/backend
COPY vendor-portal/backend/package.json vendor-portal/backend/package-lock.json ./
RUN --mount=type=cache,id=backend-npm-cache,sharing=locked,target=/root/.npm npm ci --omit=dev --no-audit --no-fund

# ── Stage 3: production runtime — slim, no build tools, no source ──────────
FROM node:20-bookworm-slim AS runtime
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends dumb-init \
    && groupadd -r hdsp && useradd -r -g hdsp hdsp
WORKDIR /repo/vendor-portal/backend
# --chown sets ownership per-file during the copy itself, avoiding a second
# full recursive filesystem walk over the whole tree (including
# node_modules) — a real CI run measured this exact pattern's `chown -R`
# step at 458.3s on the backend image; same fix applied here.
COPY --chown=hdsp:hdsp --from=vendor-backend-builder /repo/vendor-portal/backend/dist ./dist
COPY --chown=hdsp:hdsp --from=vendor-backend-builder /repo/vendor-portal/backend/package.json ./package.json
COPY --chown=hdsp:hdsp --from=vendor-backend-prod-deps /repo/vendor-portal/backend/node_modules ./node_modules
# keys/ holds the RSA private key used for license signing — mounted
# read-only from vendor-portal/keys by the root docker-compose.yml, not
# baked into the image (see .dockerignore). Only this freshly-created empty
# directory needs a (non-recursive, fast) chown.
RUN mkdir -p keys && chown hdsp:hdsp keys
USER hdsp
ENV NODE_ENV=production
EXPOSE 4000
# CRITICAL FIX (split-state deployment incident, 2026-08): this used to be
# a bare TCP connect check ("process is alive and accepting connections"),
# which reports "healthy" the instant the HTTP listener binds -- completely
# blind to whether vendor-postgres is actually reachable. That's the exact
# same class of gap the hospital backend had with a liveness-only check,
# just one layer weaker (not even hitting HTTP). A real readiness endpoint
# now exists (src/modules/health/health.controller.ts, GET /health/ready,
# behind the app's global "api" prefix -> /api/health/ready), pinging
# vendor-postgres via @nestjs/terminus's TypeOrmHealthIndicator -- this is
# what Compose's `vendor-frontend depends_on vendor-backend: condition:
# service_healthy` and deploy.sh/rollback.sh's verify_service_health() now
# both consult.
# CRITICAL FIX (interval tuning follow-up, 2026-08): same reasoning as
# backend.Dockerfile's matching comment -- interval 15s->30s, retries
# 5->3, start_period 20s->60s. vendor-backend's own readiness check
# (mail config presence) is already cheap/zero-network by design, but
# there's still no operational reason to poll a real HTTP endpoint twice
# as often as needed; 30s x 3 still detects a genuine failure within 90s.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/api/health/ready',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
