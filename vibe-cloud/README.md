# Vibe Cloud Backend

This directory contains the backend services and infrastructure definitions for Vibe Cloud.

## Overview

The Vibe Cloud backend is structured as a multi-service application:

-   **`vibe-cloud-api`**: This is the data plane service. Each instance of Vibe Cloud (for a user or organization) will run this service. It handles user data, application logic, blob storage interactions, and real-time communication.
-   **`vibe-cloud-control-plane`**: This service manages the provisioning of new Vibe Cloud instances, handles administrative tasks like initial admin claims, and will eventually host the identity registry.
-   **`vibe-cloud-infra`**: This directory contains all infrastructure-as-code (IaC) definitions, including:
    -   `terraform/`: Terraform configurations for managing Scaleway Kapsule clusters and related cloud resources.
    -   `helm/`: Helm charts for deploying services (currently `vibe-cloud-instance`, which packages the `vibe-cloud-api`).
    -   `provisioning/`: Scripts used by the control plane to automate instance provisioning (e.g., running Terraform).
    -   `kubernetes/`: Raw Kubernetes manifest files (if any, for components not managed by Helm).
-   **`vibe-cloud-selfhost`**: This directory will contain configurations and documentation for self-hosting Vibe Cloud.

## Local Development

To run the Vibe Cloud services locally for development:

1.  Ensure you have Docker and Docker Compose installed.
2.  Copy the example environment file for the API service: `cp vibe-cloud/vibe-cloud-api/.env.example vibe-cloud/vibe-cloud-api/.env`
3.  (Optional) Create an environment file for the control plane if needed: `vibe-cloud/vibe-cloud-control-plane/.env`
4.  Update the `.env` file(s) with your desired settings (e.g., CouchDB credentials, JWT secret, Minio credentials).
5.  From the root of the `vibe` project (`d:/Projects/ssl/vibe`), run:
    `bash
docker-compose up --build
`
    This will build the Docker images for `vibe-cloud-api` and `vibe-cloud-control-plane` and start them along with CouchDB and Minio services.

-   The API service will typically be available at `http://localhost:3000` (or the port specified by `APP_PORT`).
-   The Control Plane service will typically be available at `http://localhost:3001` (or the port specified by `CONTROL_PLANE_PORT`).

## Further Documentation

-   See the `README.md` file within each subdirectory (`vibe-cloud-api/`, `vibe-cloud-control-plane/`, `vibe-cloud-infra/`) for more specific details about each component.
