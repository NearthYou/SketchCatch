locals {
  name_prefix = "${var.project_name}-${var.environment}"

  ecs_service_subnet_ids = length(var.ecs_service_subnet_ids) == 0 ? var.public_subnet_ids : var.ecs_service_subnet_ids
  worker_container_name  = "worker"
  worker_command         = ["node", "dist/deployment-worker.cjs"]

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

  # The last verified nginx image remains available for the cold rollback artifact.
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
    web    = "?ERROR ?Error ?error -\"Failed to find Server Action\""
    worker = "\"Deployment worker failed\""
  }

  api_base_environment = {
    NODE_ENV                               = "production"
    PORT                                   = "4000"
    DATABASE_SSL                           = tostring(var.database_ssl)
    TF_PLUGIN_CACHE_DIR                    = var.terraform_plugin_cache_dir
    TRIVY_CACHE_DIR                        = var.trivy_cache_dir
    RDS_ENDPOINT                           = var.rds_endpoint
    AWS_REGION                             = var.aws_region
    S3_BUCKET_NAME                         = var.artifact_bucket_name
    SKETCHCATCH_PUBLIC_BASE_URL            = var.sketchcatch_public_base_url
    OAUTH_REDIRECT_BASE_URL                = var.oauth_redirect_base_url
    AI_BILLING_MODE                        = var.ai_billing_mode
    AI_DAILY_CALL_LIMIT                    = tostring(var.ai_daily_call_limit)
    AI_RATE_LIMIT_PER_MINUTE               = tostring(var.ai_rate_limit_per_minute)
    AI_ARCHITECTURE_REQUIREMENT_NORMALIZER = var.ai_architecture_requirement_normalizer
    OPENAI_MODEL                           = var.openai_model
    BEDROCK_CREDIT_CONFIRMED               = tostring(var.bedrock_credit_confirmed)
    BEDROCK_MODEL_ID                       = var.bedrock_model_id
    AMAZON_Q_ENABLED                       = tostring(var.amazon_q_enabled)
    AMAZON_Q_REGION                        = var.amazon_q_region
    AMAZON_Q_CREDIT_CONFIRMED              = tostring(var.amazon_q_credit_confirmed)
    AMAZON_Q_APPLICATION_ID                = var.amazon_q_application_id
    AMAZON_Q_RETRIEVAL_APPLICATION_ID      = var.amazon_q_retrieval_application_id
    AMAZON_Q_USER_ID                       = var.amazon_q_user_id
    GIT_OAUTH_CLIENT_ID                    = var.git_oauth_client_id
    GIT_APP_ID                             = var.git_app_id
    GIT_APP_CLIENT_ID                      = var.git_app_client_id
    GIT_APP_SLUG                           = var.git_app_slug
    GIT_APP_CALLBACK_URL                   = var.git_app_callback_url
    KAKAO_OAUTH_CLIENT_ID                  = var.kakao_oauth_client_id
    NAVER_OAUTH_CLIENT_ID                  = var.naver_oauth_client_id
    TRANSCRIBE_CREDIT_CONFIRMED            = tostring(var.transcribe_credit_confirmed)
    TRANSCRIBE_LANGUAGE_CODE               = var.transcribe_language_code
    TRANSCRIBE_MEDIA_BUCKET                = var.transcribe_media_bucket
  }

  api_environment = merge(
    local.api_base_environment,
    {
      LIVE_OBSERVATION_ENABLED             = tostring(var.live_observation_enabled)
      SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN = aws_iam_role.ecs_task.arn
      SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARNS = join(",", compact([
        aws_iam_role.ecs_task.arn,
        var.enable_ecs_worker_dispatch ? aws_iam_role.ecs_worker_task.arn : ""
      ]))
    },
    var.enable_ecs_worker_dispatch ? {
      DEPLOYMENT_WORKER_MODE        = "ecs"
      ECS_WORKER_ASSIGN_PUBLIC_IP   = var.assign_public_ip ? "ENABLED" : "DISABLED"
      ECS_WORKER_CLUSTER            = aws_ecs_cluster.main.arn
      ECS_WORKER_COMMAND            = jsonencode(local.worker_command)
      ECS_WORKER_CONTAINER_NAME     = local.worker_container_name
      ECS_WORKER_ENVIRONMENT        = jsonencode({})
      ECS_WORKER_SECURITY_GROUP_IDS = aws_security_group.ecs_worker.id
      ECS_WORKER_SUBNETS            = join(",", local.ecs_service_subnet_ids)
      ECS_WORKER_TASK_DEFINITION    = aws_ecs_task_definition.worker.arn
    } : {},
    var.api_environment
  )

  worker_environment = merge(
    local.api_base_environment,
    {
      SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN = aws_iam_role.ecs_worker_task.arn
      SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARNS = join(",", [
        aws_iam_role.ecs_worker_task.arn,
        aws_iam_role.ecs_task.arn
      ])
    }
  )

  worker_secret_names = toset([
    "CLOUDFORMATION_TEMPLATE_TOKEN_SECRET",
    "DATABASE_URL",
    "REDIS_URL"
  ])

  worker_secret_arns = {
    for name, value_from in var.api_secret_arns : name => value_from
    if contains(local.worker_secret_names, name)
  }

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
