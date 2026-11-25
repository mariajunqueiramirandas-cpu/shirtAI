# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# Stage 1: Install workspace dependencies (Debian glibc for sharp + bun:sqlite)
# ---------------------------------------------------------------------------
FROM oven/bun:1.2-debian AS deps
WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN bun install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 2: Build React + Vite production SPA bundle
# ---------------------------------------------------------------------------
FROM deps AS builder
WORKDIR /app

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

RUN bun --cwd apps/web build

# ---------------------------------------------------------------------------
# Stage 3: Lean non-root production runtime (Bun + Hono serves API + SSE + SPA)
# ---------------------------------------------------------------------------
FROM oven/bun:1.2-debian AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787
ENV STORAGE_DIR=/app/data/storage
ENV DATABASE_PATH=/app/data/shirtai.sqlite
ENV WEB_DIST_DIR=/app/apps/web/dist

COPY --from=deps /app/package.json /app/bun.lock /app/tsconfig.base.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=deps /app/apps/api/package.json ./apps/api/package.json

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Ensure persistent mount directory exists and is writable by non-root bun user
# (Only chown /app/data to avoid overlayfs copy-up across node_modules)
RUN mkdir -p /app/data/storage && chown -R bun:bun /app/data

USER bun

EXPOSE 8787

# Bun-native healthcheck (zero curl dependency; ensures Dokploy Traefik routes reliably)
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "const r = await fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/health'); if (!r.ok) process.exit(1);"

CMD ["bun", "apps/api/src/index.ts"]
