locals {
  name_prefix = "${var.project_name}-${var.environment}"

  tags = merge(
    {
      Project     = "SketchCatch"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Workstream  = "ecs-migration"
      Phase       = "phase-8-alb-path-routing"
    },
    var.tags
  )

  api_path_patterns = ["/api", "/api/*", "/health", "/health/db"]

  # The nginx repository and log group remain only for the documented ECS/EC2 rollback window.
  ecr_repositories = {
    api   = "${local.name_prefix}-api"
    web   = "${local.name_prefix}-web"
    nginx = "${local.name_prefix}-nginx"
  }

  log_group_names = {
    api    = "/sketchcatch/${var.environment}/ecs/api"
    web    = "/sketchcatch/${var.environment}/ecs/web"
    nginx  = "/sketchcatch/${var.environment}/ecs/nginx"
    worker = "/sketchcatch/${var.environment}/ecs/worker"
  }

  ecs_error_filter_patterns = {
    api    = "{ $.level = 50 }"
    web    = "?ERROR ?Error ?error"
    worker = "\"Deployment worker failed\""
  }

  api_environment = merge(
    {
      NODE_ENV                             = "production"
      PORT                                 = "4000"
      DATABASE_SSL                         = tostring(var.database_ssl)
      TF_PLUGIN_CACHE_DIR                  = var.terraform_plugin_cache_dir
      TRIVY_CACHE_DIR                      = var.trivy_cache_dir
      RDS_ENDPOINT                         = var.rds_endpoint
      AWS_REGION                           = var.aws_region
      S3_BUCKET_NAME                       = var.artifact_bucket_name
      SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN = aws_iam_role.ecs_task.arn
      SKETCHCATCH_PUBLIC_BASE_URL          = var.sketchcatch_public_base_url
      OAUTH_REDIRECT_BASE_URL              = var.oauth_redirect_base_url
      AI_BILLING_MODE                      = var.ai_billing_mode
      AI_DAILY_CALL_LIMIT                  = tostring(var.ai_daily_call_limit)
      AI_RATE_LIMIT_PER_MINUTE             = tostring(var.ai_rate_limit_per_minute)
      OPENAI_MODEL                         = var.openai_model
      BEDROCK_CREDIT_CONFIRMED             = tostring(var.bedrock_credit_confirmed)
      BEDROCK_MODEL_ID                     = var.bedrock_model_id
      AMAZON_Q_ENABLED                     = tostring(var.amazon_q_enabled)
      AMAZON_Q_REGION                      = var.amazon_q_region
      AMAZON_Q_CREDIT_CONFIRMED            = tostring(var.amazon_q_credit_confirmed)
      AMAZON_Q_APPLICATION_ID              = var.amazon_q_application_id
      AMAZON_Q_USER_ID                     = var.amazon_q_user_id
      GIT_OAUTH_CLIENT_ID                  = var.git_oauth_client_id
      GIT_APP_ID                           = var.git_app_id
      GIT_APP_SLUG                         = var.git_app_slug
      GIT_APP_CALLBACK_URL                 = var.git_app_callback_url
      KAKAO_OAUTH_CLIENT_ID                = var.kakao_oauth_client_id
      NAVER_OAUTH_CLIENT_ID                = var.naver_oauth_client_id
      TRANSCRIBE_CREDIT_CONFIRMED          = tostring(var.transcribe_credit_confirmed)
      TRANSCRIBE_LANGUAGE_CODE             = var.transcribe_language_code
      TRANSCRIBE_MEDIA_BUCKET              = var.transcribe_media_bucket
    },
    var.api_environment
  )

  web_environment = merge(
    {
      NODE_ENV                 = "production"
      PORT                     = "3000"
      HOSTNAME                 = "0.0.0.0"
      NEXT_PUBLIC_API_BASE_URL = "/api"
    },
    var.web_environment
  )
}
