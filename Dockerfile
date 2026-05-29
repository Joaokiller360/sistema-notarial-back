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

# Explicit port — must match PORT env var
EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8001/api/v1/health/live || exit 1

CMD ["node", "dist/src/main"]
