# ─────────────────────────────────────────────────────────────────────────────
# ZoeConnect (Next.js) — production image
#
# Build context MUST be the zoeconnect directory. Build with:
#   docker build -f ../docker/zoeconnect.Dockerfile -t hdsp-zoeconnect .
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: install deps + build ───────────────────────────────────────────
FROM node:20-bookworm-slim AS zoeconnect-builder
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install -g npm@11
RUN --mount=type=cache,id=frontend-npm-cache,sharing=locked,target=/root/.npm npm ci --legacy-peer-deps --no-audit --no-fund
COPY . .
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
RUN npm run build

# ── Stage 2: production dependencies ───────────────────────────────────────
# Deliberately NOT dependent on zoeconnect-builder: only needs the package
# manifests from the build context, so this stage's `npm ci --omit=dev` can
# run in parallel with the builder stage's `next build` instead of
# serializing after it (see docker/backend.Dockerfile's comment for the
# full rationale — same fix applied here).
FROM node:20-bookworm-slim AS zoeconnect-prod-deps
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install -g npm@11
RUN --mount=type=cache,id=frontend-npm-cache,sharing=locked,target=/root/.npm npm ci --omit=dev --legacy-peer-deps --no-audit --no-fund

# ── Stage 3: production runtime ─────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends dumb-init \
    && groupadd -r hdsp && useradd -r -g hdsp hdsp
WORKDIR /app
# --chown sets ownership per-file during the copy itself, avoiding a
# separate recursive `chown -R` walk over the whole tree (including
# node_modules) afterward — a real CI run measured this exact pattern's
# `chown -R` step at 458.3s on the backend image; same fix applied here.
COPY --chown=hdsp:hdsp --from=zoeconnect-builder /app/.next ./.next
COPY --chown=hdsp:hdsp --from=zoeconnect-builder /app/public ./public
COPY --chown=hdsp:hdsp --from=zoeconnect-builder /app/package.json ./package.json
COPY --chown=hdsp:hdsp --from=zoeconnect-prod-deps /app/node_modules ./node_modules
USER hdsp
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "start"]
