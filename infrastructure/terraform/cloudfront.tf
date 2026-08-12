# Task 9.4 — CloudFront in front of the S3 bucket.
#
# Scope note: S3StorageProvider (Phase 3) currently serves downloads via
# presigned S3 URLs / proxied through the API, not by returning a
# CloudFront URL directly -- wiring the application to emit CDN URLs
# instead is NOT part of this phase (no application code changes beyond
# configuration, per the roadmap's Phase 9 scope). This distribution is
# provisioned so it's available -- for future CDN-fronted delivery of
# public, non-sensitive assets (e.g. CMS signage media) -- without
# committing application code to depend on it yet. Using Origin Access
# Control (OAC) rather than a public bucket policy, consistent with
# keeping the S3 bucket itself fully private (see s3.tf).

resource "aws_cloudfront_origin_access_control" "hdsp" {
  name                              = "${var.project_name}-${var.environment}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "hdsp" {
  enabled             = true
  comment             = "${var.project_name}-${var.environment} object storage CDN"
  default_root_object = ""
  price_class         = "PriceClass_100" # US/Canada/Europe -- widen if serving other regions

  origin {
    domain_name              = aws_s3_bucket.hdsp.bucket_regional_domain_name
    origin_id                = "hdsp-s3-origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.hdsp.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods          = ["GET", "HEAD"]
    target_origin_id        = "hdsp-s3-origin"
    viewer_protocol_policy  = "redirect-to-https"
    compress                = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 604800
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    # Swap to acm_certificate_arn + a custom domain (e.g.
    # cdn.${var.cloud_base_domain}) once that's decided -- left on the
    # CloudFront default cert for now since no CDN-facing domain has been
    # chosen yet (see the scope note above: application code doesn't
    # depend on this distribution's URL yet).
  }
}

resource "aws_s3_bucket_policy" "hdsp_cloudfront" {
  bucket = aws_s3_bucket.hdsp.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipalReadOnly"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.hdsp.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.hdsp.arn
          }
        }
      }
    ]
  })
}
