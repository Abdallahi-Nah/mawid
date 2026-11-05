# Operations and reliability

What keeps Mawid running, how to see that it runs, and what to do when it does not.

## Logs
- The API writes **one JSON line per request** in production (pino); in development they are colored and readable.
  Level: `LOG_LEVEL` (`info` by default in production). 5xx are `error`, 4xx are `warn`, health checks are not logged.
- Every request has an id: the caller's `x-request-id` (if it is 8-64 letters, digits, `-` or `_`) or a new UUID.
  It is returned in the `x-request-id` response header and appears in the log line: give it to support to find
  one request.
- A line shows the **path without the query string** (it can hold names or emails), never cookies or tokens
  (redacted), and the `userId` / `businessId` when the user is logged in. There is no personal data in the logs.
- An unexpected error (5xx) is logged with its stack, and sent to Sentry if it is configured.

## Health and readiness
| URL | Meaning | Use it for |
|---|---|---|
| `GET /health` | The process is alive. Touches no dependency. | Container liveness probe / restart policy |
| `GET /health/ready` | PostgreSQL **and** Redis answer within 2 s. `503` with `{details: {database, redis}}` if one is down. | Load balancer / platform health check, uptime monitor |

On Railway or Render, use `/health/ready` as the health check path. Use `/health` for Docker `HEALTHCHECK`.

## Graceful shutdown
`SIGTERM`/`SIGINT` (a deploy, a restart) stop the API cleanly: it stops accepting requests, the email worker
finishes the jobs it is running, then Redis and the database are closed. Checked on the built server: the
process exits in about 0.5 s with code 0. An unhandled promise rejection is logged and does not kill the process.

## Emails: retries and dead-letter list
1. Every email is a BullMQ job in Redis. If sending fails it is **retried 3 times** with exponential backoff
   (`NOTIFY_BACKOFF_MS`, 30 s by default). Reminders are delayed jobs scheduled 24 h before the appointment.
2. A booking is never lost or blocked by a failing email (tested: "a broken queue never breaks the booking").
3. After the last attempt the notification is kept in the database with `status = FAILED` and the **last error**.
4. **Dead-letter list:** an administrator sees these emails in `/admin` ("Failed emails") or with
   `GET /admin/failed-notifications`, fixes the cause (for example `RESEND_API_KEY` or an unverified domain),
   then presses **Send again** (`POST /admin/failed-notifications/:id/retry`): the email gets 3 new attempts.
   Obsolete mails (a reminder for a cancelled appointment) are discarded by the worker, not sent.

## Error tracking (Sentry)
- API (`@sentry/node`) and web (`@sentry/nextjs`) are wired but **off until you set a DSN**: `SENTRY_DSN` for the
  API and for the web server, and `SENTRY_DSN` at the web **build** (it is exposed to the browser as
  `NEXT_PUBLIC_SENTRY_DSN`; a DSN only allows sending events). Optional: `SENTRY_RELEASE`.
- Without a DSN nothing is sent and the browser does not even download the Sentry code (the public page stays light).
- Before sending, events are cleaned: no cookies, no request body, no query string, headers named
  `authorization`, `cookie`, `*token*`, `*password*`, `*secret*`, `*api-key*` are redacted, the user is reduced to
  its id, and no source code lines are attached. A test sends an error to a fake Sentry server and checks this.
- Web: set `SENTRY_INGEST_ORIGIN` (for example `https://o123.ingest.sentry.io`) at build time so the
  Content-Security-Policy allows the browser to reach Sentry.
- Create two Sentry projects (Node and Next.js) or one shared project, and set an alert on new issues.

## Database backup and restore
Scripts: `scripts/backup-db.sh`, `scripts/restore-db.sh`, `scripts/backup-cron.example`.

**Backup (daily, 14 days kept):**
```bash
DATABASE_URL=postgresql://user:pass@host:5432/mawid BACKUP_DIR=/var/backups/mawid ./scripts/backup-db.sh
```
- Writes `mawid-YYYYmmdd-HHMMSS.dump` (PostgreSQL custom format, compressed) and a `.sha256` checksum.
- **Checks the file** before keeping it (readable, contains the main tables); exits non-zero if not.
- **Deletes** dumps older than `BACKUP_KEEP_DAYS` (14 by default).
- `BACKUP_UPLOAD_CMD` copies each dump off the server (S3, rclone...), for example
  `BACKUP_UPLOAD_CMD='aws s3 cp "$1" s3://my-bucket/mawid/'`. **A backup that stays on the same disk as the
  database is not enough: always copy it elsewhere.**
- If `pg_dump` is not on the host or is older than the server, use `PG_CONTAINER=<postgres container name>`.
- Schedule it with cron: see `scripts/backup-cron.example` (daily at 02:15). On Railway, use a scheduled job or the
  platform's own database backups in addition.

**Restore (test it once a month):**
```bash
createdb mawid_restore
TARGET_DATABASE_URL=postgresql://user:pass@host:5432/mawid_restore ./scripts/restore-db.sh backups/mawid-20261105-021500.dump
```
- It verifies the checksum, **refuses to touch a database that already has tables** (add `--force` to replace
  them), restores, and prints the row count of the main tables. The `no_overlap` anti-double-booking constraint
  is restored with the tables (checked).
- To recover production: stop the API, restore into the real database with `--force`, run
  `pnpm --filter api exec prisma migrate deploy`, start the API, check `/health/ready`.
- Redis holds only the email queue: after losing it, reminders already scheduled must be recreated by
  re-saving the booking (rare). Business data is all in PostgreSQL.

Both scripts were tested on the Docker database: backup, restore into an empty database, refusal on a
non-empty one, `--force`, damaged-file detection and the 14-day retention.

## Checklist after a deploy
1. `GET /health/ready` answers 200.
2. Open the public page and make one booking.
3. In `/admin`, "Failed emails" is empty (or the failures are understood).
4. Sentry shows the new release and no new issue.
