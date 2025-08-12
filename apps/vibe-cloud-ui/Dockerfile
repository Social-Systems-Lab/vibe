# 1. Base image for all stages
FROM node:18-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /repo

# 2. Install pnpm
FROM base as pnpm-base
RUN npm i -g pnpm

# 3. Build the application
FROM pnpm-base AS builder
ARG NEXT_PUBLIC_APP_VERSION
WORKDIR /repo

# Copy package manager files and workspace package.json files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/vibe-cloud-ui/package.json ./apps/vibe-cloud-ui/
COPY packages/vibe-core/package.json ./packages/vibe-core/
COPY packages/vibe-sdk/package.json ./packages/vibe-sdk/
COPY packages/vibe-react/package.json ./packages/vibe-react/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the source code
COPY . .

# Build dependencies and the final application
RUN pnpm -w --filter "vibe-core..." build || true
RUN pnpm -w --filter "vibe-sdk..." build || true
RUN pnpm -w --filter "vibe-react..." build || true
RUN pnpm --filter "vibe-cloud-ui" build

# 4. Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ARG NEXT_PUBLIC_APP_VERSION
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the standalone output from the builder stage
COPY --from=builder --chown=nextjs:nodejs /repo/apps/vibe-cloud-ui/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/vibe-cloud-ui/.next/static ./.next/static

USER nextjs
EXPOSE 4000
CMD ["node", "apps/vibe-cloud-ui/server.js"]