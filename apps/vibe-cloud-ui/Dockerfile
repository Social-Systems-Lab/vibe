# 1. Base Stage: use Node 20 to satisfy engines >=20 <22
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN apk add --no-cache libc6-compat
RUN corepack enable

# 2. Builder
FROM base AS builder
WORKDIR /app

# Leverage caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/vibe-cloud-ui/package.json apps/vibe-cloud-ui/
COPY packages/vibe-core/package.json packages/vibe-core/
COPY packages/vibe-sdk/package.json packages/vibe-sdk/
COPY packages/vibe-react/package.json packages/vibe-react/

# Install deps (dev included). No interactive approve-builds in CI.
# Make sure you've configured onlyBuiltDependencies or dangerouslyAllowAllBuilds in pnpm-workspace.yaml
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile && pnpm rebuild -r

# Copy the source
COPY . .

# Build workspace packages first
RUN pnpm --filter "vibe-core" build \
 && pnpm --filter "vibe-sdk" build \
 && pnpm --filter "vibe-react" build

# Build the target app
RUN pnpm --filter "vibe-cloud-ui" build

# 3. Production Dependencies
FROM builder AS prod-deps
WORKDIR /app
RUN pnpm deploy --prod --legacy --filter "vibe-cloud-ui" /prod-deps

# 4. Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=4000

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Copy the Next.js standalone server output
COPY --from=builder --chown=nextjs:nodejs /app/apps/vibe-cloud-ui/.next/standalone/apps/vibe-cloud-ui ./

# Copy prod node_modules
COPY --from=prod-deps --chown=nextjs:nodejs /prod-deps/node_modules ./node_modules

# Static assets
COPY --from=builder --chown=nextjs:nodejs /app/apps/vibe-cloud-ui/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/vibe-cloud-ui/public ./public

USER nextjs
EXPOSE 4000
CMD ["node", "server.js"]
