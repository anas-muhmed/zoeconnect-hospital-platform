# Task 9.4 — S3 bucket. Backs S3StorageProvider (Phase 3, already
# implemented/tested) via STORAGE_DRIVER=s3 -- no application code change,
# per the roadmap's own note for this task. Private by default; access is
# via the backend's IAM role (S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY in
# Secrets Manager) and, for downloads, S3StorageProvider's presigned URLs
# -- not public bucket policy.

resource "aws_s3_bucket" "hdsp" {
  bucket = var.s3_bucket_name
}

resource "aws_s3_bucket_public_access_block" "hdsp" {
  bucket = aws_s3_bucket.hdsp.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls       = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "hdsp" {
  bucket = aws_s3_bucket.hdsp.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "hdsp" {
  bucket = aws_s3_bucket.hdsp.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Tenant-prefixed keys (Task 3.3) mean this bucket is already
# multi-tenant-shaped at the object-key level ("<tenantId>/<subdir>/...")
# -- no per-tenant bucket needed for the Small/Medium tiers per the cost
# review's Section 17 recommendation.
resource "aws_s3_bucket_lifecycle_configuration" "hdsp" {
  bucket = aws_s3_bucket.hdsp.id

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_iam_policy" "s3_hdsp_access" {
  name        = "${var.project_name}-${var.environment}-s3-access"
  description = "Read/write access to the HDSP object storage bucket for backend/worker task roles"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:HeadObject"]
        Resource = "${aws_s3_bucket.hdsp.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.hdsp.arn
      }
    ]
  })
}
