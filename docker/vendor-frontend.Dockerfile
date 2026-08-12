# ─────────────────────────────────────────────────────────────────────────────
# HDSP Vendor Portal Frontend (Next.js) — production image
#
# Replaces vendor-portal/frontend/Dockerfile (kept, untouched) for the
# root docker-compose.yml / GHCR pipeline: that file runs as root, has no
# healthcheck, and — importantly — hardcodes EXPOSE 3001 / PORT=3001, even
# though this app's own package.json runs `next start -p 4001` and the
# project's port allocation (and vendor-portal/docker-compose.yml's own
# `ports: 3001:3001` mapping) both call this 4001. That mismatch is fixed
# here; no vendor-portal frontend code changes.
#
# vendor-frontend has no local `file:` workspace dependencies (see
# vendor-portal/frontend/package.json) — no packages-builder stage needed.
# next.config.js already sets `output: 'standalone'`, so this image copies
# the pruned .next/standalone output directly (no full node_modules
# reinstall needed), unlike docker/frontend.Dockerfile.
#
# Build context MUST be the monorepo root, for consistency with the other
# three images. Build with:
#   docker build -f docker/vendor-frontend.Dockerfile -t hdsp-vendor-frontend .

# ── Stage 1: install deps + build ───────────────────────────────────────────
FROM node:20-bookworm-slim AS vendor-frontend-builder
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3
WORKDIR /repo/vendor-portal/frontend
COPY vendor-portal/frontend/package.json vendor-portal/frontend/package-lock.json ./
RUN --mount=type=cache,id=frontend-npm-cache,sharing=locked,target=/root/.npm npm ci --no-audit --no-fund
COPY vendor-portal/frontend .
# CRITICAL FIX (production incident, 2026-08): Vendor Portal login was
# failing in every deployment this image was ever built for -- the browser
# posted to `<origin>/auth/login` (404, no page route there) instead of
# `<origin>/api/auth/login`. Root cause traced end-to-end:
#
# 1. This ARG previously had NO default value (just `ARG
#    NEXT_PUBLIC_API_URL`, matching the comment below about
#    vendor-portal/docker-compose.yml -- that comment described the local
#    dev compose file's OWN, separate `NEXT_PUBLIC_API_URL` env var, not
#    this image's build args at all -- a stale/misleading cross-reference).
# 2. Docker's own documented ARG semantics: an ARG with no default that's
#    never supplied via `--build-arg` resolves to an EMPTY STRING (not
#    "unset") for every instruction referencing it, including the `ENV`
#    line right below.
# 3. .gitea/scripts/build-and-push-image.sh's BUILD_ARGS mechanism only
#    ever passes a `--build-arg` for zoeconnect's own, unrelated
#    NEXT_PUBLIC_APP_URL (see that script's header) -- it never passed one
#    for this image, for either cloud or self-hosted builds (both pull the
#    exact same image tag from the registry; there is no separate
#    per-mode build).
# 4. So every production build baked in `NEXT_PUBLIC_API_URL=""` -- a
#    DEFINED, non-nullish empty string. Next.js's build-time inlining
#    embedded that literal `""` into the compiled client bundle wherever
#    `process.env.NEXT_PUBLIC_API_URL` is referenced
#    (vendor-portal/frontend/src/lib/api/client.ts).
# 5. That call site guards the value with `??` (nullish coalescing), which
#    only substitutes its fallback (`http://localhost:4000/api`) for
#    `null`/`undefined` -- an empty string is NOT nullish, so the fallback
#    never fired. `apiClient`'s `baseURL` ended up permanently `""`,
#    dropping the `/api` prefix from every request and sending it as a
#    same-origin, unprefixed path instead -- exactly the observed
#    `POST <origin>/auth/login` 404.
#
# Fixed with `/api` (a RELATIVE path, deliberately NOT an absolute domain
# like `https://vendor.zoeconnect.in/api`) -- architecturally correct for
# every deployment mode this single, shared image is ever run in. Both
# cloud (docker/nginx/conf.d/cloud.conf's `vendor.zoeconnect.in` server
# block) and self-hosted (docker/nginx/conf.d/self-hosted.conf's
# `vendor.hdsp.local` server block) reverse-proxy `/api/` to vendor_backend
# under the SAME hostname vendor_frontend itself is served from --
# confirmed byte-for-byte identical `location /api/` blocks in both nginx
# configs. A relative value therefore works correctly, unmodified, in
# every environment this image is ever deployed to, with zero
# per-deployment-mode branching, and without ever hardcoding
# `vendor.zoeconnect.in` (or any other domain) into application code or
# the image. See the three-layer defense-in-depth explanation immediately
# below for exactly WHERE that value now lives -- deliberately NOT as a
# bare Dockerfile default.
# DEFENSE-IN-DEPTH FIX (production incident, 2026-08 -- layer 2 of 3, see
# .gitea/scripts/build-and-push-image.sh's matching comment for the other
# two): CI (build-and-push-image.sh) now explicitly passes `--build-arg
# NEXT_PUBLIC_API_URL=/api` for this image -- that's the PRIMARY,
# intended source of this value, and the one place an operator should
# look to see what this image is actually built for. This ARG is
# deliberately left WITHOUT a Dockerfile-level default (`ARG
# NEXT_PUBLIC_API_URL`, not `ARG NEXT_PUBLIC_API_URL=/api`) so this file
# stays honest about that -- a default baked in here would silently keep
# working even if CI's `--build-arg` were ever accidentally removed,
# permanently hiding exactly the kind of pipeline misconfiguration that
# caused this incident in the first place.
#
# The `ENV` line's `${NEXT_PUBLIC_API_URL:-/api}` is the safety net, not
# the primary mechanism: Docker's own documented ARG semantics mean an
# unsupplied, default-less ARG resolves to an empty string, not "unset" --
# `:-` (unlike a bare Dockerfile ARG default) is an explicit,
# self-documenting "fall back ONLY when the value is genuinely missing or
# empty" that only ever activates as a last resort if CI's own
# `--build-arg` above is somehow skipped. See vendor-portal/frontend/src/
# lib/api/client.ts's own `||` fallback for the third and final layer.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-/api}
RUN npm run build

# ── Stage 2: production runtime ─────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends dumb-init \
    && groupadd -r hdsp && useradd -r -g hdsp hdsp
WORKDIR /app
# --chown sets ownership per-file during the copy itself, avoiding a
# separate recursive `chown -R` walk over the whole tree afterward — a real
# CI run measured this exact pattern's `chown -R` step at 458.3s on the
# backend image; same fix applied here.
COPY --chown=hdsp:hdsp --from=vendor-frontend-builder /repo/vendor-portal/frontend/.next/standalone ./
COPY --chown=hdsp:hdsp --from=vendor-frontend-builder /repo/vendor-portal/frontend/.next/static ./.next/static
# NOTE: vendor-portal/frontend has no public/ directory in this repo today
# — intentionally not copied (a COPY of a nonexistent path would fail the
# build). Add a COPY line here if a public/ directory is introduced later.
USER hdsp
ENV NODE_ENV=production
ENV PORT=4001
# CRITICAL FIX (production incident, 2026-08): this image's CMD runs
# Next.js's *standalone* output (server.js), whose generated server
# template binds to `process.env.HOSTNAME || 'localhost'`. Docker
# auto-injects HOSTNAME=<container ID> into every container by default,
# so without this override the app was binding only to its own
# container-ID hostname (-> its eth0 IP), never to loopback -- which made
# the HEALTHCHECK below (targeting 127.0.0.1, from inside the container)
# fail with a connection error on every single deploy, while external
# traffic through the published port kept working (Docker's NAT lands on
# eth0, which was bound). See docker-compose.yml's matching comment on
# this service's `environment:` block for the full incident writeup --
# that env var is a compose-level copy of this same fix so a running
# deployment can be corrected without a rebuild; this one makes the image
# itself correct regardless of how it's run.
ENV HOSTNAME=0.0.0.0
EXPOSE 4001
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:4001/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
