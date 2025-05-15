# Use the official Bun image as a base
FROM oven/bun:1 as base
WORKDIR /usr/src/app

# Install dependencies first, in a separate step to leverage Docker cache
# Copy package.json and bun.lockb
COPY package.json bun.lockb* ./
# Install dependencies
RUN bun install --frozen-lockfile

# Install bash for running provisioning scripts
USER root
RUN apt-get update && \
    apt-get install -y bash && \
    rm -rf /var/lib/apt/lists/* && \
    echo "--- Checking for bash after install ---" && \
    which bash && \
    ls -l /bin/bash /usr/bin/bash && \
    echo "--- Bash check complete ---"
USER bun

# Copy the rest of the application code
COPY . .

# Check bash as USER bun before CMD
USER bun
RUN echo "--- [DIAGNOSTIC] Checking for bash as USER bun ---" && \
    ls -l /usr/bin/bash && \
    echo "--- [DIAGNOSTIC] Attempting to get bash version as USER bun ---" && \
    /usr/bin/bash --version && \
    echo "--- [DIAGNOSTIC] Bash check as USER bun complete ---"

# Expose the port the app runs on
EXPOSE 3000

# Application version ARG and ENV
ARG APP_VERSION="unknown"
ENV APP_VERSION=${APP_VERSION}

# Define the command to run the app
CMD ["bun", "run", "src/index.ts"]
