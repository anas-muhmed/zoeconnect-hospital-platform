# HDSP Connector image (Phase 6/9, Task 9.1)
#
# Runs at the hospital's network edge (on-prem or in a small edge VM with
# a route to the on-prem Oracle HIS), NOT in the same cloud VPC as the
# API/worker services -- it is the one component in this topology that
# dials Oracle directly, which is why (unlike backend.Dockerfile) this
# image DOES bundle Oracle Instant Client for oracledb's thick-mode driver,
# matching the self-hosted DEPLOY.md runbook's own Oracle Instant Client
# install step.
#
# Build context MUST be the monorepo root -- the Connector depends on the
# local @hdsp/oracle-client workspace package via a `file:` reference.
# Build with:
#   docker build -f infrastructure/docker/connector.Dockerfile -t hdsp-connector .
#
# Deployment ownership note (carried forward from Phase 7's Vendor Portal
# impact analysis): WHO provisions/deploys a Connector instance for a
# given hospital is explicitly unassigned by the roadmap and deferred to
# Phase 10 (Tenant Provisioning). This Dockerfile makes the image
# buildable/runnable; it does not decide how instances get created per
# hospital -- that remains open.

FROM node:20-bookworm-slim AS builder
WORKDIR /repo
COPY packages/oracle-client packages/oracle-client
RUN cd packages/oracle-client && npm install && npm run build
COPY connector connector
WORKDIR /repo/connector
RUN npm install
RUN npm run build

FROM node:20-bookworm-slim AS runtime
# Oracle Instant Client (Basic) -- same package/version family as
# DEPLOY.md's self-hosted install step. libaio1 is the runtime dependency
# oracledb's thick-mode driver needs on Debian/Ubuntu.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libaio1 unzip curl dumb-init \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r hdsp && useradd -r -g hdsp hdsp
# NOTE: Oracle Instant Client cannot be redistributed via a public base
# image per Oracle's license terms -- the zip must be staged into the
# Docker build context (e.g. infrastructure/docker/vendor/instantclient-basic-linux.x64-*.zip,
# gitignored, fetched once from Oracle's site per DEPLOY.md's §1) before
# building this image. Left as an explicit build-time requirement, not
# faked here, consistent with this project's standing practice of not
# fabricating steps that need real vendor artifacts.
ARG INSTANT_CLIENT_ZIP=vendor/instantclient-basic-linux.x64.zip
COPY infrastructure/docker/${INSTANT_CLIENT_ZIP} /tmp/instantclient.zip
RUN mkdir -p /opt/oracle \
    && unzip /tmp/instantclient.zip -d /opt/oracle \
    && rm /tmp/instantclient.zip \
    && ORACLE_CLIENT_DIR=$(find /opt/oracle -maxdepth 1 -type d -name 'instantclient_*') \
    && echo "$ORACLE_CLIENT_DIR" > /etc/ld.so.conf.d/oracle.conf \
    && ldconfig
WORKDIR /app
COPY --from=builder /repo/connector/dist ./dist
COPY --from=builder /repo/connector/package.json ./
COPY --from=builder /repo/packages/oracle-client ../packages/oracle-client
RUN npm install --omit=dev && npm cache clean --force
USER hdsp
ENV NODE_ENV=production
# Health server (connector/src/health.ts, Phase 6 Task 6.4) -- plain HTTP
# /health endpoint, TCP-reachability pattern matching the backend's Oracle
# health indicator. Port defaults to 4100 (connector/src/index.ts's
# CONNECTOR_HEALTH_PORT default) -- override both here and via env if changed.
EXPOSE 4100
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
