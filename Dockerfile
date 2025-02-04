# Copy and build Vibe SDK
FROM node:20-alpine AS sdk-builder
WORKDIR /app/vibe-sdk
COPY vibe-sdk/package*.json ./
RUN npm install
COPY vibe-sdk/ .
RUN npm run build

# Copy and build Vibe Web
FROM node:20-alpine AS web-builder
WORKDIR /app/vibe-web
COPY vibe-web/package*.json ./
RUN npm install
COPY vibe-web/ .
COPY --from=sdk-builder /app/vibe-sdk /app/vibe-sdk
RUN npm install /app/vibe-sdk
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=web-builder /app/vibe-web/public ./public
COPY --from=web-builder /app/vibe-web/.next/standalone/vibe-web ./
COPY --from=web-builder /app/vibe-web/.next/static ./.next/static

EXPOSE 4002
ENV PORT 4002
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]