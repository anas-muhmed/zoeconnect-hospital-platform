#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# HDSP PostgreSQL Backup Script
# Schedule with cron: 0 2 * * * /opt/hdsp/scripts/backup.sh >> /opt/hdsp/logs/backup.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BACKUP_DIR="/opt/hdsp/backups"
DB_NAME="${DB_NAME:-hdsp_db}"
DB_USER="${DB_USER:-hdsp_app}"
RETENTION_DAYS=30
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/hdsp_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup: $BACKUP_FILE"
PGPASSWORD="${DB_PASSWORD}" pg_dump \
  -h "${DB_HOST:-localhost}" \
  -p "${DB_PORT:-5432}" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-acl \
  | gzip > "$BACKUP_FILE"

SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup complete: $BACKUP_FILE ($SIZE)"

# Remove backups older than RETENTION_DAYS
find "$BACKUP_DIR" -name "hdsp_*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "[$(date)] Old backups pruned (retention: ${RETENTION_DAYS} days)"

# Restore command (reference):
# gunzip -c $BACKUP_FILE | PGPASSWORD=xxx pg_restore -h localhost -U hdsp_app -d hdsp_db --clean
