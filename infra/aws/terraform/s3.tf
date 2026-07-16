data "aws_partition" "current" {}

resource "aws_s3_bucket_public_access_block" "artifact" {
  bucket = var.artifact_bucket_name

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifact" {
  bucket = var.artifact_bucket_name

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_policy" "artifact_tls_only" {
  bucket = var.artifact_bucket_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          "arn:${data.aws_partition.current.partition}:s3:::${var.artifact_bucket_name}",
          "arn:${data.aws_partition.current.partition}:s3:::${var.artifact_bucket_name}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

resource "aws_s3_bucket_cors_configuration" "artifact" {
  bucket = var.artifact_bucket_name

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = distinct(concat(
      [trimsuffix(var.sketchcatch_public_base_url, "/")],
      var.artifact_bucket_additional_cors_origins
    ))
    expose_headers  = ["ETag", "x-amz-request-id"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_versioning" "artifact" {
  bucket = var.artifact_bucket_name

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "release_candidate" {
  bucket = var.artifact_bucket_name

  depends_on = [aws_s3_bucket_versioning.artifact]

  rule {
    id     = "expire-sketchcatch-release-candidates"
    status = "Enabled"

    filter {
      tag {
        key   = "SketchCatchLifecycle"
        value = "ReleaseCandidate"
      }
    }

    expiration {
      # The application retry contract expires after 24 hours. S3 lifecycle is the
      # fail-safe for archives left behind by an interrupted worker.
      days = 1
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }

  }

  rule {
    id     = "expire-sketchcatch-release-candidate-retries"
    status = "Enabled"

    filter {
      tag {
        key   = "SketchCatchLifecycle"
        value = "ReleaseCandidateRetry"
      }
    }

    expiration {
      # A retry tag can be applied up to 24 hours after preflight. Two days from
      # object creation therefore preserves at least 24 hours after the failure.
      days = 2
    }

    noncurrent_version_expiration {
      noncurrent_days = 2
    }
  }

  rule {
    id     = "abort-incomplete-deployment-uploads"
    status = "Enabled"

    filter {
      prefix = "deployments/"
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}
