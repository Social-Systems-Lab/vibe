# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# install with --production (exclude devDependencies)
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# copy node_modules from temp directory
# then copy all (non-ignored) project files into the image
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# copy production dependencies and source code into final image
FROM base AS release
WORKDIR /usr/src/app
COPY --from=install /temp/prod/node_modules node_modules
# Copy necessary files from prerelease stage
COPY --from=prerelease /usr/src/app/package.json .
COPY --from=prerelease /usr/src/app/bun.lock .
COPY --from=prerelease /usr/src/app/tsconfig.json .
COPY --from=prerelease /usr/src/app/src ./src

# Application version ARG and ENV
ARG APP_VERSION="unknown"
ENV APP_VERSION=${APP_VERSION}

# run the app
USER bun
# Expose the port defined by APP_PORT, default to 3000
# Note: Actual port mapping is done in docker-compose.yml
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "run", "src/index.ts" ]
