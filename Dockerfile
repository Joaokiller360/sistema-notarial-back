# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (cache layer)
COPY package*.json ./
COPY prisma ./prisma/

RUN apk add --no-cache openssl && \
    npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source and build
COPY . .
RUN npm run build

# ─── Stage 2: Production ─────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nestjs -u 1001 -G nodejs

# Install only production deps
COPY package*.json ./
COPY prisma ./prisma/

RUN apk add --no-cache openssl && \
    npm ci --only=production && \
    npx prisma generate && \
    npm cache clean --force

# Copy built app
COPY --from=builder /app/dist ./dist

# Create directories and set permissions
RUN mkdir -p uploads logs && \
    chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/src/main"]
