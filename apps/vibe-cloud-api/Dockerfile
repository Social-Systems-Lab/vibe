# ---- Base ----
FROM oven/bun:1-alpine AS base
WORKDIR /usr/src/app

# ---- Dependencies ----
FROM base AS dependencies
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY apps/vibe-cloud-api/package.json ./apps/vibe-cloud-api/
COPY packages/vibe-sdk/package.json ./packages/vibe-sdk/
RUN pnpm install --prod --frozen-lockfile

# ---- Build ----
FROM base AS build
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm -r build

# ---- Production ----
FROM base AS production
RUN apk add --no-cache libc6-compat
ENV NODE_ENV=production
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/apps/vibe-cloud-api/dist ./dist
COPY --from=build /usr/src/app/apps/vibe-cloud-api/package.json .
COPY --from=build /usr/src/app/apps/vibe-cloud-api/public ./public

EXPOSE 5000
CMD [ "bun", "run", "dist/index.js" ]