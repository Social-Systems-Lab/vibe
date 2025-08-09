# ---- Base builder ----
FROM node:18-alpine AS base
WORKDIR /repo
RUN apk add --no-cache libc6-compat
# pnpm
RUN npm i -g pnpm

# ---- Dependencies (workspace) ----
FROM base AS deps
# copy workspace manifests to leverage pnpm lock and workspaces
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# app manifest
COPY apps/vibe-cloud-ui/package.json ./apps/vibe-cloud-ui/package.json
# packages manifests used at build-time
COPY packages/vibe-core/package.json ./packages/vibe-core/package.json
COPY packages/vibe-sdk/package.json ./packages/vibe-sdk/package.json
COPY packages/vibe-react/package.json ./packages/vibe-react/package.json
# install with frozen lockfile to ensure reproducibility
RUN pnpm install --frozen-lockfile

# ---- Build (workspace) ----
FROM deps AS build
# copy source needed for building packages and the UI
COPY packages ./packages
COPY apps/vibe-cloud-ui ./apps/vibe-cloud-ui

# Ensure workspace links are created for the UI app after sources are present
# This guarantees that workspace deps like "vibe-react" resolve during Next build
RUN pnpm install --filter "./apps/vibe-cloud-ui..." --frozen-lockfile

# UI build
WORKDIR /repo/apps/vibe-cloud-ui
# build dependent packages first to be explicit (ok if no-op)
RUN pnpm -w --filter "vibe-core..." build || true
RUN pnpm -w --filter "vibe-sdk..." build || true
RUN pnpm -w --filter "vibe-react..." build || true
RUN pnpm build

# Next.js standalone output places server files in .next/standalone and static in .next/static
# ---- Runtime image ----
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Copy production build artifacts (non-standalone)
COPY --from=build /repo/apps/vibe-cloud-ui/.next ./.next
COPY --from=build /repo/apps/vibe-cloud-ui/public ./public
COPY --from=build /repo/apps/vibe-cloud-ui/package.json ./package.json

EXPOSE 4000
# Start Next.js using standard production build
CMD [ "npx", "next", "start", "-p", "4000" ]