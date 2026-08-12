#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# HDSP Migration Runner
# Runs TypeORM migrations against the configured PostgreSQL database.
#
# Usage:
#   bash scripts/migrate.sh            # Run pending migrations
#   bash scripts/migrate.sh revert     # Revert last migration
#   bash scripts/migrate.sh show       # Show migration status
#   bash scripts/migrate.sh seed       # Run database seed
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")/../backend" && pwd)"
ACTION="${1:-run}"

echo "[migrate] Working directory: $BACKEND_DIR"
cd "$BACKEND_DIR"

# Verify .env exists
if [ ! -f ".env" ]; then
  echo "[ERROR] .env file not found. Copy .env.example to .env and configure it first."
  exit 1
fi

case "$ACTION" in
  run)
    echo "[migrate] Running pending migrations..."
    npm run migration:run
    echo "[migrate] Migrations complete."
    ;;
  revert)
    echo "[migrate] Reverting last migration..."
    npm run migration:revert
    ;;
  show)
    echo "[migrate] Migration status:"
    npm run migration:show
    ;;
  seed)
    echo "[migrate] Running database seed..."
    npm run seed
    ;;
  *)
    echo "Unknown action: $ACTION. Use: run | revert | show | seed"
    exit 1
    ;;
esac
