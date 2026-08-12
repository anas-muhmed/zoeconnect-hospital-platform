# Task 9.5 — WAF attached to the ALB. Managed rule groups only for this
# pass (no custom rules) -- a reasonable pilot-tier baseline per the cost
# review's Section 17 (WAF spend explicitly deferred for the Small tier
# there, but the roadmap's Task 9.5 names it explicitly, so it's included
# here; drop the aws_wafv2_web_acl_association below if cost-deferring it
# for a pilot specifically).

resource "aws_wafv2_web_acl" "hdsp" {
  name  = "${var.project_name}-${var.environment}"
  scope = "REGIONAL" # ALB, not CloudFront (CloudFront's own WAF would need scope=CLOUDFRONT in us-east-1)

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                 = "hdsp-common-rules"
      sampled_requests_enabled    = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                 = "hdsp-known-bad-inputs"
      sampled_requests_enabled    = true
    }
  }

  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 3
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                 = "hdsp-sqli-rules"
      sampled_requests_enabled    = true
    }
  }

  # Rate limiting is a coarse, IP-based backstop here -- it does not
  # replace the application's own per-account THROTTLE_TTL/THROTTLE_LIMIT
  # and LOGIN_THROTTLE_* config (env.validation.ts), which stays the
  # primary defense against credential-stuffing/abuse at the account
  # level. This catches high-volume single-source traffic before it even
  # reaches the ALB target groups.
  rule {
    name     = "RateLimitPerIP"
    priority = 4
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 2000 # requests per 5-minute window per source IP
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                 = "hdsp-rate-limit"
      sampled_requests_enabled    = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                 = "hdsp-waf"
    sampled_requests_enabled    = true
  }
}

resource "aws_wafv2_web_acl_association" "hdsp_alb" {
  resource_arn = aws_lb.hdsp.arn
  web_acl_arn  = aws_wafv2_web_acl.hdsp.arn
}
