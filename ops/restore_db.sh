#!/usr/bin/env bash
# Restore a backup made by backup_db.sh into a database.
#
# Usage: TARGET_DATABASE_URL=postgresql://user:pass@host:5432/db ./ops/restore_db.sh backups/clothing_store_XXXX.dump
#
# Restore into a NEW, EMPTY database first and check it before pointing the app at it.
# The script refuses to restore into a database that already has tables.
set -euo pipefail

FILE="${1:?Pass the .dump file to restore}"
: "${TARGET_DATABASE_URL:?Set TARGET_DATABASE_URL (postgresql://...)}"
PG_URL="${TARGET_DATABASE_URL/postgresql+psycopg:/postgresql:}"

existing="$(psql "$PG_URL" -Atc "select count(*) from information_schema.tables where table_schema = 'public'")"
if [ "$existing" != "0" ]; then
  echo "Refusing to restore: target database already has $existing tables. Use an empty database." >&2
  exit 1
fi

pg_restore --no-owner --no-privileges --exit-on-error --dbname="$PG_URL" "$FILE"
echo "Restored $FILE"
psql "$PG_URL" -c "select (select count(*) from orders) as orders, (select count(*) from products) as products, (select count(*) from product_variants) as variants, (select version_num from alembic_version) as migration;"
