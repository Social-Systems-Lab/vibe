# Use the official Bun image as a base
FROM oven/bun:1 as base
WORKDIR /usr/src/app

# Install dependencies first, in a separate step to leverage Docker cache
# Copy package.json and bun.lockb
COPY package.json bun.lockb* ./
# Install dependencies
RUN bun install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Define the command to run the app
CMD ["bun", "run", "src/index.ts"]
