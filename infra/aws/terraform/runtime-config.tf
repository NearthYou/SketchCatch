locals {
  ecs_api_secrets_manager_names = toset([
    "DATABASE_URL",
    "GIT_APP_PRIVATE_KEY_BASE64",
    "GIT_APP_CLIENT_SECRET",
    "GIT_OAUTH_CLIENT_SECRET",
    "KAKAO_OAUTH_CLIENT_SECRET",
    "NAVER_OAUTH_CLIENT_SECRET",
    "OPENAI_API_KEY"
  ])

  ecs_api_ssm_secure_string_names = toset([
    "AUTH_TOKEN_SECRET",
    "CLOUDFORMATION_TEMPLATE_TOKEN_SECRET",
    "GIT_APP_STATE_SECRET",
    "LIVE_OBSERVATION_CAPABILITY_CURRENT_SECRET",
    "REDIS_URL"
  ])

  ecs_api_secret_names = setunion(
    local.ecs_api_secrets_manager_names,
    local.ecs_api_ssm_secure_string_names
  )
}
