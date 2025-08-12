# 1. Base Stage: Modern Node.js and pnpm via corepack
FROM node:18-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN apk add --no-cache libc6-compat
# Enable pnpm
RUN corepack enable

# 2. Builder Stage: Build the application and its dependencies
FROM base AS builder
WORKDIR /app
# Copy only the necessary package manifests to leverage caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/vibe-cloud-ui/package.json apps/vibe-cloud-ui/
COPY packages/vibe-core/package.json packages/vibe-core/
COPY packages/vibe-sdk/package.json packages/vibe-sdk/
COPY packages/vibe-react/package.json packages/vibe-react/

# Install all dependencies (dev included) to build the app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy the full source code
COPY . .

# Build the target application
RUN pnpm --filter "vibe-cloud-ui" build

# 3. Production Dependencies Stage: Create a clean, flattened node_modules
FROM builder AS prod-deps
WORKDIR /app
# Use pnpm deploy to create a production-only node_modules
RUN pnpm deploy --prod --legacy --filter "vibe-cloud-ui" /prod-deps

# 4. Runner Stage: The final, minimal production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the standalone output from the builder
COPY --from=builder --chown=nextjs:nodejs /app/apps/vibe-cloud-ui/.next/standalone/apps/vibe-cloud-ui ./

# Copy the clean, production-only node_modules from the prod-deps stage
COPY --from=prod-deps --chown=nextjs:nodejs /prod-deps/node_modules ./node_modules

# Copy static and public assets
COPY --from=builder --chown=nextjs:nodejs /app/apps/vibe-cloud-ui/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/vibe-cloud-ui/publi[c] ./public

USER nextjs
EXPOSE 4000
CMD ["node", "server.js"]
