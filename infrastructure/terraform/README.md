# HDSP Cloud Infrastructure — Terraform (Phase 9)

Provisions the cloud environment `HDSP_Cloud_Migration_Architecture_Review.md` and the roadmap's Phase 9 section describe: ECS Fargate (API/worker/frontend), RDS Postgres (Multi-AZ), ElastiCache Redis, S3 + CloudFront, ALB with host-based routing, and WAF.

**Scope note:** this assumes an existing VPC with public and private subnets already exists (referenced via `var.vpc_id`/`var.private_subnet_ids`/`var.public_subnet_ids`) — VPC/network topology is organization-specific and isn't one of Phase 9's eight named tasks, so it isn't created here. Supply your own VPC module or a minimal one before applying.

**Sizing:** defaults match the "Small (pilot)" tier from `HDSP_Cloud_Migration_Architecture_Review.md` Section 17 (API 2 tasks, worker 1 task, frontend 2 tasks, `db.t4g.medium` single-AZ, small ElastiCache node). Override via `terraform.tfvars` for the "Medium" tier once tenant load is known — see that section for the next tier's sizing.

## Layout

| File | Provisions |
|---|---|
| `providers.tf` | AWS provider, backend config (fill in your own S3/DynamoDB state backend) |
| `variables.tf` | All inputs — account/region, VPC references, sizing, secrets |
| `rds.tf` | RDS Postgres (Task 9.3) |
| `elasticache.tf` | ElastiCache Redis (Task 9.3) |
| `s3.tf` | S3 bucket for object storage (Task 9.4) |
| `cloudfront.tf` | CloudFront distribution in front of the S3 bucket (Task 9.4) |
| `ecr.tf` | ECR repositories for the four Dockerfiles in `infrastructure/docker/` |
| `ecs.tf` | ECS cluster + the three core services (API/worker/frontend) reading task definitions from `infrastructure/ecs/*.json` |
| `alb.tf` | ALB with host-based routing for subdomain-per-tenant (Task 9.5) |
| `waf.tf` | WAF attached to the ALB (Task 9.5) |
| `secrets.tf` | Secrets Manager secret *shells* (names/structure only — real values are never committed; see below) |
| `outputs.tf` | Connection strings, ALB DNS name, ECR repo URLs |

## What is intentionally NOT here

- **Real secret values.** `secrets.tf` creates empty `aws_secretsmanager_secret` resources with the right names/keys (matching `infrastructure/ecs/*.json`'s `secrets` blocks); populating them (DB password, JWT secrets, AWS notification credentials, etc.) is a manual or CI/CD-pipeline step, never a Terraform literal in this repo.
- **VPC/subnet creation** — see the scope note above.
- **DNS/Route53 records** — depends on which registrar/zone the real `CLOUD_BASE_DOMAIN` lives in; add once that domain is decided.
- **CI/CD automation** (image build/push/deploy) — that's Phase 12, not this phase. Applying this Terraform and pushing the first images is a manual staging cutover per `CLOUD_DEPLOY.md`.
- **Connector infrastructure** — deliberately excluded; see `infrastructure/ecs/connector-task-definition.json`'s own note on why Connector provisioning ownership is a Phase 10 decision, not Phase 9's.

## Usage

```bash
cd infrastructure/terraform
terraform init
terraform plan -var-file=staging.tfvars   # create your own staging.tfvars from variables.tf
terraform apply -var-file=staging.tfvars
```

Never attempted in this sandbox — no real AWS credentials or account exist here. This is unverified infrastructure code, consistent with this project's standing practice of not fabricating verification that can't actually happen (same posture as Phase 6/7's real-Oracle checks). Validate with `terraform validate` and a real `plan` against a real (non-production) AWS account before trusting it for a staging cutover.
