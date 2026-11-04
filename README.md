# mawid

Multi-tenant online booking platform for service businesses, with an AI booking assistant powered by Groq. Next.js, NestJS, PostgreSQL. Arabic (RTL), French and English.

Requirements: `docs/SRS.md`. Project rules: `CLAUDE.md`.

## Local setup

Prerequisites: Node 20+, pnpm 8, Docker.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env          # fill in secrets
cp apps/web/.env.example apps/web/.env.local
docker compose up -d                            # PostgreSQL (port 5434) + Redis
pnpm --filter api prisma:migrate                # apply migrations
pnpm dev                                        # web :3000, api :4000
```

- API health: http://localhost:4000/health
- Swagger: http://localhost:4000/docs

If port 3000, 5434 or 6379 is already used on your machine, change it in
`docker-compose.yml` / `.env` files.

## Scripts

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm format`
