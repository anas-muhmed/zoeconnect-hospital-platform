variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment name (staging | production). Roadmap's Task 9.8 requires staging validated first."
  type        = string
  default     = "staging"
}

variable "project_name" {
  type    = string
  default = "hdsp"
}

# ── Networking (existing VPC — see README.md's scope note) ────────────────
variable "vpc_id" {
  description = "Existing VPC ID to deploy into."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs (RDS, ElastiCache, ECS tasks)."
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "Public subnet IDs (ALB)."
  type        = list(string)
}

# ── RDS (Task 9.3) ──────────────────────────────────────────────────────────
variable "rds_instance_class" {
  description = "Small (pilot) tier default per HDSP_Cloud_Migration_Architecture_Review.md Section 17."
  type        = string
  default     = "db.t4g.medium"
}

variable "rds_multi_az" {
  description = "Roadmap Task 9.3 calls for Multi-AZ; the pilot cost table treats single-AZ as acceptable during pilot only. Default true (roadmap-literal); override to false only for a cost-constrained pilot, explicitly."
  type        = bool
  default     = true
}

variable "rds_allocated_storage_gb" {
  type    = number
  default = 50
}

variable "db_name" {
  type    = string
  default = "hdsp_db"
}

variable "db_master_username" {
  type    = string
  default = "hdsp_app"
}

# ── ElastiCache (Task 9.3) ───────────────────────────────────────────────────
variable "redis_node_type" {
  type    = string
  default = "cache.t4g.small"
}

variable "redis_num_cache_nodes" {
  description = "Small tier: single node. Medium tier moves to cluster mode (2+ nodes) per the cost review's next tier."
  type        = number
  default     = 1
}

# ── ECS (Task 9.2/9.6) ───────────────────────────────────────────────────────
variable "api_desired_count" {
  type    = number
  default = 2
}

variable "worker_desired_count" {
  description = "Keep at 1 -- see infrastructure/ecs/worker-task-definition.json's _scaling_note on why scaling this beyond 1 needs a distributed cron lock first."
  type        = number
  default     = 1
}

variable "frontend_desired_count" {
  type    = number
  default = 2
}

variable "api_image_tag" {
  type    = string
  default = "latest"
}

variable "worker_image_tag" {
  type    = string
  default = "latest"
}

variable "frontend_image_tag" {
  type    = string
  default = "latest"
}

# ── S3 / CloudFront (Task 9.4) ────────────────────────────────────────────────
variable "s3_bucket_name" {
  description = "Must be globally unique. Backs StorageModule's already-implemented S3StorageProvider (Phase 3) via STORAGE_DRIVER=s3."
  type        = string
}

# ── ALB / DNS (Task 9.5) ──────────────────────────────────────────────────────
variable "cloud_base_domain" {
  description = "Matches CLOUD_BASE_DOMAIN (Phase 8, Task 8.7) -- the base domain tenant subdomains resolve under, e.g. hdsp.example.com."
  type        = string
}

variable "acm_certificate_arn" {
  description = "ACM cert covering *.${cloud_base_domain} and ${cloud_base_domain} -- must be issued/validated before applying (DNS validation, outside Terraform's scope here since it depends on your DNS zone)."
  type        = string
}
