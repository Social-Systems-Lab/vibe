# Stage 1: Build the application
FROM node:18-alpine AS builder

# Install pnpm
RUN npm i -g pnpm

# Set working directory
WORKDIR /usr/src/app

# Copy workspace files
COPY ../../pnpm-lock.yaml ./
COPY ../../package.json ./

# Copy app-specific package.json
COPY package.json ./

# Install dependencies
RUN pnpm install --prod

# Copy the rest of the application source code
COPY . .

# Build the Next.js application
RUN pnpm build

# Stage 2: Production image
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy the built application from the builder stage
COPY --from=builder /usr/src/app/.next ./.next
COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/package.json ./package.json
COPY --from=builder /usr/src/app/next.config.ts ./

# Expose the port the app runs on
EXPOSE 4000

# Set the command to start the server
CMD ["pnpm", "start", "-p", "4000"]