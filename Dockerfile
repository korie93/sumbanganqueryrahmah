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

ARG BUILD_DATE=unknown
ARG VCS_REF=unknown

LABEL org.opencontainers.image.title="Sumbangan Query Rahmah" \
  org.opencontainers.image.description="Production image for the SQR application runtime" \
  org.opencontainers.image.url="https://github.com/openai/sumbanganqueryrahmah" \
  org.opencontainers.image.source="https://github.com/openai/sumbanganqueryrahmah" \
  org.opencontainers.image.revision=$VCS_REF \
  org.opencontainers.image.created=$BUILD_DATE

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
  CMD node -e "const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 4000); timeout.unref?.(); fetch(`http://127.0.0.1:${process.env.PORT || 5000}/api/health/live`, { signal: controller.signal }).then((response) => { clearTimeout(timeout); process.exit(response.ok ? 0 : 1); }).catch(() => { clearTimeout(timeout); process.exit(1); })"

CMD ["node", "dist-local/server/cluster-local.js"]
