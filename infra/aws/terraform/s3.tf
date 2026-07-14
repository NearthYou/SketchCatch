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
