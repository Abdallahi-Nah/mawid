#!/usr/bin/env bash
# Runs every browser test against a freshly built stack: API (with the scripted AI model, no Groq key), web app,
# demo seed. Used by CI (job "e2e") and usable on your machine:  bash scripts/e2e-ci.sh
# Needs PostgreSQL (migrated) and Redis running, DATABASE_URL and REDIS_URL set, and Google Chrome installed.
set -euo pipefail
cd "$(dirname "$0")/.."

export API_URL="${API_URL:-http://localhost:4010}"
export APP_URL="${APP_URL:-http://localhost:3100}"
API_PORT="${API_URL##*:}"
WEB_PORT="${APP_URL##*:}"
export JWT_SECRET="${JWT_SECRET:-ci-only-jwt-secret-at-least-32-characters}"
export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-ci-only-refresh-secret-at-least-32-chars}"
export MAIL_FROM="${MAIL_FROM:-Mawid <no-reply@example.com>}"
export THROTTLE_DISABLED=true QUEUE_PREFIX="mawid-e2e-$$" UPLOAD_DIR="${UPLOAD_DIR:-/tmp/mawid-e2e-uploads}"
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT

echo "== build"
pnpm --filter @mawid/shared build
pnpm --filter api build
pnpm --filter web build

echo "== seed"
pnpm --filter api db:seed

echo "== start the API (scripted AI model) and the web app"
(cd apps/api && PORT="$API_PORT" node dist/dev/e2e-server.js > /tmp/e2e-api.log 2>&1) & PIDS+=($!)
(cd apps/web && pnpm exec next start -p "$WEB_PORT" > /tmp/e2e-web.log 2>&1) & PIDS+=($!)
for i in $(seq 1 60); do
  curl -fs "$API_URL/health/ready" >/dev/null && curl -fs -o /dev/null "$APP_URL/fr" && break
  sleep 2
done
curl -fs "$API_URL/health/ready" >/dev/null || { echo "API did not start"; tail -30 /tmp/e2e-api.log; exit 1; }
curl -fs -o /dev/null "$APP_URL/fr" || { echo "Web did not start"; tail -30 /tmp/e2e-web.log; exit 1; }

cd apps/web
FAILED=0
run() { echo; echo "== $1"; shift; "$@" || { echo "FAILED: $*"; FAILED=1; }; }
# Registration + onboarding + dashboard pages + public page + logout
run "real flow (register, onboarding)"        node scripts/flow-check.mjs "$APP_URL"
# AC-01: full booking in ar and fr at 360 px, cancel by link, owner calendar, drag and drop
run "booking ar + fr, cancel, calendar"       node scripts/booking-e2e.mjs "$APP_URL"
# AC-05, AC-06: AI chat with the scripted model, fallback when the AI is down, owner AI tools
run "AI chat (mocked Groq)"                   node scripts/ai-e2e.mjs "$APP_URL" "$API_URL"
# Dashboard numbers, CSV, deposit, reviews, QR, plan limits, admin
run "dashboard, deposit, reviews, plan, admin" node scripts/phase5-e2e.mjs "$APP_URL" "$API_URL"
run "keyboard"                                 node scripts/a11y-keyboard.mjs "$APP_URL"
run "accessibility (axe)"                      node scripts/a11y.mjs "$APP_URL" "$API_URL"
echo
[ "$FAILED" = "0" ] && echo "ALL BROWSER TESTS PASSED" || { echo "SOME BROWSER TESTS FAILED"; exit 1; }
