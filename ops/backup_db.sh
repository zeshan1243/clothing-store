#!/usr/bin/env bash
# Back up the database to a compressed, timestamped pg_dump file and prune old backups.
#
# Usage: DATABASE_URL=postgresql://user:pass@host:5432/db ./ops/backup_db.sh [backup_dir]
# Env:   BACKUP_RETENTION_DAYS (default 30)
#
# Managed Postgres providers also take automatic backups — keep those switched on. This script is an
# extra, provider-independent copy; store its output somewhere other than the database host.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL (postgresql://...)}"
BACKUP_DIR="${1:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
# pg_dump doesn't understand SQLAlchemy's "+psycopg" driver suffix.
PG_URL="${DATABASE_URL/postgresql+psycopg:/postgresql:}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/clothing_store_${STAMP}.dump"

pg_dump --format=custom --no-owner --no-privileges --file="$FILE" "$PG_URL"
# Quick integrity check: the archive's table of contents must be readable.
pg_restore --list "$FILE" > /dev/null

find "$BACKUP_DIR" -name 'clothing_store_*.dump' -mtime +"$RETENTION_DAYS" -delete
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
