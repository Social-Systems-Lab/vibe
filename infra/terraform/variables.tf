variable "scw_access_key" {
  description = "Scaleway access key"
  type        = string
  sensitive   = true
}

variable "scw_secret_key" {
  description = "Scaleway secret key"
  type        = string
  sensitive   = true
}

variable "scw_project_id" {
  description = "Scaleway project ID"
  type        = string
}

variable "scw_region" {
  description = "Scaleway region"
  type        = string
  default     = "fr-par"
}

variable "scw_zone" {
  description = "Scaleway zone"
  type        = string
  default     = "fr-par-1"
}

variable "k8s_version" {
  description = "Kubernetes version for the Kapsule cluster"
  type        = string
  default     = "1.31.2"
}