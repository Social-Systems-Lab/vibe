# ---- Base ----
FROM oven/bun:1.2.19-alpine AS base
WORKDIR /usr/src/app

# ---- PNPM ----
FROM base AS pnpm
RUN apk add --no-cache wget
RUN wget -qO- https://get.pnpm.io/install.sh | ENV="$HOME/.sh" SHELL="$(which sh)" sh -
ENV PATH="/root/.local/share/pnpm:$PATH"

# ---- Dependencies ----
FROM pnpm AS dependencies
RUN apk add --no-cache libc6-compat
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY apps/vibe-cloud-api/package.json ./apps/vibe-cloud-api/
COPY packages/vibe-sdk/package.json ./packages/vibe-sdk/
RUN pnpm install --prod --frozen-lockfile --verbose

# ---- Build ----
FROM pnpm AS build
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY apps/vibe-cloud-api/package.json ./apps/vibe-cloud-api/
COPY packages/vibe-sdk/package.json ./packages/vibe-sdk/
RUN pnpm install --frozen-lockfile --verbose
COPY . .
RUN pnpm --filter vibe-cloud-api... build

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
