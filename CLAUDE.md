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
