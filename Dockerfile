FROM node:24.12.0-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY vendor ./vendor

RUN npm ci --ignore-scripts

FROM deps AS build

COPY . .

RUN npm run build

FROM node:24.12.0-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5000

COPY package.json package-lock.json ./
COPY vendor ./vendor

RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force \
  && mkdir -p uploads output artifacts var/dev-mail-outbox var/perf scripts

COPY --from=build /app/dist-local ./dist-local
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/db-migrate.mjs ./scripts/db-migrate.mjs

RUN chown -R node:node /app

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch(`http://127.0.0.1:${process.env.PORT || 5000}/api/health/live`).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist-local/server/cluster-local.js"]
