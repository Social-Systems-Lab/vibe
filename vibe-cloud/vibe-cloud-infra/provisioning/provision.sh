#!/bin/bash
# Vibe Cloud instance provisioning script (Helm-based)
# This script is executed by the vibe-cloud-control-plane to provision a new user instance
# into an existing shared Kubernetes cluster.

echo "Provisioning script starting for instance: ${INSTANCE_IDENTIFIER}, user: ${TARGET_USER_DID}"

# --- Configuration & Validation ---
# Required variables from environment (passed by control plane)
TARGET_USER_DID="${TARGET_USER_DID}"
INSTANCE_IDENTIFIER="${INSTANCE_IDENTIFIER}" # Unique ID for the instance, e.g., vibe-u-xxxx
CONTROL_PLANE_URL="${CONTROL_PLANE_URL}"     # URL of the control plane API, e.g., http://localhost:3001
INTERNAL_SECRET_TOKEN="${INTERNAL_SECRET_TOKEN}" # Secret token for internal callback

# Optional: KUBECONFIG_PATH if not running in-cluster with a service account
# If KUBECONFIG_PATH is set, kubectl/helm will use it. Otherwise, they assume in-cluster auth.
KUBECONFIG_ARG=""
if [ -n "$KUBECONFIG_PATH" ]; then
  if [ ! -f "$KUBECONFIG_PATH" ]; then
    echo "ERROR: KUBECONFIG_PATH is set to '$KUBECONFIG_PATH', but the file does not exist." >&2
    exit 1
  fi
  KUBECONFIG_ARG="--kubeconfig ${KUBECONFIG_PATH}"
  echo "Using kubeconfig from: ${KUBECONFIG_PATH}"
else
  echo "Assuming in-cluster Kubernetes authentication (ServiceAccount)."
fi

# Path to the Helm chart (relative to this script if it's moved, or absolute)
# Assuming this script is run from a context where this relative path is valid.
# The control plane calls this script from `vibe-cloud/vibe-cloud-control-plane`,
# so `../vibe-cloud-infra/helm/vibe-cloud-instance` becomes `../../helm/vibe-cloud-instance`
# Or, more robustly, the control plane should pass the absolute path or ensure CWD.
# For now, let's assume the control plane sets CWD to `vibe-cloud/vibe-cloud-infra` before calling `provisioning/provision.sh`
# Or this script is in `vibe-cloud/vibe-cloud-infra` and chart is in `./helm/vibe-cloud-instance`
# Given the original script's context, let's adjust:
# Original CWD for script was `vibe-cloud-infra/terraform`. If script is in `vibe-cloud-infra/provisioning`,
# and CWD is `/usr/src/vibe-cloud-infra`, then the path should be relative to CWD.
HELM_CHART_PATH="./helm/vibe-cloud-instance" 

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

# Function to call back to control plane
# Usage: callback_control_plane "status" "url_if_completed" "error_message_if_failed"
callback_control_plane() {
  local status="$1"
  local url="$2"
  local error_msg="$3"
  local payload

  echo "Calling back control plane for identity ${TARGET_USER_DID}: Status=${status}, URL=${url}, Error=${error_msg}"

  if [ "$status" == "completed" ]; then
    # Payload for PUT /api/v1/identities/:did using UpdateIdentityInternalRequestSchema
    payload="{\"instanceStatus\": \"completed\", \"instanceUrl\": \"${url}\"}"
  else
    # Payload for PUT /api/v1/identities/:did using UpdateIdentityInternalRequestSchema
    payload="{\"instanceStatus\": \"failed\", \"instanceErrorDetails\": \"${error_msg}\"}"
  fi

  # TARGET_USER_DID is the identity's DID
  # INSTANCE_IDENTIFIER is the instanceId field within the Identity document
  # The endpoint is now PUT /api/v1/identities/:did
  # The internal auth uses X-Internal-Secret header
  curl -s -X PUT \
    -H "Content-Type: application/json" \
    -H "X-Internal-Secret: ${INTERNAL_SECRET_TOKEN}" \
    -d "${payload}" \
    "${CONTROL_PLANE_URL}/api/v1/identities/${TARGET_USER_DID}"
  
  curl_exit_code=$?
  if [ $curl_exit_code -ne 0 ]; then
    echo "ERROR: Callback to control plane failed with curl exit code ${curl_exit_code}." >&2
    # Exit with an error code so the control plane's 'on("close")' handler can catch this
    exit 1
  else
    echo "Callback successful."
  fi
}

# --- Generate Secrets ---
# These will be passed to Helm to create Kubernetes secrets
# For production, consider a more robust secret generation/management strategy if needed.
echo "Generating secrets for instance ${INSTANCE_IDENTIFIER}..."
# Generate a 32-character alphanumeric string for passwords/secrets
generate_random_string() {
  LC_ALL=C tr -dc 'a-zA-Z0-9' < /dev/urandom | fold -w 32 | head -n 1
}
COUCHDB_USER="user_$(generate_random_string | cut -c1-8)" # Shorter username
COUCHDB_PASSWORD=$(generate_random_string)
VIBE_APP_JWT_SECRET=$(generate_random_string)

echo "Generated CouchDB User: ${COUCHDB_USER}"
# Avoid logging passwords and JWT secrets in production logs if possible
# echo "Generated CouchDB Password: ${COUCHDB_PASSWORD}"
# echo "Generated Vibe App JWT Secret: ${VIBE_APP_JWT_SECRET}"


# --- Kubernetes Namespace ---
K8S_NAMESPACE="vibe-${INSTANCE_IDENTIFIER}"
echo "Creating Kubernetes namespace: ${K8S_NAMESPACE}..."
kubectl ${KUBECONFIG_ARG} create namespace "${K8S_NAMESPACE}"
if [ $? -ne 0 ]; then
  # Check if namespace already exists (e.g., from a failed previous attempt)
  if kubectl ${KUBECONFIG_ARG} get namespace "${K8S_NAMESPACE}" >/dev/null 2>&1; then
    echo "Namespace ${K8S_NAMESPACE} already exists. Proceeding..."
  else
    echo "ERROR: Failed to create namespace ${K8S_NAMESPACE}." >&2
    callback_control_plane "failed" "" "Failed to create Kubernetes namespace ${K8S_NAMESPACE}."
    exit 1
  fi
fi

# --- Helm Deployment ---
HELM_RELEASE_NAME="vibe-${INSTANCE_IDENTIFIER}" # Same as namespace for clarity
INGRESS_HOST="${INSTANCE_IDENTIFIER}.vibeapp.dev" # Assuming vibeapp.dev is the domain

# Construct CouchDB database name (must match what vibeApp expects)
# Example: user-db-did-vibe-user123 (sanitize DID for DB name)
# This logic should mirror `getUserDbName` from control plane's identity.utils.ts or be passed
# For now, a simple prefix. Control plane should ideally pass this.
# Or, the vibeApp itself constructs it from TARGET_USER_DID.
# Let's assume vibeApp will use TARGET_USER_DID to form its DB name.
COUCHDB_DATABASE_NAME="user-db-$(echo ${TARGET_USER_DID} | sed 's/:/-/g')" # Basic sanitization

echo "Deploying Helm chart '${HELM_CHART_PATH}' for release '${HELM_RELEASE_NAME}' in namespace '${K8S_NAMESPACE}'..."
echo "Target User DID: ${TARGET_USER_DID}"
echo "Instance Identifier: ${INSTANCE_IDENTIFIER}"
echo "Ingress Host: ${INGRESS_HOST}"
echo "CouchDB Database Name (example): ${COUCHDB_DATABASE_NAME}"

helm ${KUBECONFIG_ARG} install "${HELM_RELEASE_NAME}" "${HELM_CHART_PATH}" \
  --namespace "${K8S_NAMESPACE}" \
  --create-namespace \
  --set "instanceIdentifier=${INSTANCE_IDENTIFIER}" \
  --set "ingress.host=${INGRESS_HOST}" \
  --set "secrets.create=true" \
  --set "couchdb.auth.username=${COUCHDB_USER}" \
  --set "couchdb.auth.password=${COUCHDB_PASSWORD}" \
  --set "vibeApp.auth.jwtSecret=${VIBE_APP_JWT_SECRET}" \
  --set "vibeApp.env.TARGET_USER_DID=${TARGET_USER_DID}" \
  --set "vibeApp.env.COUCHDB_DATABASE_NAME=${COUCHDB_DATABASE_NAME}" \
  --set "vibeApp.env.COUCHDB_URL=http://${HELM_RELEASE_NAME}-couchdb:5984" \
  --set "vibeApp.env.COUCHDB_USER_FROM_SECRET=true" \
  --set "vibeApp.env.COUCHDB_PASSWORD_FROM_SECRET=true" \
  --timeout 10m \
  --wait

helm_exit_code=$?

if [ $helm_exit_code -ne 0 ]; then
  echo "ERROR: Helm install failed with exit code $helm_exit_code for instance ${INSTANCE_IDENTIFIER}." >&2
  # Attempt to clean up namespace if Helm failed badly
  # kubectl ${KUBECONFIG_ARG} delete namespace "${K8S_NAMESPACE}" --ignore-not-found=true
  callback_control_plane "failed" "" "Helm deployment failed for instance ${INSTANCE_IDENTIFIER}."
  exit $helm_exit_code
fi

echo "Helm deployment for instance ${INSTANCE_IDENTIFIER} completed successfully."

# --- Post-Provisioning Steps ---
INSTANCE_URL="https://${INGRESS_HOST}"
echo "Instance URL: ${INSTANCE_URL}"

# Callback to control plane with success
callback_control_plane "completed" "${INSTANCE_URL}" ""

echo "Provisioning script finished successfully for instance ${INSTANCE_IDENTIFIER}."
exit 0
