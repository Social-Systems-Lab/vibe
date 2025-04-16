# /apps/vibe-cloud/Dockerfile

# ---- Base ----
# Use the official Bun image
FROM oven/bun:1 AS base
WORKDIR /app

# ---- Dependencies ----
# Install all dependencies including devDependencies
FROM base AS deps
WORKDIR /app

# Copy root package config
COPY package.json bun.lock ./

# Copy package.json files for all workspaces
# Bun needs these to resolve the workspace structure during install
COPY apps/vibe-cloud/package.json ./apps/vibe-cloud/
COPY apps/test-app/package.json ./apps/test-app/
COPY apps/vibe-agent/package.json ./apps/vibe-agent/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/vibe-react/package.json ./packages/vibe-react/
COPY packages/vibe-sdk/package.json ./packages/vibe-sdk/
# Add any other workspaces if they exist

# Install all dependencies
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# ---- Builder ----
# Build the application
FROM base AS builder
WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy the entire source code
COPY . .

# Build the specific application (vibe-cloud)
# Ensure tsconfig paths are resolved correctly if needed
RUN bun run --filter vibe-cloud build

# ---- Runner ----
# Create the final minimal image with only production dependencies
FROM base AS runner
WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Copy root package config
COPY package.json bun.lock ./

# Copy package.json files for all workspaces again for prod install
COPY apps/vibe-cloud/package.json ./apps/vibe-cloud/
COPY apps/test-app/package.json ./apps/test-app/
COPY apps/vibe-agent/package.json ./apps/vibe-agent/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/vibe-react/package.json ./packages/vibe-react/
COPY packages/vibe-sdk/package.json ./packages/vibe-sdk/
# Add any other workspaces if they exist

# Install ONLY production dependencies
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production

# Copy the built application code from the builder stage
COPY --from=builder /app/apps/vibe-cloud/dist ./apps/vibe-cloud/dist

# Copy production node_modules (potentially smaller)
# This might be redundant if the install above works correctly,
# but follows the pattern from the docs example more closely.
# Consider removing if the image size is acceptable without it.
# COPY --from=deps /app/node_modules ./node_modules

# Expose the port the application runs on
EXPOSE 3000

# Define the command to run the built application
# Ensure this path matches the output of your build process
# Using the relative path from WORKDIR
CMD ["bun", "./apps/vibe-cloud/dist/index.js"]
