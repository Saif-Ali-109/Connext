FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json .npmrc ./
COPY apps/server/package.json ./apps/server/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
RUN npm ci

# Build @connext/db first, then the server
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build --workspace=@connext/db
RUN npm run build --workspace=@connext/server

# Production runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/package.json
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/package.json ./package.json

EXPOSE 5000

CMD ["npm", "run", "start", "--workspace=@connext/server"]
