FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json .npmrc ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
RUN npm ci

# Build @connext/db first, then the web app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars are inlined into the client bundle at BUILD time, not read
# at runtime. Railway passes matching service variables in as build args, so the
# real backend URL gets baked in. Without this the client falls back to
# `<frontend-host>:4001` and every API call hangs after login.
ARG NEXT_PUBLIC_SERVER_URL
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL

RUN npm run build --workspace=@connext/db
RUN npm run build --workspace=connext-web

# Production runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built Next.js app
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
