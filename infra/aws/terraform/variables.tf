variable "project_name" {
  description = "Name prefix for SketchCatch production infrastructure."
  type        = string
  default     = "sketchcatch"
}

variable "environment" {
  description = "Deployment environment name. Phase 1 targets production but keeps the value configurable."
  type        = string
  default     = "production"
}

variable "aws_region" {
  description = "AWS region for the SketchCatch production ECS foundation."
  type        = string
  default     = "ap-northeast-2"
}

variable "vpc_id" {
  description = "Existing VPC ID where the parallel ECS ALB and Fargate tasks will run."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for the parallel ECS ALB. At least two AZs are recommended for production ALB availability."
  type        = list(string)

  validation {
    condition     = length(var.public_subnet_ids) >= 2
    error_message = "Provide at least two public subnet IDs for the ECS ALB."
  }
}

variable "ecs_service_subnet_ids" {
  description = "Subnet IDs for Fargate tasks. Defaults to public_subnet_ids when omitted to avoid NAT Gateway cost in Phase 1."
  type        = list(string)
  default     = []
}

variable "assign_public_ip" {
  description = "Assign public IPs to Fargate tasks. Default true keeps Phase 1 NAT-free; switch off only with private subnets plus VPC endpoints/NAT."
  type        = bool
  default     = true
}

variable "allowed_http_cidr_blocks" {
  description = "CIDR blocks allowed to reach the parallel ECS ALB on HTTP."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "allowed_https_cidr_blocks" {
  description = "CIDR blocks allowed to reach the parallel ECS ALB on HTTPS."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "certificate_arn" {
  description = "Existing ACM certificate ARN for HTTPS on the parallel ECS ALB. Leave empty for HTTP-only smoke before Phase 2/3."
  type        = string
  default     = ""
}

variable "create_route53_alias" {
  description = "Create a Route53 alias to the ECS ALB. Keep false during parallel cutover so the EC2 ALB remains production rollback."
  type        = bool
  default     = false
}

variable "route53_zone_id" {
  description = "Hosted zone ID used only when create_route53_alias is true."
  type        = string
  default     = ""
}

variable "route53_record_name" {
  description = "DNS name used only when create_route53_alias is true."
  type        = string
  default     = ""
}

variable "ecs_desired_count" {
  description = "Desired task count for each production API and web ECS service. Cost-bearing: 1 creates two warm tasks after the split."
  type        = number
  default     = 1
}

variable "ecs_task_cpu" {
  description = "API Fargate task CPU units, retained from the shared task sizing for migration safety. Cost-bearing."
  type        = number
  default     = 1024
}

variable "ecs_task_memory" {
  description = "API Fargate task memory MiB, retained from the shared task sizing for migration safety. Cost-bearing."
  type        = number
  default     = 2048
}

variable "api_container_cpu" {
  description = "API container CPU units within the API task."
  type        = number
  default     = 512
}

variable "api_container_memory" {
  description = "API container hard memory limit in MiB within the API task."
  type        = number
  default     = 1024
}

variable "web_task_cpu" {
  description = "Web Fargate task CPU units. Cost-bearing in addition to the API task."
  type        = number
  default     = 256
}

variable "web_task_memory" {
  description = "Web Fargate task memory MiB. Cost-bearing in addition to the API task."
  type        = number
  default     = 512
}

variable "web_container_cpu" {
  description = "Web container CPU units within the web task."
  type        = number
  default     = 256
}

variable "web_container_memory" {
  description = "Web container hard memory limit in MiB within the web task."
  type        = number
  default     = 512
}

variable "image_tag" {
  description = "Image tag shared by the steady-state API and web ECR images."
  type        = string
  default     = "latest"
}

variable "ecr_image_retention_count" {
  description = "Number of tagged images retained per ECR repository to control storage cost."
  type        = number
  default     = 20
}

variable "log_retention_days" {
  description = "CloudWatch log retention for ECS container logs. Cost-bearing."
  type        = number
  default     = 14
}

variable "enable_alb_deletion_protection" {
  description = "Enable deletion protection for the parallel ECS ALB."
  type        = bool
  default     = false
}

variable "artifact_bucket_name" {
  description = "Existing SketchCatch S3 artifact bucket used by the API runtime."
  type        = string
}

variable "rds_endpoint" {
  description = "RDS endpoint value exposed to the API runtime for diagnostics/config parity."
  type        = string
  default     = ""
}

variable "database_ssl" {
  description = "Whether API runtime should require database SSL."
  type        = bool
  default     = true
}

variable "sketchcatch_public_base_url" {
  description = "Public base URL used by the API runtime."
  type        = string
}

variable "oauth_redirect_base_url" {
  description = "OAuth redirect base URL used by the API runtime."
  type        = string
}

variable "api_environment" {
  description = "Additional non-secret API environment variables. Do not put secrets here."
  type        = map(string)
  default     = {}
  sensitive   = false

  validation {
    condition = length(setintersection(toset(keys(var.api_environment)), toset([
      "AUTH_TOKEN_SECRET",
      "CLOUDFORMATION_TEMPLATE_TOKEN_SECRET",
      "DATABASE_URL",
      "GIT_APP_PRIVATE_KEY_BASE64",
      "GIT_APP_STATE_SECRET",
      "GIT_OAUTH_CLIENT_SECRET",
      "KAKAO_OAUTH_CLIENT_SECRET",
      "NAVER_OAUTH_CLIENT_SECRET",
      "OPENAI_API_KEY",
      "REDIS_URL"
    ]))) == 0
    error_message = "Sensitive API values must be provided through api_secret_arns, not api_environment."
  }
}

variable "web_environment" {
  description = "Additional non-secret web environment variables. Do not put secrets here."
  type        = map(string)
  default     = {}
  sensitive   = false
}

variable "api_secret_arns" {
  description = "Map of sensitive API environment variable name to Secrets Manager or SSM SecureString ARN. ECS uses task definition secrets instead of generated env files."
  type        = map(string)
  default     = {}
  sensitive   = true

  validation {
    condition = length(setsubtract(toset(keys(var.api_secret_arns)), toset([
      "AUTH_TOKEN_SECRET",
      "CLOUDFORMATION_TEMPLATE_TOKEN_SECRET",
      "DATABASE_URL",
      "GIT_APP_PRIVATE_KEY_BASE64",
      "GIT_APP_STATE_SECRET",
      "GIT_OAUTH_CLIENT_SECRET",
      "KAKAO_OAUTH_CLIENT_SECRET",
      "NAVER_OAUTH_CLIENT_SECRET",
      "OPENAI_API_KEY",
      "REDIS_URL"
    ]))) == 0
    error_message = "api_secret_arns may only contain the approved ECS API secret environment names."
  }

  validation {
    condition = alltrue([
      for value_from in values(var.api_secret_arns) :
      can(regex("^arn:aws[a-zA-Z-]*:(secretsmanager|ssm):", value_from))
    ])
    error_message = "api_secret_arns values must be Secrets Manager or SSM parameter ARNs, never raw secret values."
  }
}

variable "secret_kms_key_arns" {
  description = "Optional KMS key ARNs needed to decrypt ECS task secrets."
  type        = list(string)
  default     = []
}

variable "aws_connection_role_arns" {
  description = "User-account role ARNs the SketchCatch API runtime may assume. Defaults are wildcard account IDs but constrained to SketchCatch-managed role names."
  type        = list(string)
  default = [
    "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole",
    "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole-*"
  ]
}

variable "bedrock_model_arns" {
  description = "Optional Bedrock model ARNs the API runtime may invoke. Empty by default to avoid wildcard AI permissions."
  type        = list(string)
  default     = []
}

variable "qbusiness_application_arns" {
  description = "Optional Amazon Q Business application ARNs for ChatSync. Empty by default to avoid wildcard AI permissions."
  type        = list(string)
  default     = []
}

variable "openai_model" {
  description = "OpenAI model runtime config."
  type        = string
  default     = "gpt-5.5"
}

variable "ai_billing_mode" {
  description = "AI billing mode runtime config."
  type        = string
  default     = "disabled"
}

variable "ai_daily_call_limit" {
  description = "AI daily call limit runtime config."
  type        = number
  default     = 100
}

variable "ai_rate_limit_per_minute" {
  description = "AI per-minute rate limit runtime config."
  type        = number
  default     = 10
}

variable "bedrock_credit_confirmed" {
  description = "Bedrock credit confirmation runtime flag."
  type        = bool
  default     = false
}

variable "bedrock_model_id" {
  description = "Bedrock model ID runtime config."
  type        = string
  default     = "apac.amazon.nova-pro-v1:0"
}

variable "amazon_q_enabled" {
  description = "Amazon Q runtime enablement flag."
  type        = bool
  default     = false
}

variable "amazon_q_region" {
  description = "Amazon Q runtime region."
  type        = string
  default     = "ap-northeast-2"
}

variable "amazon_q_credit_confirmed" {
  description = "Amazon Q credit confirmation runtime flag."
  type        = bool
  default     = false
}

variable "amazon_q_application_id" {
  description = "Amazon Q application ID runtime config."
  type        = string
  default     = ""
}

variable "amazon_q_user_id" {
  description = "Amazon Q user ID runtime config."
  type        = string
  default     = ""
}

variable "git_oauth_client_id" {
  description = "GitHub OAuth client ID."
  type        = string
  default     = ""
}

variable "git_app_id" {
  description = "GitHub App ID."
  type        = string
  default     = ""
}

variable "git_app_slug" {
  description = "GitHub App slug."
  type        = string
  default     = ""
}

variable "git_app_callback_url" {
  description = "GitHub App callback URL."
  type        = string
  default     = ""
}

variable "kakao_oauth_client_id" {
  description = "Kakao OAuth client ID."
  type        = string
  default     = ""
}

variable "naver_oauth_client_id" {
  description = "Naver OAuth client ID."
  type        = string
  default     = ""
}

variable "transcribe_credit_confirmed" {
  description = "Transcribe credit confirmation runtime flag."
  type        = bool
  default     = false
}

variable "transcribe_language_code" {
  description = "Transcribe language code runtime config."
  type        = string
  default     = "ko-KR"
}

variable "transcribe_media_bucket" {
  description = "Transcribe media bucket runtime config."
  type        = string
  default     = ""
}

variable "terraform_plugin_cache_dir" {
  description = "API container Terraform plugin cache directory. Phase 1 keeps ephemeral container storage."
  type        = string
  default     = "/var/cache/sketchcatch/terraform-plugin-cache"
}

variable "trivy_cache_dir" {
  description = "API container Trivy cache directory. Phase 1 keeps ephemeral container storage."
  type        = string
  default     = "/var/cache/sketchcatch/trivy"
}

variable "tags" {
  description = "Additional tags applied to managed resources."
  type        = map(string)
  default     = {}
}

variable "enable_ecs_observability_alarms" {
  description = "Create cost-bearing CloudWatch metric filters and alarms for ECS app and worker operations."
  type        = bool
  default     = false
}

variable "cloudwatch_alarm_action_arns" {
  description = "SNS topic ARNs notified by ECS CloudWatch alarms. Empty means alarms have no notification action."
  type        = list(string)
  default     = []
}

variable "ecs_log_error_alarm_threshold" {
  description = "Five-minute container error count that moves a log alarm to ALARM."
  type        = number
  default     = 1

  validation {
    condition     = var.ecs_log_error_alarm_threshold >= 1
    error_message = "ecs_log_error_alarm_threshold must be at least 1."
  }
}

variable "ecs_service_cpu_alarm_threshold" {
  description = "Average ECS service CPU percentage that triggers after three five-minute periods."
  type        = number
  default     = 80
}

variable "ecs_service_memory_alarm_threshold" {
  description = "Average ECS service memory percentage that triggers after three five-minute periods."
  type        = number
  default     = 80
}
