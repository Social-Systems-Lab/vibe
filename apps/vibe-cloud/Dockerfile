# Use the official Bun image
FROM oven/bun:1 as base

# Set working directory
WORKDIR /app

# Install dependencies first for better caching
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on (default Elysia port is 3000)
EXPOSE 3000

# Define the command to run the app
# Use --watch for development if needed, but default to production start
CMD ["bun", "run", "index.ts"]
