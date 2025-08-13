terraform {
  backend "s3" {
    bucket                      = "vibe-terraform-state" # This bucket must be created manually
    key                         = "terraform.tfstate"
    region                      = "fr-par"
    endpoint                    = "s3.fr-par.scw.cloud"
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_metadata_api_check     = true
    force_path_style            = true
  }
  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = ">= 2.0.0"
    }
  }
}

provider "scaleway" {
  # Credentials will be provided by environment variables in the CI/CD pipeline
  # SCW_ACCESS_KEY, SCW_SECRET_KEY, SCW_DEFAULT_PROJECT_ID, SCW_DEFAULT_REGION, SCW_DEFAULT_ZONE
}

# Private Network
resource "scaleway_vpc_private_network" "vibe_pn" {
  name = "vibe-private-network"
}

# Kubernetes Cluster
resource "scaleway_k8s_cluster" "vibe_cluster" {
  name                        = "vibe-kapsule"
  version                     = var.k8s_version
  cni                         = "cilium"
  type                        = "kapsule"
  delete_additional_resources = true
  private_network_id          = "a20a26bb-d39d-41a3-9093-b3c811823944"
}

# Node Pool for the Cluster
resource "scaleway_k8s_pool" "vibe_pool" {
  cluster_id = scaleway_k8s_cluster.vibe_cluster.id
  name       = "vibe-pool-tf"
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
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD", "POST", "PUT", "DELETE"]
    allowed_origins = ["https://*.vibepublic.com", "https://*.vibe-feeds.vercel.app", "https://api.vibepublic.com"]
    max_age_seconds = 3000
    expose_headers  = ["Etag"]
  }
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