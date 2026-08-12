# Task 9.2/9.6 — ECS Fargate cluster + the three core services (API,
# worker, frontend). Task definitions here are the Terraform-managed
# source of truth; infrastructure/ecs/*.json are the human-readable,
# heavily-annotated reference versions of the same shape (useful for a
# manual `aws ecs register-task-definition` or for a future CI/CD
# pipeline, Phase 12) -- kept in sync by hand for now, not templated from
# one into the other, to avoid a fragile JSON-comment-stripping step.

resource "aws_ecs_cluster" "hdsp" {
  name = "${var.project_name}-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_security_group" "ecs_tasks" {
  name        = "${var.project_name}-${var.environment}-ecs-tasks"
  description = "HDSP ECS tasks (api/worker/frontend)"
  vpc_id      = var.vpc_id

  ingress {
    description     = "From ALB only"
    from_port       = 0
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ── IAM ──────────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "ecs_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "${var.project_name}-ecs-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Execution role also needs to read the Secrets Manager entries referenced
# in each task definition's `secrets` block (that's how the container gets
# DB_PASSWORD etc. injected at start -- the execution role reads them, not
# the task role).
resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "read-hdsp-secrets"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:hdsp/*"
    }]
  })
}

resource "aws_iam_role" "api_task" {
  name               = "${var.project_name}-api-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json
}

resource "aws_iam_role" "worker_task" {
  name               = "${var.project_name}-worker-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json
}

resource "aws_iam_role" "frontend_task" {
  name               = "${var.project_name}-frontend-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json
}

# API and worker both need S3 (StorageModule) and SES/SNS (Cloud
# notification provider) access -- frontend needs neither.
resource "aws_iam_role_policy_attachment" "api_s3" {
  role       = aws_iam_role.api_task.name
  policy_arn = aws_iam_policy.s3_hdsp_access.arn
}

resource "aws_iam_role_policy_attachment" "worker_s3" {
  role       = aws_iam_role.worker_task.name
  policy_arn = aws_iam_policy.s3_hdsp_access.arn
}

resource "aws_iam_role_policy" "notifications_ses_sns" {
  for_each = { api = aws_iam_role.api_task.id, worker = aws_iam_role.worker_task.id }
  name     = "ses-sns-access"
  role     = each.value

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendEmail", "ses:SendRawEmail", "sns:Publish"]
      Resource = "*"
    }]
  })
}

# ── Task definitions ─────────────────────────────────────────────────────────

locals {
  common_secrets = [
    { name = "DB_HOST", valueFrom = "${aws_secretsmanager_secret.rds_connection.arn}:host::" },
    { name = "DB_PORT", valueFrom = "${aws_secretsmanager_secret.rds_connection.arn}:port::" },
    { name = "DB_NAME", valueFrom = "${aws_secretsmanager_secret.rds_connection.arn}:dbname::" },
    { name = "DB_USER", valueFrom = "${aws_secretsmanager_secret.rds_connection.arn}:username::" },
    { name = "DB_PASSWORD", valueFrom = "${aws_secretsmanager_secret.rds_connection.arn}:password::" },
    { name = "REDIS_HOST", valueFrom = "${aws_secretsmanager_secret.elasticache_connection.arn}:host::" },
    { name = "REDIS_PORT", valueFrom = "${aws_secretsmanager_secret.elasticache_connection.arn}:port::" },
    { name = "REDIS_PASSWORD", valueFrom = "${aws_secretsmanager_secret.elasticache_connection.arn}:authToken::" },
    { name = "JWT_SECRET", valueFrom = "${aws_secretsmanager_secret.jwt.arn}:secret::" },
    { name = "JWT_REFRESH_SECRET", valueFrom = "${aws_secretsmanager_secret.jwt.arn}:refreshSecret::" },
    # Cloud Tenant Onboarding -- see CLOUD_TENANT_ONBOARDING_DESIGN.md /
    # VendorPortalApiKeyGuard. Only the api service actually serves
    # TenantProvisioningController; harmless as a no-op env var on the
    # worker service (same treatment as every other common_secrets entry
    # the worker doesn't specifically use).
    { name = "VENDOR_PORTAL_API_KEY", valueFrom = "${aws_secretsmanager_secret.jwt.arn}:vendorPortalApiKey::" },
    { name = "S3_BUCKET", valueFrom = "${aws_secretsmanager_secret.app_config.arn}:s3Bucket::" },
    { name = "AWS_ACCESS_KEY_ID", valueFrom = "${aws_secretsmanager_secret.aws_notifications.arn}:accessKeyId::" },
    { name = "AWS_SECRET_ACCESS_KEY", valueFrom = "${aws_secretsmanager_secret.aws_notifications.arn}:secretAccessKey::" },
    { name = "SES_FROM_EMAIL", valueFrom = "${aws_secretsmanager_secret.aws_notifications.arn}:sesFromEmail::" },
    { name = "CONNECTOR_REDIS_URL", valueFrom = "${aws_secretsmanager_secret.elasticache_connection.arn}:connectorUrl::" },
    { name = "CLOUD_BASE_DOMAIN", valueFrom = "${aws_secretsmanager_secret.app_config.arn}:cloudBaseDomain::" },
  ]

  common_environment = [
    { name = "NODE_ENV", value = "production" },
    { name = "DEPLOYMENT_MODE", value = "cloud" },
    { name = "LOG_TO_STDOUT", value = "true" },
    { name = "STORAGE_DRIVER", value = "s3" },
    { name = "S3_REGION", value = var.aws_region },
    { name = "ORACLE_TRANSPORT", value = "cloud_relay" },
    { name = "LICENSE_PROVIDER_MODE", value = "subscription" },
    { name = "NOTIFICATION_PROVIDER_MODE", value = "cloud" },
    { name = "REDIS_TLS", value = "true" },
  ]
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project_name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn             = aws_iam_role.api_task.arn

  container_definitions = jsonencode([{
    name         = "hdsp-api"
    image        = "${aws_ecr_repository.backend.repository_url}:${var.api_image_tag}"
    essential    = true
    portMappings = [{ containerPort = 3001, protocol = "tcp" }]
    environment  = concat(local.common_environment, [{ name = "PORT", value = "3001" }])
    secrets      = local.common_secrets
    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:3001/api/health/live || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "api"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.project_name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn             = aws_iam_role.worker_task.arn

  container_definitions = jsonencode([{
    name        = "hdsp-worker"
    image       = "${aws_ecr_repository.backend.repository_url}:${var.worker_image_tag}"
    essential   = true
    environment = concat(local.common_environment, [{ name = "PROCESS_ROLE", value = "worker" }])
    secrets     = local.common_secrets
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.worker.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "worker"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "frontend" {
  family                   = "${var.project_name}-frontend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn             = aws_iam_role.frontend_task.arn

  container_definitions = jsonencode([{
    name         = "hdsp-frontend"
    image        = "${aws_ecr_repository.frontend.repository_url}:${var.frontend_image_tag}"
    essential    = true
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "3000" },
      { name = "NEXT_TELEMETRY_DISABLED", value = "1" },
    ]
    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:3000/ || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.frontend.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "frontend"
      }
    }
  }])
}

# ── Services ───────────────────────────────────────────────────────────────

resource "aws_ecs_service" "api" {
  name            = "${var.project_name}-api"
  cluster         = aws_ecs_cluster.hdsp.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name    = "hdsp-api"
    container_port     = 3001
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent          = 200

  depends_on = [aws_lb_listener.https]
}

resource "aws_ecs_service" "worker" {
  name            = "${var.project_name}-worker"
  cluster         = aws_ecs_cluster.hdsp.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.worker_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  # No load_balancer block -- never attached to the ALB target group, see
  # worker-task-definition.json's own notes on why.
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent          = 200
}

resource "aws_ecs_service" "frontend" {
  name            = "${var.project_name}-frontend"
  cluster         = aws_ecs_cluster.hdsp.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = var.frontend_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name    = "hdsp-frontend"
    container_port     = 3000
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent          = 200

  depends_on = [aws_lb_listener.https]
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/hdsp-api"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/hdsp-worker"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/hdsp-frontend"
  retention_in_days = 30
}
