# Mawid API image. Build from the REPOSITORY ROOT (the monorepo is needed):
#   docker build -f apps/api/Dockerfile -t mawid-api .
#
# Stage 1 installs and builds everything, stage 2 keeps only what runs in production:
# compiled code, production dependencies, the Prisma client and the migrations.

# ---- build ----
FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* && corepack enable && corepack prepare pnpm@8.15.9 --activate
WORKDIR /repo

# Dependency manifests first: this layer is cached until a dependency changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# The lockfile lists every workspace package: the web manifest must exist, its code is not needed.
COPY apps/web/package.json apps/web/
# The root postinstall builds the shared package, which is not copied yet: skip it here.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter api...

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @mawid/shared build \
    && pnpm --filter api exec prisma generate \
    && pnpm --filter api build
# A self-contained copy of the API with production dependencies only (the shared package is built inside it).
RUN pnpm --filter api deploy --prod /out \
    && cp -r apps/api/dist /out/dist \
    && cp -r apps/api/prisma /out/prisma

# ---- runtime ----
FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=4000 UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY --from=build /out /app
# The Prisma client is generated for this exact system (it is not part of the lockfile install).
RUN node_modules/.bin/prisma generate \
    && mkdir -p /data/uploads && chown -R node:node /app /data
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER node
VOLUME ["/data/uploads"]
EXPOSE 4000

# Liveness only (no database call): a Redis or database outage must not restart the container in a loop.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini forwards SIGTERM to Node, so the API shuts down gracefully on every deploy.
ENTRYPOINT ["/usr/bin/tini", "--", "docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
