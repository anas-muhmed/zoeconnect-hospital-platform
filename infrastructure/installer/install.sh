#!/usr/bin/env bash
#
# HDSP Self-Hosted Installer (Phase 12, Task 12.4).
#
# Extends DEPLOY.md's manual PM2 runbook with a second, Docker-image-based
# path: pull versioned release images (published by build-images.yml to
# GHCR on a tagged release) instead of cloning source and running
# `npm run build` on the target server. DEPLOY.md's manual runbook remains
# the documented fallback -- this script does not replace it, and is not
# invoked by it.
#
# Usage:
#   ./install.sh <version>            # e.g. ./install.sh 1.2.0
#   ./install.sh <version> --upgrade  # skip the first-run interactive .env setup
#
# What this does, in order:
#   1. Checks for docker + the docker compose plugin.
#   2. On first run, copies env.selfhosted.template to .env and prompts for
#      every CHANGE_ME value (or, non-interactively, just fails loudly if
#      any CHANGE_ME remains -- never silently starts with placeholder
#      secrets).
#   3. Checks Backend<->Connector compatibility (Task 12.5) against
#      COMPATIBILITY.json before pulling anything, if the compose file's
#      commented-out connector service has been enabled.
#   4. `docker compose pull` -- pulls the exact versioned images.
#   5. `docker compose up -d postgres redis`, waits for both to be healthy.
#   6. Runs migrations via a one-off `docker compose run` of the backend
#      image (`npm run migration:run`).
#   7. Runs the reduced self-hosted provisioning pipeline
#      (`npm run provision:self-hosted`, idempotent -- see
#      backend/src/scripts/provision-self-hosted.ts).
#   8. `docker compose up -d` for the remaining services (backend, frontend).
#   9. Polls /api/v1/health/live until the stack is up.
#
# Never run end-to-end against a real Docker/AWS environment in this
# sandbox -- written and reasoned through carefully, same posture as every
# other Phase 9/12 infrastructure artifact in this project. Dry-run this on
# a real staging box before trusting it for a hospital's production install.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$SCRIPT_DIR/../docker"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.selfhosted.yml"
ENV_FILE="$COMPOSE_DIR/.env"
ENV_TEMPLATE="$SCRIPT_DIR/env.selfhosted.template"

VERSION="${1:-}"
UPGRADE_FLAG="${2:-}"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version> [--upgrade]"
  exit 1
fi

echo "== HDSP Self-Hosted Installer =="
echo "Target version: $VERSION"

# 1. Prerequisites
command -v docker >/dev/null 2>&1 || { echo "docker is required. See https://docs.docker.com/engine/install/"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose plugin is required."; exit 1; }

# 2. .env setup
if [ ! -f "$ENV_FILE" ]; then
  if [ "$UPGRADE_FLAG" = "--upgrade" ]; then
    echo "No .env found but --upgrade was passed -- cannot upgrade an install that was never set up. Run without --upgrade first."
    exit 1
  fi
  echo "No .env found -- copying template. Edit $ENV_FILE and re-run this script."
  cp "$ENV_TEMPLATE" "$ENV_FILE"
  exit 0
fi

if grep -q "CHANGE_ME" "$ENV_FILE"; then
  echo "$ENV_FILE still contains CHANGE_ME placeholder(s) -- edit every one before running the installer:"
  grep "CHANGE_ME" "$ENV_FILE"
  exit 1
fi

# Set the version this run targets (overrides whatever HDSP_VERSION the
# .env file has, so `./install.sh 1.3.0` always deploys 1.3.0 regardless of
# what was last written to .env).
export HDSP_VERSION="$VERSION"
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
export HDSP_VERSION="$VERSION"   # re-assert after sourcing .env, which may itself set an older HDSP_VERSION

# 3. Compatibility check (Task 12.5) -- only meaningful if the connector
# service is enabled in the compose file; skipped otherwise since embedded/
# direct-Oracle installs never run a Connector at all.
if grep -q "^\s*connector:" "$COMPOSE_FILE" && ! grep -q "^\s*#\s*connector:" "$COMPOSE_FILE"; then
  echo "Connector service is enabled -- checking Backend/Connector compatibility..."
  node "$SCRIPT_DIR/check-compatibility.js" "$VERSION" || { echo "Compatibility check failed -- aborting."; exit 1; }
fi

cd "$COMPOSE_DIR"

# 4. Pull images
echo "Pulling images for version $VERSION..."
docker compose -f docker-compose.selfhosted.yml pull

# 5. Start data stores, wait for healthy
echo "Starting Postgres and Redis..."
docker compose -f docker-compose.selfhosted.yml up -d postgres redis
echo "Waiting for Postgres and Redis to become healthy..."
for i in $(seq 1 30); do
  PG_OK=$(docker compose -f docker-compose.selfhosted.yml ps postgres --format json | grep -c '"Health":"healthy"' || true)
  REDIS_OK=$(docker compose -f docker-compose.selfhosted.yml ps redis --format json | grep -c '"Health":"healthy"' || true)
  if [ "$PG_OK" -ge 1 ] && [ "$REDIS_OK" -ge 1 ]; then break; fi
  sleep 3
  if [ "$i" -eq 30 ]; then echo "Postgres/Redis never became healthy"; exit 1; fi
done

# 6. Migrations
echo "Running migrations..."
docker compose -f docker-compose.selfhosted.yml run --rm backend npm run migration:run

# 7. Provisioning (idempotent -- safe on upgrade)
echo "Running initial tenant provisioning (skipped automatically if already provisioned)..."
docker compose -f docker-compose.selfhosted.yml run --rm backend npm run provision:self-hosted

# 8. Start everything
echo "Starting the full stack..."
docker compose -f docker-compose.selfhosted.yml up -d

# 9. Smoke check
echo "Waiting for the app to become healthy..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/api/v1/health/live >/dev/null; then
    echo "HDSP is up. Frontend: http://localhost:3000  Backend: http://localhost:3001"
    exit 0
  fi
  sleep 3
done
echo "App did not become healthy in time -- check 'docker compose -f docker-compose.selfhosted.yml logs backend'"
exit 1
