# Deploying Vibe Cloud

This document outlines the procedures for deploying the Vibe Cloud infrastructure, both on the Scaleway cloud platform and on a self-hosted server.

## Deploying on Scaleway

This guide provides a comprehensive walkthrough for deploying the Vibe Cloud API and its dependencies to a Kubernetes cluster on Scaleway using Terraform for infrastructure provisioning and Helm for application deployment.

### Prerequisites

1.  **Scaleway Account**: You must have a Scaleway account with a valid payment method.
2.  **Terraform**: Terraform must be installed on your local machine.
3.  **GitHub Repository**: A GitHub repository containing the application code and the IaC (Infrastructure as Code) configurations.

### Step 1: Configure Scaleway Credentials

Before you can provision infrastructure, you need to provide your Scaleway credentials to the GitHub Actions workflow. Add the following as secrets in your GitHub repository's settings (`Settings > Secrets and variables > Actions`):

-   `SCALEWAY_ACCESS_KEY`: Your Scaleway API access key.
-   `SCALEWAY_SECRET_KEY`: Your Scaleway API secret key.
-   `SCALEWAY_ORGANIZATION_ID`: Your Scaleway organization ID.
-   `SCALEWAY_PROJECT_ID`: The ID of the Scaleway project where the infrastructure will be deployed.

### Step 2: Configure Application Secrets

The application requires several secrets for its operation. Add the following to your GitHub repository's secrets:

-   `JWT_SECRET`: A long, random string for signing JSON Web Tokens.
-   `INSTANCE_ID_SECRET`: Another long, random, and secure string.
-   `COUCHDB_PASSWORD`: The desired password for the CouchDB `admin` user.
-   `COUCHDB_UUID`: A persistent, unique UUID for the CouchDB instance. You can generate one using an online UUID generator.

### Step 3: Provision the Infrastructure

The Terraform configuration in the `infra/terraform` directory is set up to provision all necessary Scaleway resources, including:

-   A Kubernetes Kapsule cluster.
-   A node pool for the cluster.
-   A private network for the cluster.
-   A container registry for your Docker images.
-   An object storage bucket.

To provision the infrastructure, run the `terraform apply` command from within the `infra/terraform` directory. You will be prompted to enter your Scaleway credentials if they are not already configured in your environment.

```bash
cd infra/terraform
terraform init
terraform apply
```

### Step 4: Automated Deployment with GitHub Actions

The repository includes a GitHub Actions workflow at `.github/workflows/deploy-helm-chart.yaml` that automates the entire deployment process. When you push a commit to the `main` branch, the workflow will:

1.  **Build and Push Docker Image**: Build the `vibe-cloud-api` Docker image and push it to your Scaleway Container Registry, tagged with the commit SHA.
2.  **Set up Kubernetes Context**: Authenticate with your Scaleway account and configure `kubectl` to connect to your newly provisioned Kubernetes cluster.
3.  **Deploy Helm Chart**: Use Helm to deploy the `vibe-cloud-api` chart located in `infra/helm/vibe-cloud-api`. This deployment includes:
    -   The `vibe-cloud-api` application itself.
    -   A CouchDB instance, deployed as a dependency of the main chart.

The workflow dynamically creates a `secrets.yaml` file for the Helm deployment using the secrets you configured in Step 1 and 2, ensuring that no sensitive information is stored in the repository.

To trigger the deployment, simply commit and push your changes to the `main` branch.

---

## Self-Hosting with Docker Compose

For a simpler, single-server deployment, you can use the provided Docker Compose configuration.

### Prerequisites

1.  **Docker and Docker Compose**: Ensure that Docker and Docker Compose are installed on your server.
2.  **`.env` file**: You will need to create a `.env` file with the necessary environment variables for the `vibe-cloud-api`.

### Step 1: Create the `.env` file

Navigate to the `infra/selfhost` directory and create a `.env` file. You can copy the contents of `apps/vibe-cloud-api/.env.example` as a starting point. At a minimum, you will need to provide:

-   `COUCHDB_USER`: The username for CouchDB.
-   `COUCHDB_PASSWORD`: The password for CouchDB.
-   `JWT_SECRET`: A secure, random string.
-   `INSTANCE_ID_SECRET`: Another secure, random string.

### Step 2: Run Docker Compose

From within the `infra/selfhost` directory, run the following command to start the application stack in the background:

```bash
cd infra/selfhost
docker-compose up -d
```

This command will pull the necessary Docker images and start both the `vibe-cloud-api` and a CouchDB container. The API will be accessible on the port you've configured in your `.env` file.
