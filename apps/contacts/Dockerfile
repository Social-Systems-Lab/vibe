# Copy and build Vibe SDK
FROM node:20-alpine AS sdk-builder
WORKDIR /app/vibe-sdk
COPY vibe-sdk/package*.json ./
RUN npm install
COPY vibe-sdk/ .
RUN npm run build

# Copy and build Vibe React
FROM node:20-alpine AS react-builder
WORKDIR /app/vibe-react
COPY vibe-react/package*.json ./
RUN npm install
COPY vibe-react/ .
COPY --from=sdk-builder /app/vibe-sdk /app/vibe-sdk
RUN npm install /app/vibe-sdk
RUN npm run build

# Build the contacts app
FROM node:20-alpine AS app-builder
WORKDIR /app/contacts
COPY apps/contacts/package*.json ./
RUN npm install
COPY apps/contacts/ .
COPY --from=sdk-builder /app/vibe-sdk /app/vibe-sdk
COPY --from=react-builder /app/vibe-react /app/vibe-react
RUN npm install /app/vibe-sdk
RUN npm run build

# Production runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=app-builder /app/contacts/dist ./dist

# Using a lightweight server to serve static files
RUN npm install -g serve

EXPOSE 4003
ENV PORT=4003
ENV HOSTNAME="0.0.0.0"

CMD ["serve", "-s", "dist", "-l", "4003"]