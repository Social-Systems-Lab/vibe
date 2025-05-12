#!/bin/bash
# Vibe Cloud instance provisioning script
# This script is executed by the vibe-cloud API to provision infrastructure using Terraform.

echo "Provisioning script starting..."

# --- Configuration & Validation ---
# Read required variables from environment
TARGET_USER_DID="${TARGET_USER_DID}"
INSTANCE_IDENTIFIER="${INSTANCE_IDENTIFIER}"
# TODO: Read Scaleway credentials securely (e.g., from mounted secrets or pre-configured environment)
# SCW_ACCESS_KEY="${SCW_ACCESS_KEY}"
# SCW_SECRET_KEY="${SCW_SECRET_KEY}"
# SCW_DEFAULT_PROJECT_ID="${SCW_DEFAULT_PROJECT_ID}"

# Validate required variables
if [ -z "$TARGET_USER_DID" ]; then
  echo "ERROR: TARGET_USER_DID environment variable is not set." >&2
  exit 1
fi

if [ -z "$INSTANCE_IDENTIFIER" ]; then
  echo "ERROR: INSTANCE_IDENTIFIER environment variable is not set." >&2
  exit 1
fi

# TODO: Add validation for Scaleway credentials if read from env vars

echo "Received TARGET_USER_DID: $TARGET_USER_DID"
echo "Received INSTANCE_IDENTIFIER: $INSTANCE_IDENTIFIER"

# --- Terraform Execution ---
# The script expects to be run from the vibe-cloud/terraform directory

echo "Preparing Terraform variables..."
# Construct Terraform variable arguments
# Note: Ensure instanceIdentifier in values.yaml matches this for consistency if needed elsewhere.
TF_VAR_instance_identifier="$INSTANCE_IDENTIFIER"
# TODO: Add other necessary tfvars based on requirements (e.g., region, node type)
# TF_VAR_region="fr-par" # Example

echo "Running Terraform apply..."
# Run terraform init (if needed, though state backend should handle this)
# terraform init -upgrade

# Run terraform apply with auto-approval and passing variables
# Ensure Scaleway provider credentials are configured in the environment where this script runs
# or passed securely.
terraform apply -auto-approve \
  -var="instance_identifier=${TF_VAR_instance_identifier}" \
  # -var="region=${TF_VAR_region}" # Example

# Capture Terraform exit code
tf_exit_code=$?

if [ $tf_exit_code -ne 0 ]; then
  echo "ERROR: Terraform apply failed with exit code $tf_exit_code." >&2
  # TODO: Add failure handling logic (e.g., notify API/admin)
  exit $tf_exit_code
fi

echo "Terraform apply completed successfully."

# --- Post-Provisioning Steps ---
# TODO: Capture Terraform outputs (e.g., instance URL) if needed
# instance_url=$(terraform output -raw instance_url) # Example
# echo "Instance URL: $instance_url"

# TODO: Update identity registry or other system databases with provisioning status/details

echo "Provisioning script finished successfully."
exit 0
