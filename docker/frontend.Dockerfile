# ─────────────────────────────────────────────────────────────────────────────
# HDSP Hospital Frontend (Next.js) — production image
#
# Additive to infrastructure/docker/frontend.Dockerfile (ECS/ECR-focused);
# same multi-stage shape, used here by the root docker-compose.yml / GHCR
# pipeline instead. Build context MUST be the monorepo root — the frontend
# resolves three local workspace packages via `file:` references
# (@hdsp/canvas-engine, @hdsp/canvas-engine-react, @hdsp/form-schema),
# which must be built to dist/ before `npm ci` in frontend/ can resolve
# them. Build with:
#   docker build -f docker/frontend.Dockerfile -t hdsp-frontend .
#
# Runs `next start` against a full production node_modules install (not
# `.next/standalone`) — frontend/next.config.mjs does set
# `output: 'standalone'`, but this keeps the runtime stage's dependency
# resolution identical to how `npm ci --omit=dev` already resolves the
# three `file:` packages above, rather than relying on standalone's
# separate trace-and-copy mechanism. No app behavior change either way;
# this is a packaging choice only.

# ── Stage 1: build the local workspace packages this image depends on ──────
FROM node:20-bookworm-slim AS packages-builder
WORKDIR /repo
# Layer caching for packages-builder
COPY packages/form-schema/package.json packages/form-schema/
RUN --mount=type=cache,id=frontend-npm-cache,sharing=locked,target=/root/.npm cd packages/form-schema && npm install --no-audit --no-fund
COPY packages/form-schema packages/form-schema
RUN cd packages/form-schema && npm run build

COPY packages/canvas-engine/package.json packages/canvas-engine/
RUN --mount=type=cache,id=frontend-npm-cache,sharing=locked,target=/root/.npm cd packages/canvas-engine && npm install --no-audit --no-fund
COPY packages/canvas-engine packages/canvas-engine
RUN cd packages/canvas-engine && npm run build

COPY packages/canvas-engine-react/package.json packages/canvas-engine-react/
RUN --mount=type=cache,id=frontend-npm-cache,sharing=locked,target=/root/.npm cd packages/canvas-engine-react && npm install --no-audit --no-fund
COPY packages/canvas-engine-react packages/canvas-engine-react
RUN cd packages/canvas-engine-react && npm run build

# Remove package-lock and node_modules from workspace packages so they don't
# interfere with the frontend's strict `npm ci` lockfile validation.
RUN rm -rf packages/*/node_modules packages/*/package-lock.json
# ── Stage 2: install deps + build ───────────────────────────────────────────
FROM node:20-bookworm-slim AS frontend-builder
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3
WORKDIR /repo
# Layer caching
COPY packages/form-schema/package.json packages/form-schema/
COPY packages/canvas-engine/package.json packages/canvas-engine/
COPY packages/canvas-engine-react/package.json packages/canvas-engine-react/
COPY frontend/package.json frontend/package-lock.json frontend/
WORKDIR /repo/frontend
# NEXT_PUBLIC_* vars are baked in at build time (Next.js convention)
# CRITICAL FIX (production incident, 2026-08 -- see docker/vendor-frontend.
# Dockerfile's matching comment for the full architecture-level writeup):
# this ARG previously had NO default value. Docker's own documented ARG
# semantics: an ARG with no default that is never supplied via
# `--build-arg` does not stay "unset" -- it resolves to an EMPTY STRING for
# every instruction that references it, including the `ENV` line right
# below. Since .gitea/scripts/build-and-push-image.sh never passes
# `--build-arg NEXT_PUBLIC_API_URL=...` for this image (only zoeconnect's
# build gets a `--build-arg`, for its own, unrelated
# NEXT_PUBLIC_APP_URL -- see that script's header), every production build
# of this image baked in `NEXT_PUBLIC_API_URL=""` -- a DEFINED, non-nullish
# empty string. Next.js's build-time inlining then embedded that literal
# `""` into the compiled client bundle everywhere `process.env.
# NEXT_PUBLIC_API_URL` is referenced (frontend/src/lib/api/client.ts and
# several other call sites) -- and because every one of those call sites
# guards the value with `??` (nullish coalescing), which only substitutes
# its fallback for `null`/`undefined`, an empty string is NOT nullish, so
# none of those fallbacks ever fired. Every axios call ended up using an
# EMPTY baseURL, silently dropping the intended `/api/v1` prefix from
# every request.
#
# Fixed with `/api/v1` (a RELATIVE path, deliberately NOT an absolute
# domain) -- architecturally correct for every deployment mode this
# single, shared image is ever run in: both cloud (docker/nginx/conf.d/
# cloud.conf) and self-hosted (docker/nginx/conf.d/self-hosted.conf)
# reverse-proxy `/api/` to hdsp_backend under the SAME hostname the
# frontend itself is served from -- confirmed identical in both nginx
# configs. A relative value therefore works correctly, unmodified, for
# every domain/environment this image is ever deployed to, with zero
# per-deployment-mode branching.
#
# DEFENSE-IN-DEPTH FIX (production incident, 2026-08 -- layer 2 of 3, see
# .gitea/scripts/build-and-push-image.sh's matching comment for the other
# two): CI (build-and-push-image.sh) now explicitly passes `--build-arg
# NEXT_PUBLIC_API_URL=/api/v1` for this image -- that's the PRIMARY,
# intended source of this value. This ARG is deliberately left WITHOUT a
# Dockerfile-level default (`ARG NEXT_PUBLIC_API_URL`, not `ARG
# NEXT_PUBLIC_API_URL=/api/v1`) so this file stays honest about that -- a
# default baked in here would silently keep working even if CI's
# `--build-arg` were ever accidentally removed, permanently hiding exactly
# the kind of pipeline misconfiguration that caused this incident. The
# `ENV` line's `${NEXT_PUBLIC_API_URL:-/api/v1}` is the safety net, not the
# primary mechanism -- Docker's own documented ARG semantics mean an
# unsupplied, default-less ARG resolves to an empty string, not "unset";
# `:-` is an explicit, self-documenting "fall back ONLY when genuinely
# missing or empty" that only activates as a last resort if CI's own
# `--build-arg` above is somehow skipped. See frontend/src/lib/api/
# client.ts's own `||` fallback for the third and final layer.
#
# NEXT_PUBLIC_APP_NAME below is UNCHANGED (still a plain Dockerfile
# default) -- it's a cosmetic display string, not a routing-critical value
# whose silent misconfiguration can break login; the three-layer treatment
# above is deliberately reserved for NEXT_PUBLIC_API_URL alone.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-/api/v1}
ARG NEXT_PUBLIC_APP_NAME=HDSP
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}
RUN npm install -g npm@11
RUN --mount=type=cache,id=frontend-npm-cache,sharing=locked,target=/root/.npm npm ci --no-audit --no-fund
# Copy compiled workspace packages and frontend source
COPY --from=packages-builder /repo/packages /repo/packages
COPY frontend /repo/frontend
RUN npm run build

# ── Stage 3: production dependencies ───────────────────────────────────────
# Deliberately NOT dependent on frontend-builder: only needs
# frontend/package.json + package-lock.json from the build context, so
# BuildKit can run this stage's `npm ci --omit=dev` in parallel with
# frontend-builder's `next build` instead of serializing after it (the
# previous COPY --from=frontend-builder wait-for-builder.json trick forced
# a full wait on the entire builder stage just to avoid two stages sharing
# one npm cache mount id — giving each stage its own id removes that
# hazard without giving up parallelism).
FROM node:20-bookworm-slim AS frontend-prod-deps
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3
WORKDIR /repo
COPY packages/form-schema/package.json packages/form-schema/
COPY packages/canvas-engine/package.json packages/canvas-engine/
COPY packages/canvas-engine-react/package.json packages/canvas-engine-react/
COPY frontend/package.json frontend/package-lock.json frontend/
WORKDIR /repo/frontend
RUN npm install -g npm@11
RUN --mount=type=cache,id=frontend-npm-cache,sharing=locked,target=/root/.npm npm ci --omit=dev --no-audit --no-fund

# ── Stage 4: production runtime ─────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends dumb-init \
    && groupadd -r hdsp && useradd -r -g hdsp hdsp
WORKDIR /repo/frontend
# --chown sets ownership per-file during the copy itself, avoiding a second
# full recursive filesystem walk over the whole tree (including
# node_modules) — a real CI run measured this exact pattern's `chown -R`
# step at 458.3s on the backend image; same fix applied here.
COPY --chown=hdsp:hdsp --from=frontend-builder /repo/frontend/.next ./.next
COPY --chown=hdsp:hdsp --from=frontend-builder /repo/frontend/public ./public
COPY --chown=hdsp:hdsp --from=frontend-builder /repo/frontend/package.json ./package.json
COPY --chown=hdsp:hdsp --from=frontend-prod-deps /repo/frontend/node_modules ./node_modules
COPY --chown=hdsp:hdsp --from=packages-builder /repo/packages ../packages
USER hdsp
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "start"]
