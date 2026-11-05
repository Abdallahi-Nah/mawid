#!/bin/sh
# Applies the database migrations, then starts the API. Set RUN_MIGRATIONS=false to skip them
# (for example when several replicas start together and a separate release step migrates).
set -e
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] applying database migrations"
  node_modules/.bin/prisma migrate deploy
fi
exec "$@"
