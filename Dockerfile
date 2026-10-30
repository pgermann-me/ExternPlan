# syntax=docker/dockerfile:1
FROM node:24.22.1-bookworm-slim
# Rebuild without cache to refresh Debian security updates and CA certificates.
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=cloud_ca \
    if [ -f /run/secrets/cloud_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/cloud_ca; fi; \
    npm ci --omit=dev --fetch-retries=0 --fetch-timeout=30000 && npm cache clean --force
COPY --chown=node:node server.js reverse-geocoding.js function-region-migration.js hunter-recovery.js region-recovery.js wildhut-geo-migration.js always-planning.js continuous-migration.js els-projection.js standing-duties.js people-bulk.js hunter-import.js region-bulk.js geojson-import.js access-scope.js accounts.js request-context.js planning-undo.js assignment-copy.js assignment-transfer.js domain.js people.js person-planning.js master-data.js favorites.js timeline.js data-cleanup.js ./
COPY --chown=node:node adapters ./adapters
COPY --chown=node:node public ./public
COPY --chown=node:node map-data ./map-data
RUN mkdir -p /app/data && chown node:node /app/data
COPY docker-entrypoint.sh /usr/local/bin/externplan-entrypoint
RUN chmod 755 /usr/local/bin/externplan-entrypoint
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["externplan-entrypoint"]
