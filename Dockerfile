# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN apk add --no-cache openssl && \
    npm ci

RUN npx prisma generate

COPY . .
RUN npm run build

# ─── Stage 2: Production ─────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user — never run as root
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nestjs -u 1001 -G nodejs

# Install production deps only
COPY package*.json ./
COPY prisma ./prisma/

RUN apk add --no-cache openssl && \
    npm ci --only=production && \
    npx prisma generate && \
    npm cache clean --force && \
    # Remove npm from final image to reduce attack surface
    rm -rf /usr/local/lib/node_modules/npm

COPY --from=builder /app/dist ./dist

# Create app directories with correct ownership
RUN mkdir -p uploads logs && \
    chown -R nestjs:nodejs /app && \
    # uploads and logs must be writable; dist and node_modules are read-only
    chmod 755 uploads logs

USER nestjs

# Default internal container port. Dokploy/docker-compose maps an external port to this.
# Override via PORT env var — NestJS reads it in app.config.ts.
ENV PORT=8000
EXPOSE 8000

# Healthcheck reads PORT at runtime so it tracks whatever NestJS actually binds.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider "http://localhost:${PORT:-8000}/api/v1/health/live" || exit 1

CMD ["node", "dist/src/main"]
