# Security

Review of Mawid against the OWASP Top 10 (2021), done in phase 6. Every line below is backed by a test or a
command you can run again. The tests are in `apps/api/src/security/` and in the phase suites.

## How to re-run the checks

| Check | Command |
|---|---|
| All API tests (unit + integration) | `pnpm --filter api test` |
| Authorization of every route | `pnpm --filter api exec jest src/security/routes` |
| Hardening (headers, cookies, CSRF, injection, XSS, uploads, auth) | `pnpm --filter api exec jest src/security/hardening` |
| Rate limits | `pnpm --filter api exec jest src/security/throttle` |
| Dependency audit | `pnpm audit --prod` |
| Secrets in the whole git history | `docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect --source /repo --redact -v` |

## Findings and fixes

### A01 Broken access control
- **Every route is guarded or explicitly public.** `routes.e2e.spec.ts` finds all routes automatically
  (Nest metadata). A route must be `@Public()` (exact list in the test), or have `@Roles(...)`, or be in the
  short "any logged-in user" list (`GET /auth/me`). A new route that is none of these fails the build.
- Without a session, all 50 guarded routes answer 401. With a `CLIENT` account, all 49 role-protected routes
  answer 403. Admin routes accept only `ADMIN`, and no other route accepts `ADMIN`.
- **Tenant isolation (AC-07).** Every query of a business goes through `PrismaService.forTenant(businessId)`,
  which forces `business_id` and refuses raw SQL and unknown models (fail closed). Isolation tests exist for
  services, staff, bookings, customers, notifications, time off, payments, reviews, reports and the AI tools.
  The only code that reads across businesses is `AdminService` (ADMIN role) and the secret-token lookups
  (booking, review links), which are commented where they happen.
- **CSRF (new).** Session cookies are `SameSite=Lax`. In addition, `csrfGuard` refuses a state-changing request
  that carries a session cookie when its `Origin` (or `Referer`) is not the web app or the API. A cross-site
  request without `Origin` but with `Sec-Fetch-Site: cross-site` is also refused (`403 CSRF_BLOCKED`).

### A02 Cryptographic failures
- Passwords: argon2id. Reset tokens and refresh tokens are stored as hashes / ids, never in clear.
- JWT access (15 min) and refresh (7 days, rotated, reuse revokes the whole family) use two different secrets
  of 32+ characters (validated at startup).
- AI booking drafts are signed with HMAC-SHA256 (20 min). Cookies are `Secure` in production.
- HSTS is sent in production (web and API).

### A03 Injection
- **SQL.** Prisma binds every parameter. The only raw SQL (two report queries) uses `Prisma.sql` tagged
  templates with the business id and time zone as bound parameters, and the date range is validated first.
  Tests send 8 classic payloads to search boxes, path parameters, slot queries and login: no 500, no leak,
  tables intact.
- **XSS.** React escapes by default; the emails escape every dynamic value (test: a customer named
  `<img src=x onerror=alert(1)>` arrives as `&lt;img ...`). JSON-LD escapes `<`. The CSV export neutralises
  `= + - @` at the start of a cell. Stored text is returned as JSON with `nosniff`.
- **Prompt injection** (AI): 14 attacks in ar, fr, en, a fake role message and a forged draft. The server
  enforces the guarantees even with an obedient model (AC-09).

### A04 Insecure design
- Zero double booking by a PostgreSQL exclusion constraint, not by application code (AC-02). With "any
  employee", a lost race falls back to the next free employee.
- A booking never comes from the model alone: it needs the customer's click on a signed draft (AC-05).
- Plan limits, monthly AI quota and a kill switch (`AI_ENABLED=false`) cap abuse and cost.

### A05 Security misconfiguration
- **API headers (helmet):** `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`,
  `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, no `X-Powered-By`, HSTS in production.
- **Web headers (`next.config.mjs`):** CSP (self + the API origin only, no framing, no objects),
  `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (camera,
  microphone, geolocation, payment off), `Cross-Origin-Opener-Policy`, HSTS in production.
- **CORS:** only `APP_URL`, with credentials.
- **Swagger `/docs`** is off in production unless `API_DOCS=true`.
- Cookies: `HttpOnly`, `SameSite=Lax`, `Secure` in production; the refresh cookie is only sent to `/auth`.
- Secrets are read from the environment and validated at startup; the web app only receives `API_URL` and
  `APP_URL`. `GROQ_API_KEY` never reaches the browser (AC-08, `key-security.spec.ts`).

### A06 Vulnerable and outdated components
`pnpm audit --prod` went from **59 findings (3 critical, 24 high)** to **2**:

| Action | Result |
|---|---|
| Next.js 14.2 → **15.5.29** (and React 19, next-intl 4) | removes the 3 critical and ~20 high/moderate findings (RCE, DoS, SSRF, cache poisoning) |
| `pnpm.overrides` for `multer`, `body-parser`, `qs`, `js-yaml`, `lodash`, `file-type`, `postcss` | removes the transitive findings of NestJS and Swagger |
| `shadcn` CLI moved to devDependencies | no longer counted as a production dependency |

**Accepted, with the reason:**
1. `@nestjs/core` (moderate, fixed in Nest 11): the flaw is in `@Sse()` streams. Mawid does not use `@Sse()`;
   the chat writes its own SSE and sets the event names itself. Upgrade to Nest 11 is planned.
2. `zod` (high, fixed in Zod 4): memory use on very large arrays that have no length limit. Every array in
   our schemas has a `.max(...)`, and the body size limit is 100 KB. Upgrade to Zod 4 is planned (breaking API).
3. Development tools only (`@nestjs/cli`, webpack, glob...) are not installed in the production image.

### A07 Identification and authentication failures
- Login, register, forgot/reset password: 5 requests per minute per IP. The same answer for an unknown and a
  known email (no user enumeration), and a dummy hash keeps the timing similar.
- Refresh tokens rotate; reusing an old one revokes the session family (tested).
- Password reset tokens: one hour, single use.

### A08 Software and data integrity
- Lockfile is committed and CI installs with `--frozen-lockfile`.
- **Uploads:** 2 MB maximum, one file, and the real type is detected from the first bytes (PNG, JPEG, WebP
  only). SVG, HTML, GIF and text files renamed `.png` are refused (`INVALID_IMAGE`); over 2 MB gives 413.
  File names are random UUIDs, so a name can never contain a path.

### A09 Logging and monitoring failures
- Structured JSON logs (pino) with `Authorization`, cookies and `Set-Cookie` redacted.
- Failed notifications are kept with a `FAILED` status and their last error, in an admin dead-letter list with a retry button (see `docs/OPERATIONS.md`). Errors (5xx) go to Sentry when a DSN is set, with cookies, bodies and personal data removed.

### A10 Server-side request forgery
- The API calls only Groq and Resend, with fixed hosts. No user-supplied URL is ever fetched.

## Rate limits

| Routes | Limit (per IP, per minute) |
|---|---|
| All routes | 120 |
| Login, register, forgot password, reset password | 5 |
| Public booking, cancel, reschedule, deposit proof, review | 10 |
| Public slots, business page reviews | 60 |
| Public AI chat, draft, confirm | 20 |

## Known limitations
- The web CSP keeps `'unsafe-inline'` for scripts: Next.js and the theme switch use small inline scripts.
  A nonce-based policy would make every page render on demand. Everything else in the policy is closed.
- Payment screenshots are stored with a random, unguessable name and are readable by anyone with the URL.
  Before production use, move them to private object storage with signed URLs.
- There is no CAPTCHA on public booking; the rate limit and the slot constraint limit abuse. A CAPTCHA can
  be added in front of `POST /public/bookings` if spam appears.
- The suspension flag is cached for 5 seconds per API instance.
