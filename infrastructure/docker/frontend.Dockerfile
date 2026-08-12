# HDSP Frontend image (Phase 9, Task 9.1)
#
# Build context MUST be the monorepo root -- the frontend depends on three
# local workspace packages via `file:` references (@hdsp/canvas-engine,
# @hdsp/canvas-engine-react, @hdsp/form-schema), which must be built to
# dist/ before `npm ci` in frontend/ can resolve them. Build with:
#   docker build -f infrastructure/docker/frontend.Dockerfile -t hdsp-frontend .
#
# Next.js `next start` (not a static export) -- this app has server-side
# rendering and API-proxying needs, so it stays a long-running Node
# process, not a CloudFront-only static site (S3+CloudFront in this phase
# is for object storage, Task 9.4, not for hosting the frontend itself).

# ── Stage 1: build the local workspace packages this image depends on ──────
FROM node:20-bookworm-slim AS packages-builder
WORKDIR /repo
COPY packages/form-schema packages/form-schema
RUN cd packages/form-schema && npm install && npm run build
COPY packages/canvas-engine packages/canvas-engine
RUN cd packages/canvas-engine && npm install && npm run build
COPY packages/canvas-engine-react packages/canvas-engine-react
RUN cd packages/canvas-engine-react && npm install && npm run build

# Remove package-lock and node_modules from workspace packages so they don't
# interfere with the frontend's strict `npm ci` lockfile validation.
RUN rm -rf packages/*/node_modules packages/*/package-lock.json
# ── Stage 2: install deps + build ────────────────────────────────────────────
FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /repo
COPY --from=packages-builder /repo/packages packages
COPY frontend frontend
WORKDIR /repo/frontend
# NEXT_PUBLIC_* vars are baked in at build time (Next.js convention) -- the
# cloud API base URL must be known here, passed as a build ARG per
# environment (staging vs. production), not read at container-start time.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
# DEPLOYMENT_MODE build ARG removed (single-source-of-truth fix,
# 2026-07-20): next.config.mjs no longer bakes DEPLOYMENT_MODE into a
# NEXT_PUBLIC_* var at build time -- the frontend now reads deployment
# mode live from the backend's GET /license/status at runtime instead
# (see login/page.tsx). This was the exact mechanism that caused a
# real cross-tenant bug: a stale build/process retained an old baked-in
# value after DEPLOYMENT_MODE changed. DEPLOYMENT_MODE now only needs to
# be set once, as a runtime env var on the backend container/process.
RUN npm install -g npm@11
RUN npm ci
RUN npm run build

# ── Stage 3: production runtime ──────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r hdsp && useradd -r -g hdsp hdsp
WORKDIR /app
COPY --from=frontend-builder /repo/frontend/.next ./.next
COPY --from=frontend-builder /repo/frontend/public ./public
COPY --from=frontend-builder /repo/frontend/package.json /repo/frontend/package-lock.json ./
COPY --from=frontend-builder /repo/packages ../packages
RUN npm install -g npm@11
RUN npm ci --omit=dev && npm cache clean --force
USER hdsp
ENV NODE_ENV=production
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "start"]
