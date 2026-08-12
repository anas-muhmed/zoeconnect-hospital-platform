output "alb_dns_name" {
  description = "Point *.${var.cloud_base_domain} and the apex at this via a CNAME/ALIAS record (Route53 or your DNS provider — not managed here, see README.md)."
  value       = aws_lb.hdsp.dns_name
}

output "ecr_backend_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend_repository_url" {
  value = aws_ecr_repository.frontend.repository_url
}

output "ecr_connector_repository_url" {
  value = aws_ecr_repository.connector.repository_url
}

output "rds_endpoint" {
  value     = aws_db_instance.hdsp.address
  sensitive = false
}

output "redis_primary_endpoint" {
  value = aws_elasticache_replication_group.hdsp.primary_endpoint_address
}

output "s3_bucket_name" {
  value = aws_s3_bucket.hdsp.bucket
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.hdsp.domain_name
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.hdsp.name
}

output "next_steps" {
  description = "Reminder printed after apply — see CLOUD_DEPLOY.md (Task 9.8) for the full staging cutover runbook."
  value = join("\n", [
    "1. Populate hdsp/jwt and hdsp/aws-notifications secrets (still REPLACE_ME placeholders).",
    "2. Point DNS: CNAME *.${var.cloud_base_domain} and ${var.cloud_base_domain} -> ${aws_lb.hdsp.dns_name}",
    "3. Build and push images to the three ECR repos above (see infrastructure/docker/*.Dockerfile).",
    "4. Run database migrations once against the RDS endpoint (npm run migration:run from a one-off task/bastion).",
    "5. Seed at least one real Tenant row with a non-null subdomain before testing cloud-mode CORS/routing (Phase 8 Tasks 8.2/8.7 both depend on a real Tenant row with a subdomain set).",
    "6. Update ECS services to the pushed image tags (or re-apply with api_image_tag/worker_image_tag/frontend_image_tag variables set).",
    "See CLOUD_DEPLOY.md for the full checklist.",
  ])
}
