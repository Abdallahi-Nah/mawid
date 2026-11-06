# Changelog

All notable changes to Mawid. Format: [Keep a Changelog](https://keepachangelog.com/), versions: [SemVer](https://semver.org/).

## [Unreleased]

### Added

- Test deployment without a domain: the web app can relay the API under `/backend` (`API_PROXY_TARGET`, `PUBLIC_API_URL`), with `COOKIE_PATH_PREFIX` for the refresh cookie. Off by default. See `docs/DEPLOY.md` section 0b.

## [1.0.0] - 2026-11-05

First complete release.

### Booking

- Public page of every business (services, team, opening hours, reviews) and a booking flow made for a phone
  (360 px): service, employee or "anyone", day, time, details. A customer books without an account in a few seconds.
- Availability engine: working hours, breaks, days off, minimum notice, maximum days ahead, preparation time
  (buffer) after each appointment, business time zone.
- **No double booking**: the database itself refuses two overlapping appointments of one employee
  (PostgreSQL exclusion constraint). With "any employee", a lost race falls back to the next free employee.
- Cancel or reschedule with a secret link in the email, until the business limit. Calendar files (.ics, Google).
- Automatic or manual confirmation. Optional **deposit** per service: the customer sends the mobile payment
  reference or a screenshot, the owner validates or rejects; a `PaymentProvider` interface is ready for Bankily,
  Masrvi or Stripe.

### AI assistant (Groq)

- Chat on the public page, in Arabic, French and English: finds real free slots, prepares a draft, and books only
  after the customer's click on a signed draft. Falls back to the normal form when the AI is down.
- Prompt-injection protections tested with 14 attacks; kill switch; monthly quota per plan.
- "Write with AI" for messages and descriptions, and review analysis for the owner.

### Owner dashboard

- Real numbers and charts (bookings per day, top services, peak hours, cancellation and no-show rates, revenue),
  CSV export, calendar with drag and drop, customers, notifications bell.
- Reviews: email with a secret link after the visit, public page with the average, owner replies.
- QR code and share link, plan card with limits (Free, Pro, Business).

### Administration

- List, search, suspend and change the plan of businesses; global statistics; AI usage and estimated cost per
  business; dead-letter list of failed emails with a retry button.

### Platform

- Multi-tenant isolation enforced in one place (tenant-scoped database client) and tested on every route.
- Arabic (RTL), French and English everywhere, including emails.
- Accessibility: WCAG 2.1 AA checked with axe on every page (0 serious problem), keyboard navigation tested,
  Lighthouse accessibility 100.
- Performance: public page LCP 0.6 s on Fast 4G and 1.6 s on Slow 4G (CPU 4x slower).
- SEO: metadata, hreflang, sitemap, robots, JSON-LD, OpenGraph image per business.

### Security and operations

- Reviewed against the OWASP Top 10 (`docs/SECURITY.md`): every route guarded or explicitly public (automatic test),
  CSRF check, CSP and security headers, strict cookies, rate limits, upload checks, dependency audit
  (59 findings down to 2, both explained), secret scan of the whole git history.
- Structured logs with request ids, liveness and readiness checks, graceful shutdown, email retries and
  dead-letter list, Sentry (off until configured), daily database backup with 14-day retention and a tested restore
  (`docs/OPERATIONS.md`).
- Dockerfile, production `docker-compose`, deployment guide for Vercel + Railway / Render / a VPS
  (`docs/DEPLOY.md`), demo data script, OpenAPI export (`docs/openapi.json`).
- Next.js 15 and React 19.

### Known limitations

See the end of the README ("Limitations").

## Phases before 1.0.0

- Phase 0: monorepo, CI, base API and web.
- Phase 1: design system, public page and dashboard mock-ups.
- Phase 2: accounts, businesses, services, employees, hours, time off.
- Phase 3: availability engine, bookings, customers, notifications, reminders.
- Phase 4: AI gateway, booking assistant, owner AI tools.
- Phase 5: reports, reviews, deposits, plans, admin, SEO, accessibility, performance.
- Phase 6: acceptance check, security, reliability, deployment, documentation.
