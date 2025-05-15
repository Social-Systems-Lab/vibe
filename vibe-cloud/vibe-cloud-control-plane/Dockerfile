# Use the official Bun image as a base
FROM oven/bun:1 as base
WORKDIR /usr/src/app

# Install dependencies first, in a separate step to leverage Docker cache
# Copy package.json and bun.lockb from the control-plane directory
COPY vibe-cloud/vibe-cloud-control-plane/package.json vibe-cloud/vibe-cloud-control-plane/bun.lockb* ./
# Install dependencies
RUN bun install --frozen-lockfile

# Install tools needed for provisioning scripts (bash, curl, kubectl)
USER root
RUN apt-get update && \
    apt-get install -y bash curl && \
    echo "--- Installing kubectl ---" && \
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && \
    install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl && \
    rm kubectl && \
    echo "--- Kubectl installed ---" && \
    echo "--- Installing Helm ---" && \
    curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 && \
    chmod 700 get_helm.sh && \
    ./get_helm.sh && \
    rm get_helm.sh && \
    echo "--- Helm installed ---" && \
    echo "--- Checking for bash after install ---" && \
    which bash && \
    ls -l /bin/bash && \
    ls -l /usr/bin/bash && \
    echo "--- Bash check complete ---" && \
    echo "--- Checking for curl ---" && \
    which curl && \
    curl --version && \
    echo "--- Curl check complete ---" && \
    echo "--- Checking for kubectl ---" && \
    which kubectl && \
    kubectl version --client && \
    echo "--- Kubectl check complete ---" && \
    echo "--- Checking for helm ---" && \
    which helm && \
    helm version && \
    echo "--- Helm check complete ---"
USER bun

# Copy the rest of the application code from the control-plane directory
COPY vibe-cloud/vibe-cloud-control-plane/. .

# Copy the vibe-cloud-infra directory for the provisioning script and its context
COPY vibe-cloud/vibe-cloud-infra /usr/src/vibe-cloud-infra

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
