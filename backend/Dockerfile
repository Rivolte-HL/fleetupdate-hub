# ==============================================================================
# Stage 1: Build & TypeScript Compilation
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk --no-cache add openssl

# Install build dependencies
COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY tsconfig.json ./
COPY src ./src/

# Generate Prisma Client & Build TypeScript
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

# ==============================================================================
# Stage 2: Production Runtime
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install security updates & tools for healthcheck
RUN apk --no-cache add openssl openssh-client wget ca-certificates \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -S -g 1001 fleetgroup && \
    adduser -S -u 1001 -G fleetgroup fleetuser

COPY package*.json ./
COPY prisma ./prisma/
COPY docker-entrypoint.sh ./

# Copy prebuilt dependencies and application from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Create keys folder and set permissions
RUN mkdir -p /app/keys && chmod +x /app/docker-entrypoint.sh && chown -R fleetuser:fleetgroup /app

USER fleetuser

EXPOSE 5000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
