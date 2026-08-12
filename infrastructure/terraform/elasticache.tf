# Task 9.3 — ElastiCache Redis. Backs redis.config.ts (already
# config-driven, per the roadmap's note) plus BullMQ queues, throttling,
# and the Connector's RedisMessageTransport (Phase 6) when a Connector
# instance is deployed with connectivity to this cluster.

resource "aws_elasticache_subnet_group" "hdsp" {
  name       = "${var.project_name}-${var.environment}-redis"
  subnet_ids = var.private_subnet_ids
}

resource "aws_security_group" "redis" {
  name        = "${var.project_name}-${var.environment}-redis"
  description = "Allow Redis from ECS tasks only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Redis from ECS task security group"
    from_port       = 6379
    to_port         = 6379
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

resource "random_password" "redis_auth" {
  length  = 32
  special = false
}

# Small (pilot) tier: single node, no cluster mode -- matches
# HDSP_Cloud_Migration_Architecture_Review.md Section 17's Small-tier
# sizing. Medium tier moves to `aws_elasticache_replication_group` with
# `num_node_groups > 1` (cluster mode) -- swap this resource, don't just
# bump `redis_num_cache_nodes`, when that tier is reached.
resource "aws_elasticache_replication_group" "hdsp" {
  replication_group_id = "${var.project_name}-${var.environment}"
  description           = "HDSP Redis — BullMQ, cache, throttling, Connector Message Transport"

  engine         = "redis"
  engine_version = "7.1"
  node_type      = var.redis_node_type
  num_cache_clusters = var.redis_num_cache_nodes

  subnet_group_name = aws_elasticache_subnet_group.hdsp.name
  security_group_ids = [aws_security_group.redis.id]

  transit_encryption_enabled = true
  at_rest_encryption_enabled = true
  auth_token                  = random_password.redis_auth.result

  automatic_failover_enabled = var.redis_num_cache_nodes > 1
  snapshot_retention_limit    = 5
  snapshot_window              = "04:00-05:00"
}
