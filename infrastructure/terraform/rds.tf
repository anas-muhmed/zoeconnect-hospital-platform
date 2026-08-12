# Task 9.3 — RDS Postgres (Multi-AZ). Connection details flow to the
# backend/worker ECS tasks via Secrets Manager (secrets.tf), read by the
# already-config-driven database.config.ts -- no application code change
# needed, per the roadmap's own note for this task.

resource "aws_db_subnet_group" "hdsp" {
  name       = "${var.project_name}-${var.environment}-db"
  subnet_ids = var.private_subnet_ids
}

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-${var.environment}-rds"
  description = "Allow Postgres from ECS tasks only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Postgres from ECS task security group"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "random_password" "db_master" {
  length  = 32
  special = false # avoid characters that need extra escaping in connection strings / Secrets Manager JSON
}

resource "aws_db_instance" "hdsp" {
  identifier     = "${var.project_name}-${var.environment}"
  engine         = "postgres"
  engine_version = "15"

  instance_class        = var.rds_instance_class
  allocated_storage      = var.rds_allocated_storage_gb
  storage_type           = "gp3"
  storage_encrypted      = true
  multi_az               = var.rds_multi_az

  db_name  = var.db_name
  username = var.db_master_username
  password = random_password.db_master.result
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.hdsp.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = 7
  backup_window            = "03:00-04:00"
  maintenance_window       = "mon:04:30-mon:05:30"

  deletion_protection      = var.environment == "production"
  skip_final_snapshot      = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${var.project_name}-${var.environment}-final" : null

  performance_insights_enabled = true
}

# Schema/migrations note (Task 9.3, roadmap's own text): "RDS is
# provisioned with the schema Phase 1 already defined" -- no migration
# resource here. Run `npm run migration:run` against this instance once
# (from a one-off ECS task or a bastion), same as DEPLOY.md's self-hosted
# runbook §3, not via Terraform.
