# Deploying Mawid

Nothing in this guide has been deployed for you and nothing here creates a paid resource by itself. Follow the
steps in order. Plan about 1 to 2 hours the first time.

**Architecture:** the web app (Next.js) runs on **Vercel**; the API, PostgreSQL and Redis run on **Railway**
(or Render, or one VPS with Docker). Email is sent by **Resend**, the assistant uses **Groq**.

```
Browser ──> app.example.com  (Vercel, Next.js)
   │
   └─────> api.example.com  (Railway: API container ── PostgreSQL ── Redis)
                                  ├── Resend (emails)
                                  └── Groq (assistant)
```

## 0. The one rule you must not break: use ONE domain name for both sides
The login cookies are `SameSite=Lax`. A browser only sends them to the API if the web app and the API are on the
**same site**, i.e. subdomains of the same domain you own:

| | Works |
|---|---|
| `app.example.com` + `api.example.com` | yes |
| `mawid.vercel.app` + `xxx.up.railway.app` | **no**: different sites, nobody could stay logged in |

So buy or reuse a domain (about 10 USD per year) and create two subdomains. Everything below assumes
`app.example.com` (web) and `api.example.com` (API).

## 1. Accounts and keys to prepare
| What | Where | Needed for |
|---|---|---|
| Domain + DNS access | any registrar | both URLs |
| Resend account, **verified domain**, API key | resend.com | confirmation and reminder emails (AC-10) |
| Groq API key | console.groq.com | the AI assistant (optional: without it the normal booking works) |
| Sentry (optional) | sentry.io | error tracking |
| GitHub repo | github.com | automatic deploys |

Generate the two JWT secrets (different values, 32+ characters each):
```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
```

## 2. Environment variables

### API (Railway / Docker)
| Variable | Required | Example / default | Notes |
|---|---|---|---|
| `NODE_ENV` | yes | `production` | The Dockerfile sets it. Makes cookies `Secure` and turns on HSTS. |
| `PORT` | no | `4000` | Railway sets it for you. |
| `DATABASE_URL` | yes | `postgresql://user:pass@host:5432/mawid` | Railway gives it with the PostgreSQL service. |
| `REDIS_URL` | yes | `redis://default:pass@host:6379` | Email queue. |
| `JWT_SECRET` | yes | 32+ characters | Access tokens and signed booking drafts. |
| `JWT_REFRESH_SECRET` | yes | 32+ characters, different | Refresh tokens. |
| `APP_URL` | yes | `https://app.example.com` | The web origin: CORS, CSRF check and email links. |
| `API_URL` | yes | `https://api.example.com` | Public URL of the API (uploaded image links, `.ics` links). |
| `MAIL_FROM` | yes | `Mawid <no-reply@example.com>` | Must use the domain verified in Resend. |
| `RESEND_API_KEY` | for real emails | `re_...` | Empty: emails are printed in the logs only. |
| `GROQ_API_KEY` | for the assistant | `gsk_...` | Empty: the assistant is "unavailable", booking still works. |
| `GROQ_MODEL_CHAT` / `_FAST` / `_STT` | no | empty | Empty = defaults `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `whisper-large-v3-turbo`. |
| `AI_ENABLED` | no | `true` | `false` = kill switch for all AI features. |
| `AI_TIMEOUT_MS` | no | `15000` | Groq call timeout. |
| `AI_MONTHLY_QUOTA` | no | `1000` | Groq calls per month for a FREE business (PRO x10, BUSINESS x50). |
| `TRUST_PROXY` | **yes behind a proxy** | `1` | Railway, Render and Caddy are one proxy. Without it every visitor shares one IP and the rate limits block everybody together. |
| `UPLOAD_DIR` | no | `/data/uploads` | Logos, photos, payment screenshots. Needs a **persistent volume** (see 3.1, step 5). |
| `SENTRY_DSN` | no | `https://...@o0.ingest.sentry.io/0` | Empty = Sentry off. |
| `SENTRY_RELEASE` | no | `v1.0.0` | Shown in Sentry. |
| `LOG_LEVEL` | no | `info` | `debug` for a short investigation. |
| `API_DOCS` | no | `false` | `true` shows Swagger at `/docs`; keep it off in production. |
| `QUEUE_PREFIX` | no | `mawid` | Only to share one Redis between environments. |
| `NOTIFY_BACKOFF_MS` | no | `30000` | Delay before retrying a failed email. |
| `RUN_MIGRATIONS` | no | `true` | Docker entrypoint: apply database migrations at start. |

### Web (Vercel)
Both are needed at **build** time too (the API address is built into the browser code), so set them for
Production **and** Preview, then redeploy after any change.

| Variable | Required | Example | Notes |
|---|---|---|---|
| `APP_URL` | yes | `https://app.example.com` | |
| `API_URL` | yes | `https://api.example.com` | |
| `SENTRY_DSN` | no | same DSN as the API | Empty = off (nothing is downloaded by browsers). |
| `SENTRY_INGEST_ORIGIN` | if Sentry | `https://o0.ingest.sentry.io` | Host of the DSN, allowed by the Content-Security-Policy. |
| `SENTRY_RELEASE` | no | `v1.0.0` | |

Never put `GROQ_API_KEY`, `JWT_*` or any secret in Vercel: the web app does not need them.

## 3. Option A (recommended): web on Vercel + API on Railway

### 3.1 API, PostgreSQL and Redis on Railway
1. railway.app → **New Project** → **Deploy from GitHub repo** → choose this repository.
2. In the service **Settings**:
   - Builder: **Dockerfile**, Dockerfile path `apps/api/Dockerfile`, **root directory = repository root** (`/`).
   - **Healthcheck path:** `/health/ready`.
   - Restart policy: on failure.
3. In the same project: **New → Database → PostgreSQL**, and **New → Database → Redis**.
4. Service **Variables** (use Railway references so you do not copy passwords):
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`, `REDIS_URL` = `${{Redis.REDIS_URL}}`
   - all the other API variables of the table above (`APP_URL`, `API_URL`, `JWT_*`, `MAIL_FROM`, `TRUST_PROXY=1`, ...).
5. **Volume** for uploads: service → **Volumes → New volume**, mount path `/data/uploads`. Without it,
   uploaded logos and payment screenshots disappear at every deploy.
6. **Networking → Custom domain** → `api.example.com`. Create the DNS record Railway shows (a CNAME) at your
   registrar. HTTPS is automatic.
7. **Deploy.** The container applies the database migrations at start (`prisma migrate deploy`) and the check
   `/health/ready` must turn green.
8. Create your administrator (there is no sign-up for admins). In the service shell (Railway CLI `railway run`
   or the web terminal):
   ```bash
   ADMIN_PASSWORD='a-long-password-of-12-chars-or-more' node dist/dev/create-admin.js you@example.com
   ```

### 3.2 Web on Vercel
1. vercel.com → **Add New → Project** → import the repository.
2. **Root Directory:** `apps/web` (keep "Include source files outside of the Root Directory" on).
   `apps/web/vercel.json` already sets the install command (from the repository root) and the build command.
3. **Environment Variables:** `APP_URL`, `API_URL` (and the Sentry ones if you use them) for Production and Preview.
4. **Deploy**, then **Settings → Domains** → add `app.example.com` and create the DNS record Vercel shows.
5. Redeploy once the domain works, so `APP_URL` is final everywhere.

## 4. Option B: one VPS with Docker (API + PostgreSQL + Redis + HTTPS)
Use any Linux server with Docker (a 2 GB VPS is enough to start). The web app stays on Vercel (step 3.2).
1. Point `api.example.com` to the server's IP (DNS **A** record) and open ports 80 and 443.
2. On the server: `git clone` the repository, then
   ```bash
   cp deploy/.env.prod.example deploy/.env.prod     # fill in every value, see the table above
   docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
   ```
3. Caddy gets the HTTPS certificate by itself. Check `https://api.example.com/health/ready`.
4. Create the administrator:
   ```bash
   docker compose -f docker-compose.prod.yml exec -e ADMIN_PASSWORD='a-long-password' api node dist/dev/create-admin.js you@example.com
   ```
5. Update later with `git pull && docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod up -d --build`
   (migrations run at start; the old container is stopped gracefully).
6. Schedule the daily database backup: `scripts/backup-cron.example` (see `docs/OPERATIONS.md`).

## 5. Option C: Render
Create a **Web Service** from the repository with **Docker** runtime, Dockerfile path `apps/api/Dockerfile`,
health check path `/health/ready`, plus a **PostgreSQL** and a **Key Value (Redis)** instance, and a **Disk**
mounted at `/data/uploads`. Set the same variables (Render's internal connection strings for `DATABASE_URL` and
`REDIS_URL`, and `TRUST_PROXY=1`). Then follow 3.1 steps 6 to 8 and 3.2. A web service on the free plan sleeps
when idle: use a paid plan for a real business.

## 6. Email (Resend), needed for AC-10
1. Resend → **Domains** → add `example.com`, create the DNS records it shows (SPF, DKIM), wait until "Verified".
2. Create an API key → `RESEND_API_KEY`. Set `MAIL_FROM` to an address of that domain.
3. Test from your machine against the production keys:
   `pnpm --filter api build && pnpm --filter api mail:check you@gmail.com` (sends the 3 email types; look in the
   inbox and the spam folder).

## 7. First checks after the deploy
1. `https://api.example.com/health/ready` → `{"status":"ok","checks":{"database":"up","redis":"up"}, ...}`.
2. `https://app.example.com` loads; switch language ar / fr / en.
3. Register a test business, add a service and an employee with working hours, open `/b/<slug>`, make a booking,
   and check that you receive the confirmation email.
4. Log in as administrator → `/fr/admin` shows the statistics; "Failed emails" is empty.
5. If you set a Groq key: open the assistant on the public page and book through it.
6. Response headers: `curl -I https://app.example.com` shows `Content-Security-Policy` and
   `Strict-Transport-Security`; `curl -I https://api.example.com/health` shows the API headers.
7. Logged in, refresh the page: you stay logged in (this proves the two-subdomains rule of section 0).

## 8. Demo environment for your portfolio
A separate environment (its own database) with realistic invented data, for the link in your profile:
```bash
node dist/dev/demo-data.js            # in the API container / shell; creates the demo data
node dist/dev/demo-data.js --reset-only   # deletes it
```
It creates an Arabic salon (`/ar/b/demo-salon`) and a French clinic (`/fr/b/demo-clinique`), about 6 weeks of
bookings, deposits and reviews, and 3 accounts with the password `Demo1234!`:
`demo.salon@demo.mawid.test`, `demo.clinic@demo.mawid.test` (owners) and `demo.admin@demo.mawid.test` (admin).
Running it again resets the demo. To reset it every night, schedule that command (Railway cron, or `cron` on the
VPS). **Do not run it on your real production database**: it only deletes the demo rows, but keep demo and
production separate (the demo has public passwords). On a platform with an ephemeral disk, run it at every
start so the logos and photos exist.

## 9. Costs to expect (check the current prices)
Vercel free plan for the web; Railway usage-based (a small API + PostgreSQL + Redis is usually a few USD per month);
Resend free tier (3 000 emails per month at the time of writing); Groq free tier with rate limits; a domain about
10 USD per year; Sentry free tier. A VPS replaces the Railway cost.

## 10. Rollback and backups
- **Rollback the web:** Vercel → Deployments → previous deployment → **Promote to Production**.
- **Rollback the API:** Railway → Deployments → redeploy the previous one. A migration is not undone: only add
  columns in a compatible way, or restore a backup (`docs/OPERATIONS.md`).
- **Backups:** schedule `scripts/backup-db.sh` and copy the dumps off the server. Test a restore once a month.
