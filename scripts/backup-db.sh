#!/usr/bin/env bash
# Daily PostgreSQL backup of Mawid. Keeps the last BACKUP_KEEP_DAYS days (default 14).
#
#   DATABASE_URL=postgresql://user:pass@host:5432/mawid ./scripts/backup-db.sh
#
# Optional variables:
#   BACKUP_DIR         where the files go (default ./backups)
#   BACKUP_KEEP_DAYS   how many days to keep (default 14)
#   BACKUP_UPLOAD_CMD  a command run with the file path as $1 to copy it off the server,
#                      for example: 'aws s3 cp "$1" s3://my-bucket/mawid/' or 'rclone copy "$1" remote:mawid'
#   PG_CONTAINER       name of a Docker container running PostgreSQL: pg_dump is then run inside it, with the
#                      container's own POSTGRES_USER and POSTGRES_DB (DATABASE_URL is not needed). Use it when
#                      pg_dump is missing on the host or older than the server ("server version mismatch").
#   PG_DATABASE        database name inside the container (default: the container's POSTGRES_DB)
# Exit code is not 0 if anything fails, so cron or a monitor can warn you.
set -euo pipefail

if [ -z "${PG_CONTAINER:-}" ]; then
  : "${DATABASE_URL:?Set DATABASE_URL (postgresql://user:pass@host:port/db), or PG_CONTAINER for a Docker container}"
fi
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/mawid-$STAMP.dump"
TMP="$FILE.part"
trap 'rm -f "$TMP"' EXIT

echo "[backup] $(date -u +%FT%TZ) dumping to $FILE"
if [ -n "${PG_CONTAINER:-}" ]; then
  docker exec -i -e PGDB="${PG_DATABASE:-}" "$PG_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "${PGDB:-$POSTGRES_DB}" --format=custom --no-owner --compress=6' > "$TMP"
else
  pg_dump --format=custom --no-owner --compress=6 --dbname="$DATABASE_URL" --file="$TMP"
fi

# A backup you never checked is not a backup: the file must be readable and contain the main tables.
if [ -n "${PG_CONTAINER:-}" ]; then
  LIST="$(docker exec -i "$PG_CONTAINER" pg_restore --list < "$TMP")"
else
  LIST="$(pg_restore --list "$TMP")"
fi
for table in businesses bookings customers users; do
  echo "$LIST" | grep -q "TABLE DATA public $table " || { echo "[backup] ERROR: table $table missing from the dump" >&2; exit 1; }
done

mv "$TMP" "$FILE"
( cd "$BACKUP_DIR" && sha256sum "$(basename "$FILE")" > "$(basename "$FILE").sha256" )
SIZE="$(du -h "$FILE" | cut -f1)"
echo "[backup] ok: $FILE ($SIZE)"

if [ -n "${BACKUP_UPLOAD_CMD:-}" ]; then
  echo "[backup] uploading"
  bash -c "$BACKUP_UPLOAD_CMD" _ "$FILE"
fi

# Retention: remove the dumps (and their checksums) older than KEEP_DAYS days.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'mawid-*.dump' -o -name 'mawid-*.dump.sha256' \) -mtime +"$KEEP_DAYS" -print -delete \
  | sed 's/^/[backup] removed old file: /'
echo "[backup] done, $(find "$BACKUP_DIR" -maxdepth 1 -name 'mawid-*.dump' | wc -l) backup(s) kept"
