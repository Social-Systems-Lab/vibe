# Vibe Cloud Infrastructure on Scaleway (Terraform)

This directory contains Terraform configurations to provision and manage the infrastructure for the Vibe Cloud service on Scaleway, primarily focusing on a Kubernetes Kapsule cluster.

## Prerequisites

Before you begin, ensure you have the following installed and configured:

1.  **Scaleway Account:**

    -   Sign up for a Scaleway account if you don't have one.
    -   Generate an API Key (Access Key and Secret Key) from the Scaleway console (IAM section).
    -   Note your Project ID.

2.  **Scaleway CLI (`scw`):**

    -   Install the Scaleway CLI.
    -   Configure it by running `scw init`. This will prompt you for your Access Key, Secret Key, default Project ID, default Region, and default Zone. This configuration will be used by Terraform if not explicitly overridden.
    -   Installation guide: [Scaleway CLI Installation](https://www.scaleway.com/en/docs/infrastructure/cli/quickstart/#installing-the-cli)

3.  **Terraform:**

    -   Install Terraform (version 1.0 or higher recommended).
    -   Installation guide: [Install Terraform](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli)

4.  **Helm (Optional but Recommended for Kubernetes deployments):**

    -   Install Helm.
    -   Installation guide: [Installing Helm](https://helm.sh/docs/intro/install/)

5.  **kubectl:**
    -   Install `kubectl`, the Kubernetes command-line tool.
    -   Installation guide: [Install kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl-windows/) (or select your OS)

## Directory Structure

-   `main.tf`: The main Terraform configuration file defining the Scaleway resources.
-   `variables.tf` (Recommended): For defining input variables.
-   `outputs.tf` (Recommended): For defining outputs (like the kubeconfig).
-   `.gitignore`: Specifies intentionally untracked files that Git should ignore.
-   `vibe-cluster.kubeconfig` (Generated, Ignored): The kubeconfig file for accessing the cluster. **DO NOT COMMIT THIS FILE.**

## Setup and Deployment

1.  **Clone the Repository:**
    Ensure you have cloned the main Vibe project repository.

2.  **Navigate to the Terraform Directory:**

    ```bash
    cd path/to/vibe-cloud/terraform
    ```

3.  **Define Variables (if not using defaults or environment variables):**

    -   The `main.tf` configuration requires a `project_id`. You can be prompted for this, set it as an environment variable (`TF_VAR_project_id`), or define it in a `terraform.tfvars` file.
    -   **Example `terraform.tfvars` (Create this file if needed):**
        ```hcl
        project_id = "your-scaleway-project-id"
        region     = "fr-par" // Or your preferred region e.g., nl-ams, pl-waw
        zone       = "fr-par-1" // Or your preferred zone
        // Add other variables as defined in variables.tf
        ```
    -   **Important:** Add `*.tfvars` to your `.gitignore` file if it contains sensitive information.

4.  **Initialize Terraform:**
    This command downloads the necessary provider plugins (in this case, for Scaleway).

    ```bash
    terraform init
    ```

5.  **Plan the Deployment:**
    This command shows you what resources Terraform will create, modify, or destroy. Review the plan carefully.

    ```bash
    terraform plan
    ```

    If you are using a `.tfvars` file not named `terraform.tfvars` or `*.auto.tfvars`, you can specify it:

    ```bash
    terraform plan -var-file="your-vars.tfvars"
    ```

6.  **Apply the Configuration:**
    This command provisions the resources on Scaleway as defined in your configuration and shown in the plan. You will be prompted to confirm by typing `yes`.
    ```bash
    terraform apply
    ```
    Or with a specific var file:
    ```bash
    terraform apply -var-file="your-vars.tfvars"
    ```
    This process can take several minutes, especially when creating the Kubernetes node pool.

## Accessing the Kubernetes Cluster

1.  **Retrieve Kubeconfig:**
    After `terraform apply` successfully completes, the kubeconfig for accessing your cluster is available as a Terraform output. To save it to a file:

    ```bash
    # Ensure jq is installed (https://jqlang.github.io/jq/download/)
    terraform output -json kubeconfig | jq -r '.[0].config_file' > vibe-cluster.kubeconfig
    ```

    Alternatively, you can download the kubeconfig from the Scaleway console or using the `scw` CLI:

    ```bash
    scw k8s kubeconfig get <YOUR_CLUSTER_ID_OR_NAME> --region=<YOUR_REGION> > vibe-cluster.kubeconfig
    ```

    The `vibe-cluster.kubeconfig` file is already included in the `.gitignore` in this directory.

2.  **Configure `kubectl`:**
    Set the `KUBECONFIG` environment variable to point to your downloaded file for the current terminal session:

    -   **PowerShell:**
        ```powershell
        $env:KUBECONFIG = ".\vibe-cluster.kubeconfig"
        ```
    -   **Bash/Zsh:**
        ```bash
        export KUBECONFIG=./vibe-cluster.kubeconfig
        ```

3.  **Verify Cluster Access:**
    ```bash
    kubectl get nodes
    ```
    You should see your worker node(s) listed with a `Ready` status.
    ```bash
    kubectl get pods -A
    ```
    This will show system pods running in the cluster.

## Destroying Infrastructure

To remove all resources created by this Terraform configuration (and stop incurring costs):

1.  Navigate to the `vibe-cloud/terraform` directory.
2.  Run the destroy command. You will be prompted to confirm by typing `yes`.
    ```bash
    terraform destroy
    ```
    If you used a specific var file for apply, you might need it for destroy as well if it influences resource identification:
    ```bash
    terraform destroy -var-file="your-vars.tfvars"
    ```

This command will delete the Kapsule cluster, node pool(s), and the private network.
