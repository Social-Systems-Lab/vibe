# /apps/vibe-cloud/Dockerfile

# ---- Base ----
FROM oven/bun:1 AS base
WORKDIR /app
# Install pnpm globally using bun
RUN bun add --global pnpm@10.8.0

# ---- Pruner ----
# Use a slim image instead of Alpine
FROM node:20-slim AS pruner
WORKDIR /app
# Install build dependencies: pnpm, turbo
RUN apt-get update && apt-get install -y --no-install-recommends && \
    npm install -g pnpm@10.8.0 turbo@latest && \
    rm -rf /var/lib/apt/lists/*
# Copy the entire monorepo context
COPY . .
# Generate the pruned subset
RUN turbo prune --scope=vibe-cloud --docker

# ---- Installer & Builder ----  # <-- COMBINED STAGE
FROM base AS installer_builder
WORKDIR /app

# Copy pruned package manager files first
COPY --from=pruner /app/out/json/pnpm-lock.yaml ./
COPY --from=pruner /app/out/json/package.json ./
COPY --from=pruner /app/out/pnpm-workspace.yaml ./

# Install ALL dependencies (including dev needed for build)
# This creates /app/node_modules
# Copy pruned source code BEFORE install
COPY --from=pruner /app/out/full/ .

# Install ALL dependencies (including dev needed for build)
# Now pnpm sees the actual package.json files within apps/ and packages/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod=false

# Build the application immediately after install and source copy
# This runs 'tsc' within the context of /app/apps/vibe-cloud
# It should find /app/node_modules correctly now.
RUN pnpm --filter vibe-cloud build

# ---- Runner ----
# Create the final minimal image
FROM base AS runner
WORKDIR /app

# Copy necessary package manager files from the pruner stage for prod install
COPY --from=pruner /app/out/json/pnpm-lock.yaml ./
COPY --from=pruner /app/out/json/package.json ./
COPY --from=pruner /app/out/pnpm-workspace.yaml ./

# Copy the specific package.json for runtime reference
# Path is relative to the WORKDIR (/app) in the installer_builder stage
COPY --from=installer_builder /app/apps/vibe-cloud/package.json ./apps/vibe-cloud/package.json
# Copy workspace dependency package.json if needed
COPY --from=installer_builder /app/packages/shared-types/package.json ./packages/shared-types/package.json

# Install ONLY production dependencies using the pruned lockfile
# This creates a clean /app/node_modules for the final image
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

# Copy the built application code from the installer_builder stage
# Path is relative to the WORKDIR (/app) in the installer_builder stage
COPY --from=installer_builder /app/apps/vibe-cloud/dist ./apps/vibe-cloud/dist
# Copy built workspace dependencies if needed at runtime (assuming shared-types might build eventually)
# COPY --from=installer_builder /app/packages/shared-types/dist ./packages/shared-types/dist

# Expose the port the app runs on
EXPOSE 3000

# Define the command to run the built app
CMD ["bun", "run", "apps/vibe-cloud/dist/index.js"]
