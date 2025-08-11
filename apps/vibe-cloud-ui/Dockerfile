ARG NEXT_PUBLIC_APP_VERSION

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

# ---- Runtime image ----
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=4000
ARG NEXT_PUBLIC_APP_VERSION
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=build /repo/apps/vibe-cloud-ui/public ./public
COPY --from=build --chown=nextjs:nodejs /repo/apps/vibe-cloud-ui/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/vibe-cloud-ui/.next/static ./.next/static

USER nextjs
EXPOSE 4000
CMD ["node", "apps/vibe-cloud-ui/server.js"]