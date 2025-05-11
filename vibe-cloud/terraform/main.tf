# Block 1: Terraform Configuration
terraform {
  required_providers {
    scaleway = {
      source = "scaleway/scaleway" # Specifies the official Scaleway provider from the Terraform Registry
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11" # Use a recent version
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.20" # Use a recent version
    }
    kubectl = {
      source  = "gavinbunney/kubectl"
      version = "~> 1.14"
    }
  }
  required_version = ">= 0.13" # Specifies the minimum Terraform version required
}

provider "helm" {
  kubernetes {
    host                   = scaleway_k8s_cluster.vibe-cluster.kubeconfig[0].host
    token                  = scaleway_k8s_cluster.vibe-cluster.kubeconfig[0].token
    cluster_ca_certificate = base64decode(scaleway_k8s_cluster.vibe-cluster.kubeconfig[0].cluster_ca_certificate)
  }
}

provider "kubernetes" {
  host                   = scaleway_k8s_cluster.vibe-cluster.kubeconfig[0].host
  token                  = scaleway_k8s_cluster.vibe-cluster.kubeconfig[0].token
  cluster_ca_certificate = base64decode(scaleway_k8s_cluster.vibe-cluster.kubeconfig[0].cluster_ca_certificate)
}

provider "kubectl" {
  host                   = scaleway_k8s_cluster.vibe-cluster.kubeconfig[0].host
  token                  = scaleway_k8s_cluster.vibe-cluster.kubeconfig[0].token
  cluster_ca_certificate = base64decode(scaleway_k8s_cluster.vibe-cluster.kubeconfig[0].cluster_ca_certificate)
  load_config_file       = false # Important: we are providing config directly
}

# Block 2: Input Variable (Project ID)
# Note: The variable name here is a UUID. It should ideally be a descriptive name like "project_id".
# The quickstart guide likely intended for you to replace this with "project_id" and then provide your actual Project ID.
variable "project_id" { # This should be named "project_id"
  type        = string
  description = "Scaleway Project ID" # Description should also be more meaningful, e.g., "Scaleway Project ID"
  # You would typically provide a default value or pass this value in when running terraform apply.
  # If not provided and no default, Terraform will prompt you for it.
  # If your Scaleway CLI is configured with a default project_id, the provider might pick that up if this variable isn't explicitly set.
}

# Block 3: Scaleway VPC Private Network Resource
resource "scaleway_vpc_private_network" "vibe-pn" {
  name = "vibe-private-network" # The name of the Private Network to be created in your Scaleway project
  # This creates an isolated network for your resources.
}

# Block 4: Scaleway Kubernetes Kapsule Cluster Resource
resource "scaleway_k8s_cluster" "vibe-cluster" {
  name    = "vibe-cluster"         # The name for your Kubernetes cluster
  type    = "kapsule"            # Specifies the type of cluster (Scaleway's managed K8s is Kapsule)
  version = "1.31.2"             # The Kubernetes version for the cluster
  cni     = "cilium"             # The Container Network Interface (CNI) plugin to use (Cilium is a good default)
  
  # Associates this cluster with the Private Network created in Block 3.
  # `scaleway_vpc_private_network.vibe-pn.id` references the 'id' attribute of the 'vibe-pn' private network resource.
  private_network_id = scaleway_vpc_private_network.vibe-pn.id 
  
  # When true, deleting the cluster via Terraform would also delete associated resources like Load Balancers, Volumes.
  # Setting to 'false' means you'd have to manage deletion of those separately if they exist, or Terraform might error if they block cluster deletion.
  # For a clean setup/teardown, 'true' is often preferred for non-production.
  delete_additional_resources = false 
}

# Block 5: Scaleway Kubernetes Node Pool Resource
resource "scaleway_k8s_pool" "vibe-pool" {
  # Associates this node pool with the Kubernetes cluster created in Block 4.
  # `scaleway_k8s_cluster.vibe-cluster.id` references the 'id' attribute of the 'vibe-cluster' resource.
  cluster_id  = scaleway_k8s_cluster.vibe-cluster.id 
  
  name        = "vibe-pool"          # The name for this node pool
  node_type   = "DEV1-M"           # The type/size of Scaleway instances to use as worker nodes (e.g., DEV1-M is 3 vCPUs, 4GB RAM)
  size        = 1                  # The initial (and desired, if not autoscaling) number of nodes in the pool
  
  min_size    = 0                  # Minimum number of nodes for autoscaling (0 means it can scale down to zero nodes)
  max_size    = 1                  # Maximum number of nodes for autoscaling
  autoscaling = true               # Enables node autoscaling for this pool
  autohealing = true               # Enables autohealing (automatic replacement of unhealthy nodes)
}

output "kubeconfig" {
  value     = scaleway_k8s_cluster.vibe-cluster.kubeconfig
  sensitive = true # Marks the output as sensitive, so Terraform won't show it in plain logs
}

# --- Helm Releases for Ingress Nginx and Cert-Manager ---

# Namespace for Ingress Nginx
resource "kubernetes_namespace" "ingress_nginx_ns" {
  metadata {
    name = "ingress-nginx"
  }
}

# Ingress Nginx Helm Release
resource "helm_release" "ingress_nginx" {
  name       = "ingress-nginx"
  repository = "https://kubernetes.github.io/ingress-nginx"
  chart      = "ingress-nginx"
  namespace  = kubernetes_namespace.ingress_nginx_ns.metadata[0].name
  version    = "4.10.0" # Specify a version for consistency
  timeout    = 600      # Increase timeout to 10 minutes

  set {
    name  = "controller.service.annotations.service\\.beta\\.kubernetes\\.io/scw-loadbalancer-id"
    value = "" # For Scaleway, to provision a new LoadBalancer
    type  = "string"
  }
  # Add other necessary values for ingress-nginx if needed
  # For example, if you need to set a specific ingress class:
  # set {
  #   name  = "controller.ingressClassResource.name"
  #   value = "nginx" # This will be the IngressClassName
  # }
  # set {
  #   name = "controller.ingressClassResource.default"
  #   value = "true" # Make this the default ingress class
  # }

  depends_on = [
    scaleway_k8s_pool.vibe-pool, # Ensure cluster is ready
    kubernetes_namespace.ingress_nginx_ns
  ]
}

# Namespace for Cert-Manager
resource "kubernetes_namespace" "cert_manager_ns" {
  metadata {
    name = "cert-manager"
  }
}

# Cert-Manager Helm Release
resource "helm_release" "cert_manager" {
  name       = "cert-manager"
  repository = "https://charts.jetstack.io"
  chart      = "cert-manager"
  namespace  = kubernetes_namespace.cert_manager_ns.metadata[0].name
  version    = "v1.14.5" # Specify a version for consistency

  set {
    name  = "installCRDs"
    value = "true"
  }
  set {
    name  = "prometheus.enabled" # Disable prometheus if not used
    value = "false"
  }

  depends_on = [
    scaleway_k8s_pool.vibe-pool, # Ensure cluster is ready
    kubernetes_namespace.cert_manager_ns
  ]
}

# --- ClusterIssuer for Cert-Manager ---

variable "letsencrypt_email" {
  type        = string
  description = "Email address for Let's Encrypt registration."
  # TODO: Provide a default or pass this variable during apply
  # default     = "your-email@example.com"
}

data "kubectl_file_documents" "letsencrypt_clusterissuer_docs" {
    content = <<-EOT
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ${var.letsencrypt_email}
    privateKeySecretRef:
      name: letsencrypt-prod-private-key
    solvers:
    - http01:
        ingress:
          # The class field is deprecated in newer cert-manager versions with networking.k8s.io/v1 Ingress.
          # ingressClassName is preferred.
          # Ensure this matches the IngressClass created by your Nginx Ingress controller.
          # If Nginx Ingress controller creates an IngressClass named 'nginx', use that.
          ingressClassName: nginx
EOT
}

resource "kubectl_manifest" "letsencrypt_clusterissuer" {
  for_each  = data.kubectl_file_documents.letsencrypt_clusterissuer_docs.manifests
  yaml_body = each.value

  depends_on = [
    helm_release.cert_manager # Ensure cert-manager CRDs are installed
  ]
}
