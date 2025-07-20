# Vibe Infrastructure

This directory contains the infrastructure and deployment configurations for the Vibe project.

## Overview

The infrastructure is managed using [Terraform](https://www.terraform.io/) and deployed to [Scaleway](https://www.scaleway.com/). The applications are containerized using [Docker](https://www.docker.com/) and deployed to a [Kubernetes](https://kubernetes.io/) cluster (Scaleway Kapsule) using [Helm](https://helm.sh/).

## Prerequisites

-   [Terraform CLI](https://learn.hashicorp.com/tutorials/terraform/install-cli)
-   [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/)
-   [Helm](https://helm.sh/docs/intro/install/)
-   A Scaleway account and API keys

## Structure

-   `terraform/`: Contains the Terraform scripts for provisioning cloud resources.
-   `helm/`: Contains the Helm charts for deploying applications to Kubernetes.
    -   `vibe-cloud-api/`: Helm chart for the backend API.
    -   `vibe-feeds/`: Helm chart for the frontend application.

## Deployment Steps

1.  **Provision Infrastructure:**

    -   Navigate to the `terraform` directory.
    -   Initialize Terraform: `terraform init`
    -   Create a new workspace for the environment: `terraform workspace new <env_name>` (e.g., `production`)
    -   Apply the Terraform configuration: `terraform apply`

2.  **Deploy Applications:**
    -   Configure `kubectl` to connect to the new Kapsule cluster. You can get the kubeconfig from the Scaleway console or via the `scw` CLI.
    -   Update the `values.yaml` files in the `helm` charts with the correct image tags and any other environment-specific configurations.
    -   Deploy the `vibe-cloud-api` chart (which includes CouchDB): `helm upgrade --install vibe-cloud-api ./vibe-cloud-api -n vibe`
    -   Deploy the `vibe-feeds` chart: `helm upgrade --install vibe-feeds ./vibe-feeds -n vibe`
