# HDSP Backend / Worker image (Phase 9, Task 9.1)
#
# One image serves BOTH the API and worker ECS services (Task 9.2/9.6) --
# they run the identical container, distinguished only by the PROCESS_ROLE
# env var and CMD override (worker sets PROCESS_ROLE=worker, matching
# app.config.ts's processRole doc comment and main.ts's app.listen() gate).
#
# Build context MUST be the monorepo root (not backend/), because the
# backend depends on two local workspace packages via `file:` references
# in package.json -- @hdsp/oracle-client (../packages/oracle-client) and
# @hdsp/connector (../connector), both of which must be built (tsc) to
# dist/ *before* `npm ci` in backend/ can resolve them. Build with:
#   docker build -f infrastructure/docker/backend.Dockerfile -t hdsp-backend .
#
# Does NOT bundle Oracle Instant Client (unlike the self-hosted DEPLOY.md
# runbook, which installs it for oracledb's thick-mode driver). Phase 9's
# target cloud configuration (Task 9.8) sets ORACLE_TRANSPORT=cloud_relay,
# so the backend/worker never dial Oracle directly -- that's the
# Connector's job (see connector.Dockerfile, which DOES bundle it). If a
# cloud deployment ever needs ORACLE_TRANSPORT=direct, either add the
# Instant Client install block from connector.Dockerfile here too, or set
# ORACLE_MODE=thin (oracledb's pure-JS driver, no native client needed --
# see env.validation.ts's ORACLE_MODE).

# ── Stage 1: build the local workspace packages this image depends on ──────
FROM node:20-bookworm-slim AS packages-builder
WORKDIR /repo
COPY packages/oracle-client packages/oracle-client
RUN cd packages/oracle-client && npm install && npm run build
COPY connector connector
RUN cd connector && npm install && npm run build

# ── Stage 2: install backend deps + compile ─────────────────────────────────
FROM node:20-bookworm-slim AS backend-builder
# build-essential + python3: bcrypt (native module) needs these if no
# prebuilt binary matches this platform/Node ABI; harmless no-op cost if a
# prebuilt binary is used instead.
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY --from=packages-builder /repo/packages/oracle-client packages/oracle-client
COPY --from=packages-builder /repo/connector connector
COPY backend backend
WORKDIR /repo/backend
RUN npm ci
RUN npm run build

# ── Stage 3: production runtime — slim, no build tools ──────────────────────
FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r hdsp && useradd -r -g hdsp hdsp
WORKDIR /app
COPY --from=backend-builder /repo/backend/dist ./dist
COPY --from=backend-builder /repo/backend/package.json /repo/backend/package-lock.json ./
COPY --from=backend-builder /repo/packages/oracle-client ../packages/oracle-client
COPY --from=backend-builder /repo/connector ../connector
# Production-only install -- devDependencies (nest CLI, ts-jest, etc.) are
# not needed at runtime; file: deps resolve against the copied sibling
# dirs above, matching backend's package.json layout expectations.
RUN npm ci --omit=dev && npm cache clean --force
USER hdsp
ENV NODE_ENV=production
EXPOSE 3001
# ECS/Fargate task-level health check hits GET /api/health (see
# infrastructure/ecs/*.json); PROCESS_ROLE=worker never opens this port
# (see main.ts) -- the worker service's ECS health check is process-alive
# based instead (container-level, not HTTP), documented in the worker
# task definition.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
