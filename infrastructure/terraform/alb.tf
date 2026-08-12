# Task 9.5 — ALB with host-based routing for subdomain-per-tenant.
#
# Routing model: HDSP is single-app multi-tenant (one API/frontend serves
# every tenant; SubdomainTenantMiddleware, Phase 8 Task 8.2, resolves
# which tenant a request belongs to from the Host header inside the
# application). So "host-based routing" here is NOT per-tenant target
# groups -- it's one wildcard host rule (*.${var.cloud_base_domain}) that
# every tenant subdomain matches, split only by path: /api/* to the API
# target group, everything else to the frontend target group. Adding a
# genuinely per-tenant ALB rule would only make sense for a future
# dedicated/isolated-tenant deployment tier (see the cost review's
# "Enterprise" tier) -- not this phase.

resource "aws_security_group" "alb" {
  name        = "${var.project_name}-${var.environment}-alb"
  description = "HDSP ALB — public HTTPS ingress"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP from internet (redirected to HTTPS below)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "hdsp" {
  name               = "${var.project_name}-${var.environment}"
  internal            = false
  load_balancer_type = "application"
  security_groups     = [aws_security_group.alb.id]
  subnets             = var.public_subnet_ids

  enable_deletion_protection = var.environment == "production"
}

resource "aws_lb_target_group" "api" {
  name        = "${var.project_name}-${var.environment}-api"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip" # required for Fargate awsvpc networking

  health_check {
    path                = "/api/health/live"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
    matcher             = "200"
  }

  deregistration_delay = 30
}

resource "aws_lb_target_group" "frontend" {
  name        = "${var.project_name}-${var.environment}-frontend"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
    matcher             = "200"
  }

  deregistration_delay = 30
}

resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.hdsp.arn
  port               = 80
  protocol           = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.hdsp.arn
  port               = 443
  protocol           = "HTTPS"
  ssl_policy          = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn     = var.acm_certificate_arn

  # Default action: frontend. Host-header restriction to
  # *.${var.cloud_base_domain} (and the bare apex) happens via the listener
  # rule below rather than here, so an unmatched Host header (e.g. the raw
  # ALB DNS name, or a scanner probing by IP) gets a 403 instead of quietly
  # serving the app -- matches the same "don't be permissive by default"
  # posture as Task 8.7's CORS wildcard-scoped-to-real-tenants design.
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not found"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener_rule" "frontend_host" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 200

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }

  condition {
    host_header {
      values = ["*.${var.cloud_base_domain}", var.cloud_base_domain]
    }
  }
}

resource "aws_lb_listener_rule" "api_host_and_path" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 100 # evaluated before the frontend catch-all

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    host_header {
      values = ["*.${var.cloud_base_domain}", var.cloud_base_domain]
    }
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}
