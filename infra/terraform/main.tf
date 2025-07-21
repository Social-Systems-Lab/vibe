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

# Private Network
resource "scaleway_vpc_private_network" "vibe_pn" {
  name = "vibe-private-network"
}

# Kubernetes Cluster
resource "scaleway_k8s_cluster" "vibe_cluster" {
  name                        = "vibe-kapsule"
  version                     = "1.31.2"
  cni                         = "cilium"
  type                        = "kapsule"
  delete_additional_resources = true
  private_network_id          = scaleway_vpc_private_network.vibe_pn.id
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
  name = "vibe-user-storage"
}

resource "scaleway_object_bucket_acl" "vibe_bucket_acl" {
  bucket = scaleway_object_bucket.vibe_bucket.name
  acl    = "private"
}

# Container Registry Namespace
resource "scaleway_registry_namespace" "vibe_registry" {
  name       = "vibe-registry"
  project_id = var.scw_project_id
  is_public  = false
}

# Outputs
output "k8s_endpoint" {
  value = scaleway_k8s_cluster.vibe_cluster.apiserver_url
}

output "registry_endpoint" {
  value = scaleway_registry_namespace.vibe_registry.endpoint
}