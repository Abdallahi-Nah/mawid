# Mawid

Multi-tenant online booking web app for small service businesses (salons, clinics, garages,
restaurants) with an AI booking assistant (Groq). Languages: Arabic (RTL), French, English.
Full requirements: `docs/SRS.md` (IDs: FR-xx, NFR-xx, AI-xx, AC-xx).

## Stack
- Monorepo: pnpm workspaces
- `apps/web`: Next.js 14 (App Router), TypeScript strict, Tailwind CSS, shadcn/ui
- `apps/api`: NestJS 10, TypeScript strict, Prisma, PostgreSQL 16, Redis 7
- `packages/shared`: Zod schemas and types shared by web and api (built to `dist/`)

## Structure
```
apps/web/          Next.js app (lib/env.ts validates env)
apps/api/src/      main.ts, app.module.ts, config/, common/, health/, prisma/
apps/api/prisma/   schema.prisma + migrations
packages/shared/   shared Zod schemas
docker-compose.yml PostgreSQL (host port 5434) + Redis (6379)
```

## Commands
- Install: `pnpm install` (also builds `packages/shared`)
- Services: `docker compose up -d`
- Dev: `pnpm dev` (web :3000, api :4000)
- Lint / types / tests / build: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
- Migrations: `pnpm --filter api prisma:migrate`
- Browser checks (need API + web running): `node apps/web/scripts/flow-check.mjs` (real flow), `node apps/web/scripts/booking-e2e.mjs` (booking ar+fr at 360 px, owner calendar), `node apps/web/scripts/ai-e2e.mjs` (AI chat ar+fr, fallback, owner AI tools; needs the API started with `node apps/api/dist/dev/e2e-server.js`, a scripted model, no Groq key), `node apps/web/scripts/phase5-e2e.mjs` (dashboard numbers, CSV, deposit, reviews, QR, plan limit, admin; builds its own data; API on :4010 and web on :3100 by default), `bash scripts/backup-db.sh` (daily PostgreSQL backup, 14 days; restore with `scripts/restore-db.sh`, see docs/OPERATIONS.md), `node apps/web/scripts/a11y.mjs` (axe, WCAG 2.1 A/AA on every page, ar/fr/en, light and dark: must report 0 serious or critical), `node apps/web/scripts/a11y-keyboard.mjs` (skip link, Tab order, focus ring, dialog focus trap, booking by keyboard), `node apps/web/scripts/perf.mjs` (LCP on Fast 4G and Slow 4G, target under 2 s), `node apps/web/scripts/screenshots.mjs` (screens at 360/768/1280 px, ar and fr)
- AI with a real key (optional): `LIVE_GROQ=1 pnpm --filter api exec jest src/ai/ai-live`; kill switch `AI_ENABLED=false`; replay scenarios in `docs/ai-conversations.md`
- Demo data: `pnpm --filter api db:seed` (password for all demo accounts: `Demo1234!`)
- API docs: http://localhost:4000/docs, health: http://localhost:4000/health

## RULES (apply to every phase)
- Read docs/SRS.md before each task. Do not invent requirements. If something is unclear or missing, ask.
- TypeScript strict. No 'any'. Validate every input with Zod (API and forms).
- Multi-tenant: every business table has business_id. Every query must be filtered by business_id. A business must never read another business's data.
- Dates and times are stored in UTC and displayed in the business timezone.
- All user-facing text goes through next-intl with ar, fr and en files. Never hardcode UI strings.
- RTL: use Tailwind logical utilities (ms-, me-, ps-, pe-, text-start, text-end), never left/right for layout. Test every screen in ar (RTL) and fr.
- Never expose GROQ_API_KEY or any secret to the browser. Never commit secrets.
- Mobile first: design for 360 px width first.
- Write tests for business logic. Run lint, typecheck and tests before saying a task is done.
- Small, focused commits with clear messages. Do not add a new dependency without telling why.
- Definition of done: it works, tests pass, lint and typecheck are clean, README or docs updated if needed.

## Quality checks (phase 5)
- Lighthouse (mobile) on the public page: `CHROME_PATH=/usr/bin/google-chrome npx lighthouse@12 http://localhost:3100/fr/b/salon-nour --only-categories=performance,accessibility,best-practices,seo` (accessibility 100, SEO 100).
- Arabic font is self-hosted in `apps/web/public/fonts` and preloaded on Arabic pages only; OG image fonts are in `apps/web/assets/fonts`.
- SEO: `app/sitemap.ts`, `app/robots.ts`, JSON-LD and hreflang in `app/[locale]/b/[slug]/page.tsx`, OG image in `opengraph-image.tsx`.
