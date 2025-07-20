terraform {
  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = ">= 2.0.0"
    }
  }
}

provider "scaleway" {
  access_key = var.scw_access_key
  secret_key = var.scw_secret_key
  project_id = var.scw_project_id
  region     = var.scw_region
  zone       = var.scw_zone
}

# Kubernetes Cluster
resource "scaleway_k8s_cluster" "vibe_cluster" {
  name    = "vibe-kapsule"
  version = "1.28"
  cni     = "cilium"
  type    = "kapsule"
}

# Node Pool for the Cluster
resource "scaleway_k8s_pool" "vibe_pool" {
  cluster_id = scaleway_k8s_cluster.vibe_cluster.id
  name       = "vibe-pool"
  node_type  = "DEV1-M"
  size       = 2
  autohealing = true
  autoscaling = true
  min_size   = 1
  max_size   = 5
}

# Object Storage Bucket
resource "scaleway_object_bucket" "vibe_bucket" {
  name   = "vibe-user-storage"
  acl    = "private"
}

# Container Registry
resource "scaleway_container_registry" "vibe_registry" {
  name = "vibe-registry"
}

# Outputs
output "k8s_endpoint" {
  value = scaleway_k8s_cluster.vibe_cluster.apiserver_url
}

output "registry_endpoint" {
  value = scaleway_container_registry.vibe_registry.endpoint
}