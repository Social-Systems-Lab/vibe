# 1. Base image for all stages
FROM node:18-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /repo

# 2. Install pnpm
FROM base as pnpm-base
RUN npm i -g pnpm

# 3. Install dependencies
FROM pnpm-base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/vibe-cloud-ui/package.json ./apps/vibe-cloud-ui/
COPY packages/vibe-core/package.json ./packages/vibe-core/
COPY packages/vibe-sdk/package.json ./packages/vibe-sdk/
COPY packages/vibe-react/package.json ./packages/vibe-react/
RUN pnpm install --frozen-lockfile

# 4. Build the application
# This stage receives the version number to bake it into the client code
FROM pnpm-base AS builder
ARG NEXT_PUBLIC_APP_VERSION
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN pnpm -w --filter "vibe-core..." build || true
RUN pnpm -w --filter "vibe-sdk..." build || true
RUN pnpm -w --filter "vibe-react..." build || true
RUN pnpm --filter "vibe-cloud-ui" build

# 5. Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ARG NEXT_PUBLIC_APP_VERSION
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the standalone output
COPY --from=builder --chown=nextjs:nodejs /repo/apps/vibe-cloud-ui/.next/standalone ./

# Copy the static assets
COPY --from=builder --chown=nextjs:nodejs /repo/apps/vibe-cloud-ui/.next/static ./.next/static

# Copy the public assets
COPY --from=builder --chown=nextjs:nodejs /repo/apps/vibe-cloud-ui/public ./public

USER nextjs
EXPOSE 4000
CMD ["node", "server.js"]