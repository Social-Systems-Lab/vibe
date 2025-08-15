# 1. Base Stage
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN apk add --no-cache libc6-compat
RUN corepack enable

# 2. Builder Stage
FROM base AS builder
WORKDIR /app

# Make NEXT_* available at build time if you pass them as --build-arg
ARG NEXT_PUBLIC_APP_VERSION
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION

# Copy manifests for ALL workspace packages the build needs
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/vibe-cloud-ui/package.json apps/vibe-cloud-ui/
COPY apps/vibe-cloud-api/package.json apps/vibe-cloud-api/
COPY packages/vibe-core/package.json packages/vibe-core/
COPY packages/vibe-sdk/package.json packages/vibe-sdk/
COPY packages/vibe-react/package.json packages/vibe-react/

# Install deps + allow native postinstalls to run
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile && pnpm rebuild -r

# Bring in sources
COPY . .

# Build order matters: build API first so its d.ts exists, then SDK, then the rest
RUN pnpm --filter "vibe-cloud-api" build \
 && pnpm --filter "vibe-core" build \
 && pnpm --filter "vibe-sdk" build \
 && pnpm --filter "vibe-react" build \
 && pnpm --filter "vibe-cloud-ui" build

# 3. Production deps
FROM builder AS prod-deps
WORKDIR /app
RUN pnpm deploy --prod --legacy --filter "vibe-cloud-ui" /prod-deps

# 4. Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=4000

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder   --chown=nextjs:nodejs /app/apps/vibe-cloud-ui/.next/standalone/apps/vibe-cloud-ui ./
COPY --from=prod-deps --chown=nextjs:nodejs /prod-deps/node_modules ./node_modules
COPY --from=builder   --chown=nextjs:nodejs /app/apps/vibe-cloud-ui/.next/static ./.next/static
COPY --from=builder   --chown=nextjs:nodejs /app/apps/vibe-cloud-ui/public ./public

USER nextjs
EXPOSE 4000
CMD ["node", "server.js"]
