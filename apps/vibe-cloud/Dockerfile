# /apps/vibe-cloud/Dockerfile

# ---- Base ----
# Use the official Bun image as the base
FROM oven/bun:1 AS base
WORKDIR /app

# ---- Builder ----
# This stage installs all dependencies and builds the application
FROM base AS builder
WORKDIR /app

# Install dependencies first to leverage Docker cache layers
# Copy root configuration and lockfile
COPY package.json bun.lock ./
COPY tsconfig.base.json ./

# Copy package.json files for all workspaces needed for the build
# This ensures bun install can resolve the workspace structure
COPY apps/vibe-cloud/package.json ./apps/vibe-cloud/
COPY packages/shared-types/package.json ./packages/shared-types/
# Add any other workspace package.json files if vibe-cloud depends on them

# Install ALL dependencies (including dev dependencies needed for build)
# Use bun's cache directory for efficiency
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# Copy the rest of the source code needed for the build
# Copying the entire context might be simpler if filtering is complex
COPY . .

# Build the specific application (vibe-cloud)
# This command should generate the distributable files (e.g., in ./apps/vibe-cloud/dist)
RUN bun run --filter vibe-cloud build

# ---- Runner ----
# This stage creates the final, minimal image with only production dependencies
FROM base AS runner
WORKDIR /app

# Copy necessary package manager files for production install
COPY package.json bun.lock ./
COPY apps/vibe-cloud/package.json ./apps/vibe-cloud/
COPY packages/shared-types/package.json ./packages/shared-types/
# Add any other workspace package.json files if needed for runtime dependencies

# Install ONLY production dependencies
# This requires the package.json files copied above to resolve dependencies
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production

# Copy the built application code from the builder stage
# Adjust the source path if your build process outputs elsewhere
COPY --from=builder /app/apps/vibe-cloud/dist ./apps/vibe-cloud/dist

# Copy any other necessary built assets or runtime dependencies from packages
# e.g., COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist

# Expose the port the application runs on
EXPOSE 3000

# Define the command to run the built application
# Ensure this path matches the output of your build process
CMD ["bun", "apps/vibe-cloud/dist/index.js"]
