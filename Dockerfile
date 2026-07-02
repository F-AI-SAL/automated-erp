# ── deps ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── build ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Dummy build-time env so env validation + `next build` succeed (real values at runtime).
ENV DATABASE_URL=postgresql://user:pass@localhost:5432/db \
    JWT_SECRET=build-time-only-secret \
    JWT_REFRESH_SECRET=build-time-only-secret
RUN npm run build

# ── runner ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000
# Next.js standalone output (lean) + static assets.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# Migrations + scripts + full deps so `db:migrate` / worker can run in the same image.
COPY --from=build /app/db ./db
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=deps /app/node_modules ./node_modules
EXPOSE 3000
# The web app (serves /api/telegram/webhook). Override CMD for the dispatcher worker.
CMD ["node", "server.js"]
