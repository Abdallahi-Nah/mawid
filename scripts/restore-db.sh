#!/usr/bin/env bash
# Restores a backup made by backup-db.sh.
#
#   TARGET_DATABASE_URL=postgresql://user:pass@host:5432/mawid_restore ./scripts/restore-db.sh backups/mawid-20261105-021500.dump
#   PG_CONTAINER=mawid-postgres-1 TARGET_DB=mawid_restore ./scripts/restore-db.sh backups/mawid-20261105-021500.dump
#
# SAFETY: the target must be given explicitly (it is never taken from DATABASE_URL), and the script refuses to
# touch a database that already has tables unless you add --force. To test a backup, restore it into a new empty
# database (createdb mawid_restore) and look at it; to recover production, stop the API first, then use --force.
# With PG_CONTAINER the tools run inside the Docker container (same version as the server) and TARGET_DB is
# the name of an existing database in it.
set -euo pipefail

FILE="${1:-}"
FORCE="${2:-}"
[ -f "$FILE" ] || { echo "Usage: TARGET_DATABASE_URL=... $0 <backup.dump> [--force]" >&2; exit 1; }

if [ -n "${PG_CONTAINER:-}" ]; then
  : "${TARGET_DB:?Set TARGET_DB (an existing database inside the container, to restore INTO)}"
  q() { docker exec -i -e DB="$TARGET_DB" "$PG_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d "$DB" -Atc "$1"' _ "$1"; }
  restore() { docker exec -i -e DB="$TARGET_DB" "$PG_CONTAINER" sh -c 'pg_restore -U "$POSTGRES_USER" -d "$DB" --clean --if-exists --no-owner --exit-on-error' < "$FILE"; }
else
  : "${TARGET_DATABASE_URL:?Set TARGET_DATABASE_URL (the database to restore INTO)}"
  q() { psql "$TARGET_DATABASE_URL" -Atc "$1"; }
  restore() { pg_restore --dbname="$TARGET_DATABASE_URL" --clean --if-exists --no-owner --exit-on-error "$FILE"; }
fi

if [ -f "$FILE.sha256" ]; then
  ( cd "$(dirname "$FILE")" && sha256sum --check --quiet "$(basename "$FILE").sha256" ) \
    || { echo "[restore] ERROR: the checksum does not match, the file is damaged" >&2; exit 1; }
  echo "[restore] checksum ok"
fi

TABLES="$(q "select count(*) from information_schema.tables where table_schema='public'")"
if [ "$TABLES" != "0" ] && [ "$FORCE" != "--force" ]; then
  echo "[restore] REFUSED: the target database already has $TABLES tables. Use an empty database, or add --force to replace them." >&2
  exit 1
fi

q "CREATE EXTENSION IF NOT EXISTS btree_gist" >/dev/null
echo "[restore] restoring $FILE"
restore

for table in businesses bookings customers users; do
  echo "[restore] $table: $(q "select count(*) from $table") rows"
done
echo "[restore] done. Then run: pnpm --filter api exec prisma migrate deploy"
