#!/bin/bash
# Vibe Cloud instance deprovisioning script
# This script is executed by the vibe-cloud-control-plane to deprovision a user instance.

echo "Deprovisioning script starting for instance: ${INSTANCE_IDENTIFIER}, user: ${TARGET_USER_DID}"

# --- Configuration & Validation ---
TARGET_USER_DID="${TARGET_USER_DID}"
INSTANCE_IDENTIFIER="${INSTANCE_IDENTIFIER}" # Unique ID for the instance, e.g., vibe-u-xxxx
CONTROL_PLANE_URL="${CONTROL_PLANE_URL}"     # URL of the control plane API
INTERNAL_SECRET_TOKEN="${INTERNAL_SECRET_TOKEN}" # Secret token for internal callback

KUBECONFIG_ARG=""
if [ -n "$KUBECONFIG_PATH" ]; then
  if [ ! -f "$KUBECONFIG_PATH" ]; then
    echo "ERROR: KUBECONFIG_PATH is set to '$KUBECONFIG_PATH', but the file does not exist." >&2
    # Notify control plane of script failure before exiting
    # This callback is to a hypothetical endpoint for script execution failure, not finalize-deletion
    # For simplicity, we'll log and exit; control plane should monitor script exit code.
    exit 1
  fi
  KUBECONFIG_ARG="--kubeconfig ${KUBECONFIG_PATH}"
  echo "Using kubeconfig from: ${KUBECONFIG_PATH}"
else
  echo "Assuming in-cluster Kubernetes authentication (ServiceAccount)."
fi

# Validate required variables
if [ -z "$TARGET_USER_DID" ]; then
  echo "ERROR: TARGET_USER_DID environment variable is not set." >&2
  exit 1
fi
if [ -z "$INSTANCE_IDENTIFIER" ]; then
  echo "ERROR: INSTANCE_IDENTIFIER environment variable is not set." >&2
  exit 1
fi
if [ -z "$CONTROL_PLANE_URL" ]; then
  echo "ERROR: CONTROL_PLANE_URL environment variable is not set." >&2
  exit 1
fi
if [ -z "$INTERNAL_SECRET_TOKEN" ]; then
  echo "ERROR: INTERNAL_SECRET_TOKEN environment variable is not set." >&2
  exit 1
fi

# Function to call back to control plane to finalize deletion
# Usage: callback_finalize_deletion "status" "error_message_if_failed"
callback_finalize_deletion() {
  local status="$1"
  local error_msg="$2"
  local payload

  echo "Calling back control plane for identity ${TARGET_USER_DID} to finalize deletion: Status=${status}, Error=${error_msg}"

  if [ "$status" == "success" ]; then
    # Payload for POST /api/v1/internal/identities/:did/finalize-deletion
    # This endpoint might not need a complex payload, just the signal.
    # For now, sending status.
    payload="{\"status\": \"deprovisioned_success\"}"
  else
    payload="{\"status\": \"deprovisioned_failed\", \"errorDetails\": \"${error_msg}\"}"
  fi

  # The endpoint for finalizing deletion
  # Example: POST ${CONTROL_PLANE_URL}/api/v1/internal/identities/${TARGET_USER_DID}/finalize-deletion
  # This endpoint needs to be created in the control plane.
  curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "X-Internal-Secret: ${INTERNAL_SECRET_TOKEN}" \
    -d "${payload}" \
    "${CONTROL_PLANE_URL}/api/v1/internal/identities/${TARGET_USER_DID}/finalize-deletion"
  
  curl_exit_code=$?
  if [ $curl_exit_code -ne 0 ]; then
    echo "ERROR: Callback to finalize deletion failed with curl exit code ${curl_exit_code}." >&2
    # If callback fails, the control plane won't know the script finished.
    # This is a critical failure. The control plane might need a timeout mechanism for scripts.
    exit 1 # Exit with error so control plane knows the script itself had an issue.
  else
    echo "Callback to finalize deletion successful."
  fi
}

# --- Helm Uninstall ---
K8S_NAMESPACE="vibe-${INSTANCE_IDENTIFIER}"
HELM_RELEASE_NAME="vibe-${INSTANCE_IDENTIFIER}"

echo "Uninstalling Helm release '${HELM_RELEASE_NAME}' from namespace '${K8S_NAMESPACE}'..."
helm ${KUBECONFIG_ARG} uninstall "${HELM_RELEASE_NAME}" --namespace "${K8S_NAMESPACE}" --timeout 5m --wait
helm_exit_code=$?

if [ $helm_exit_code -ne 0 ]; then
  # Check if the release was not found (e.g., already deleted or never existed)
  # "release: not found" is a common error message substring
  if helm ${KUBECONFIG_ARG} status "${HELM_RELEASE_NAME}" --namespace "${K8S_NAMESPACE}" 2>&1 | grep -q "release: not found"; then
    echo "Helm release '${HELM_RELEASE_NAME}' not found. Assuming already deprovisioned or never existed. Proceeding..."
  else
    echo "ERROR: Helm uninstall failed with exit code $helm_exit_code for instance ${INSTANCE_IDENTIFIER}." >&2
    # Don't call finalize_deletion with failure here, as the main deprovisioning failed.
    # The control plane should detect script failure via its exit code.
    exit $helm_exit_code
  fi
fi
echo "Helm release '${HELM_RELEASE_NAME}' uninstalled successfully or was not found."

# --- Delete Kubernetes Namespace ---
echo "Deleting Kubernetes namespace: ${K8S_NAMESPACE}..."
kubectl ${KUBECONFIG_ARG} delete namespace "${K8S_NAMESPACE}" --ignore-not-found=true --timeout=2m
kube_delete_exit_code=$?

if [ $kube_delete_exit_code -ne 0 ]; then
  echo "WARNING: Failed to delete namespace ${K8S_NAMESPACE} or command timed out. It might be stuck in Terminating state or already gone." >&2
  # Proceed to callback, as Helm release (main part) is gone. Namespace cleanup can be handled by cluster admins if stuck.
fi
echo "Kubernetes namespace '${K8S_NAMESPACE}' deletion command issued."

# --- Callback to Control Plane ---
# Signal successful deprovisioning of K8s resources.
# The control plane will then handle database record deletion.
callback_finalize_deletion "success" ""

echo "Deprovisioning script finished for instance ${INSTANCE_IDENTIFIER}."
exit 0
