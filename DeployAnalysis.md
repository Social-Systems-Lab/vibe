# Vibe Monorepo and Deployment Analysis

We are trying to set up our project for deploy on scaleway and I want you to look over our set up, fix issues and improve it.

We have a monorepo that is set up using pnpm workspace, with the following base structure:

## 1. Monorepo Structure

The project is a monorepo managed with `pnpm` workspaces, as defined in [`pnpm-workspace.yaml`](pnpm-workspace.yaml). The workspaces are organized into three main categories: `apps`, `packages`, and `infra`.

### 1.1. Applications (`apps/`)

These are two main, deployable applications in the project.

-   **`vibe-cloud-api`**: The core backend API for the Vibe platform, built with ElysiaJS. It handles user authentication, data storage, and business logic. It depends on the `vibe-sdk` for shared functionality. The application is containerized using the [`apps/vibe-cloud-api/Dockerfile`](apps/vibe-cloud-api/Dockerfile).

-   **`vibe-feeds`**: The main frontend application, built with Next.js and React. It provides the user interface for interacting with the Vibe platform. It uses the `vibe-sdk` for communicating with the `vibe-cloud-api` and the `vibe-react` package for its UI components.

Vibe-feeds will be deployed by Vercel so we are primarily interested in analysing the deployment set up for vibe-cloud-api and the database (CouchDB) and storage (Scaleway Object Storage).

### 1.2. Packages (`packages/`)

These are shared libraries used by the applications in the monorepo.

-   **`vibe-sdk`**: A TypeScript SDK that provides a consistent interface for interacting with the `vibe-cloud-api`. It encapsulates core functionalities like cryptography, identity management, and API communication, making it easy to reuse this logic across different applications.

-   **`vibe-react`**: A shared React component library that provides a set of reusable UI components for the frontend applications. This ensures a consistent look and feel across the platform.

### 1.3. Infrastructure (`infra/`)

This directory contains all the infrastructure-as-code and deployment configurations.

-   **`helm/`**: Contains Helm charts for deploying applications to Kubernetes.
-   **`selfhost/`**: Contains a Docker Compose setup for a simple, single-server deployment.
-   **`terraform/`**: Contains Terraform configurations for provisioning infrastructure on Scaleway.

## 2. Scaleway Deployment

The primary deployment strategy targets a Kubernetes cluster on Scaleway. This process is highly automated, leveraging Terraform for infrastructure provisioning and Helm for application deployment, all orchestrated by GitHub Actions.

### 2.1. Infrastructure Provisioning (Terraform)

The infrastructure is defined in the [`infra/terraform/`](infra/terraform/) directory. The [`infra/terraform/main.tf`](infra/terraform/main.tf) file provisions the following Scaleway resources:

-   **Kubernetes Cluster**: A Scaleway Kapsule cluster with an auto-scaling node pool.
-   **Private Network**: An isolated private network for the cluster.
-   **Object Storage**: An S3-compatible object storage bucket for application data.
-   **Container Registry**: A private container registry for storing Docker images.

### 2.2. Application Deployment (Helm)

The `vibe-cloud-api` is deployed to the Kubernetes cluster using the Helm chart located in [`infra/helm/vibe-cloud-api/`](infra/helm/vibe-cloud-api/).

-   **`Chart.yaml`**: The [`infra/helm/vibe-cloud-api/Chart.yaml`](infra/helm/vibe-cloud-api/Chart.yaml) file defines the chart's metadata and dependencies, which include `couchdb` and `ingress-nginx`.
-   **`values.yaml`**: The [`infra/helm/vibe-cloud-api/values.yaml`](infra/helm/vibe-cloud-api/values.yaml) file provides default configuration values for the deployment.
-   **Templates**: The `templates/` directory contains the Kubernetes manifest templates, including:
    -   [`deployment.yaml`](infra/helm/vibe-cloud-api/templates/deployment.yaml): Deploys the `vibe-cloud-api` application.
    -   [`service.yaml`](infra/helm/vibe-cloud-api/templates/service.yaml): Exposes the application within the cluster.
    -   [`ingress.yaml`](infra/helm/vibe-cloud-api/templates/ingress.yaml): Manages external access to the application.
    -   [`cluster-issuer.yaml`](infra/helm/vibe-cloud-api/templates/cluster-issuer.yaml): Configures `cert-manager` for automatic TLS certificate provisioning from Let's Encrypt.

### 2.3. CI/CD (GitHub Actions)

The deployment process is automated using GitHub Actions, defined in the `.github/workflows/` directory.

-   **`deploy-helm-chart.yaml`**: The main workflow, located at [`.github/workflows/deploy-helm-chart.yaml`](.github/workflows/deploy-helm-chart.yaml), automates the entire deployment process. It builds the `vibe-cloud-api` Docker image, pushes it to the Scaleway Container Registry, and deploys the Helm chart to the Kubernetes cluster. It also dynamically generates a `secrets.yaml` file from GitHub Actions secrets to avoid storing sensitive information in the repository.

## 3. Self-Hosted Deployment (Docker Compose)

For simpler deployments, a Docker Compose setup is provided in the [`infra/selfhost/`](infra/selfhost/) directory. The [`infra/selfhost/docker-compose.yml`](infra/selfhost/docker-compose.yml) file defines two services: `vibe-cloud-api` and `couchdb`, allowing for a quick and easy way to run the application stack on a single server.
