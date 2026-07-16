mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = jsonencode({
        Version   = "2012-10-17"
        Statement = []
      })
    }
  }

  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "111122223333"
    }
  }
}

run "routes_directly_to_cost_scaled_services" {
  command = plan

  variables {
    environment                     = "test"
    vpc_id                          = "vpc-0123456789abcdef0"
    public_subnet_ids               = ["subnet-11111111111111111", "subnet-22222222222222222"]
    artifact_bucket_name            = "sketchcatch-test-artifacts"
    sketchcatch_public_base_url     = "https://sketchcatch.example"
    oauth_redirect_base_url         = "https://sketchcatch.example"
    enable_ecs_observability_alarms = false
  }

  override_resource {
    target = aws_ecs_cluster.main
    values = {
      arn  = "arn:aws:ecs:ap-northeast-2:111122223333:cluster/sketchcatch-test-cluster"
      name = "sketchcatch-test-cluster"
    }
    override_during = plan
  }

  override_resource {
    target = aws_lb_target_group.api
    values = {
      arn        = "arn:aws:elasticloadbalancing:ap-northeast-2:111122223333:targetgroup/api/1234567890"
      arn_suffix = "targetgroup/api/1234567890"
    }
    override_during = plan
  }

  override_resource {
    target = aws_lb_target_group.web
    values = {
      arn        = "arn:aws:elasticloadbalancing:ap-northeast-2:111122223333:targetgroup/web/1234567890"
      arn_suffix = "targetgroup/web/1234567890"
    }
    override_during = plan
  }

  override_resource {
    target = aws_ecr_repository.service["api"]
    values = {
      repository_url = "111122223333.dkr.ecr.ap-northeast-2.amazonaws.com/sketchcatch-test-api"
    }
    override_during = plan
  }

  override_resource {
    target = aws_ecr_repository.service["web"]
    values = {
      repository_url = "111122223333.dkr.ecr.ap-northeast-2.amazonaws.com/sketchcatch-test-web"
    }
    override_during = plan
  }

  override_resource {
    target = aws_ecr_repository.service["nginx"]
    values = {
      repository_url = "111122223333.dkr.ecr.ap-northeast-2.amazonaws.com/sketchcatch-test-nginx"
    }
    override_during = plan
  }

  override_resource {
    target = aws_security_group.ecs_worker
    values = {
      id = "sg-0123456789abcdef0"
    }
    override_during = plan
  }

  override_resource {
    target = aws_iam_role.ecs_task
    values = {
      arn = "arn:aws:iam::111122223333:role/sketchcatch-test-ecs-task"
    }
    override_during = plan
  }

  override_resource {
    target = aws_iam_role.ecs_worker_task
    values = {
      arn = "arn:aws:iam::111122223333:role/sketchcatch-test-ecs-worker-task"
    }
    override_during = plan
  }

  override_resource {
    target = aws_ecs_task_definition.worker
    values = {
      arn                  = "arn:aws:ecs:ap-northeast-2:111122223333:task-definition/sketchcatch-test-worker:1"
      arn_without_revision = "arn:aws:ecs:ap-northeast-2:111122223333:task-definition/sketchcatch-test-worker"
      family               = "sketchcatch-test-worker"
    }
    override_during = plan
  }

  assert {
    condition = (
      aws_lb_target_group.api.port == 4000 &&
      aws_lb_target_group.api.target_type == "ip" &&
      aws_lb_target_group.web.port == 3000 &&
      aws_lb_target_group.web.target_type == "ip"
    )
    error_message = "API and web target groups must use their container ports with Fargate ip targets."
  }

  assert {
    condition = (
      local.api_path_patterns == ["/api", "/api/*", "/health", "/health/db"] &&
      aws_lb_listener.http_forward[0].default_action[0].target_group_arn == aws_lb_target_group.web.arn &&
      aws_lb_listener_rule.api_http[0].action[0].target_group_arn == aws_lb_target_group.api.arn
    )
    error_message = "HTTP routing must send API/health paths to API and default traffic directly to web."
  }

  assert {
    condition = (
      length(aws_ecs_task_definition.app) == 0 &&
      aws_ecs_service.api.desired_count == 1 &&
      aws_ecs_service.web.desired_count == 1 &&
      aws_ecs_service.api.deployment_minimum_healthy_percent == 100 &&
      aws_ecs_service.api.deployment_maximum_percent == 200 &&
      aws_ecs_service.web.deployment_minimum_healthy_percent == 100 &&
      aws_ecs_service.web.deployment_maximum_percent == 200 &&
      aws_ecs_service.api.deployment_circuit_breaker[0].enable &&
      aws_ecs_service.api.deployment_circuit_breaker[0].rollback &&
      aws_ecs_service.web.deployment_circuit_breaker[0].enable &&
      aws_ecs_service.web.deployment_circuit_breaker[0].rollback
    )
    error_message = "Legacy ECS must stay absent while API/web retain safe deployment settings."
  }

  assert {
    condition = (
      aws_lb_target_group.api.deregistration_delay == "60" &&
      aws_lb_target_group.web.deregistration_delay == "30" &&
      aws_lb_target_group.api.health_check[0].interval == 10 &&
      aws_lb_target_group.web.health_check[0].interval == 10 &&
      aws_lb_target_group.api.health_check[0].healthy_threshold == 2 &&
      aws_lb_target_group.web.health_check[0].healthy_threshold == 2 &&
      aws_ecs_service.api.health_check_grace_period_seconds == 60 &&
      aws_ecs_service.web.health_check_grace_period_seconds == 30
    )
    error_message = "API and web must keep workload-specific registration, grace, and connection-draining timings."
  }

  assert {
    condition = (
      aws_appautoscaling_target.ecs_service["api"].min_capacity == 1 &&
      aws_appautoscaling_target.ecs_service["api"].max_capacity == 2 &&
      aws_appautoscaling_target.ecs_service["web"].min_capacity == 1 &&
      aws_appautoscaling_target.ecs_service["web"].max_capacity == 2
    )
    error_message = "API and web autoscaling must keep the cost-first min=1, max=2 range."
  }

  assert {
    condition = (
      contains(one(aws_s3_bucket_cors_configuration.artifact.cors_rule).allowed_origins, "https://sketchcatch.example") &&
      contains(one(aws_s3_bucket_cors_configuration.artifact.cors_rule).allowed_origins, "http://localhost:3000") &&
      contains(one(aws_s3_bucket_cors_configuration.artifact.cors_rule).allowed_methods, "PUT")
    )
    error_message = "Artifact bucket CORS must allow browser uploads from the configured public site and approved development origins."
  }
}

run "https_routes_and_enables_worker_dispatch" {
  command = plan

  override_resource {
    target = aws_ecr_repository.service["api"]
    values = {
      repository_url = "111122223333.dkr.ecr.ap-northeast-2.amazonaws.com/sketchcatch-test-api"
    }
    override_during = plan
  }

  override_resource {
    target = aws_ecr_repository.service["web"]
    values = {
      repository_url = "111122223333.dkr.ecr.ap-northeast-2.amazonaws.com/sketchcatch-test-web"
    }
    override_during = plan
  }

  override_resource {
    target = aws_ecr_repository.service["nginx"]
    values = {
      repository_url = "111122223333.dkr.ecr.ap-northeast-2.amazonaws.com/sketchcatch-test-nginx"
    }
    override_during = plan
  }

  variables {
    environment                     = "test"
    vpc_id                          = "vpc-0123456789abcdef0"
    public_subnet_ids               = ["subnet-11111111111111111", "subnet-22222222222222222"]
    artifact_bucket_name            = "sketchcatch-test-artifacts"
    sketchcatch_public_base_url     = "https://sketchcatch.example"
    oauth_redirect_base_url         = "https://sketchcatch.example"
    certificate_arn                 = "arn:aws:acm:ap-northeast-2:111122223333:certificate/11111111-2222-3333-4444-555555555555"
    enable_ecs_worker_dispatch      = true
    worker_rds_security_group_id    = "sg-0fedcba9876543210"
    runtime_cache_security_group_id = "sg-0abcdeffedcba0123"
    api_secret_arns = {
      GIT_APP_CLIENT_SECRET                      = "arn:aws:secretsmanager:ap-northeast-2:111122223333:secret:sketchcatch/test/git-app-client-secret-example"
      LIVE_OBSERVATION_CAPABILITY_CURRENT_SECRET = "arn:aws:ssm:ap-northeast-2:111122223333:parameter/sketchcatch/test/live-observation-capability-current-secret"
    }
  }

  override_resource {
    target = aws_ecs_cluster.main
    values = {
      arn  = "arn:aws:ecs:ap-northeast-2:111122223333:cluster/sketchcatch-test-cluster"
      name = "sketchcatch-test-cluster"
    }
    override_during = plan
  }

  override_resource {
    target = aws_lb_target_group.api
    values = {
      arn        = "arn:aws:elasticloadbalancing:ap-northeast-2:111122223333:targetgroup/api/1234567890"
      arn_suffix = "targetgroup/api/1234567890"
    }
    override_during = plan
  }

  override_resource {
    target = aws_lb_target_group.web
    values = {
      arn        = "arn:aws:elasticloadbalancing:ap-northeast-2:111122223333:targetgroup/web/1234567890"
      arn_suffix = "targetgroup/web/1234567890"
    }
    override_during = plan
  }

  override_resource {
    target = aws_security_group.ecs_service
    values = {
      id = "sg-0a111111111111111"
    }
    override_during = plan
  }

  override_resource {
    target = aws_security_group.ecs_worker
    values = {
      id = "sg-0123456789abcdef0"
    }
    override_during = plan
  }

  override_resource {
    target = aws_iam_role.ecs_task
    values = {
      arn = "arn:aws:iam::111122223333:role/sketchcatch-test-ecs-task"
    }
    override_during = plan
  }

  override_resource {
    target = aws_iam_role.ecs_worker_task
    values = {
      arn = "arn:aws:iam::111122223333:role/sketchcatch-test-ecs-worker-task"
    }
    override_during = plan
  }

  override_resource {
    target = aws_ecs_task_definition.worker
    values = {
      arn                  = "arn:aws:ecs:ap-northeast-2:111122223333:task-definition/sketchcatch-test-worker:1"
      arn_without_revision = "arn:aws:ecs:ap-northeast-2:111122223333:task-definition/sketchcatch-test-worker"
      family               = "sketchcatch-test-worker"
    }
    override_during = plan
  }

  assert {
    condition = (
      aws_lb_listener.https[0].default_action[0].target_group_arn == aws_lb_target_group.web.arn &&
      aws_lb_listener_rule.api_https[0].action[0].target_group_arn == aws_lb_target_group.api.arn &&
      aws_lb_listener.http_redirect[0].default_action[0].type == "redirect"
    )
    error_message = "HTTPS routing must send API paths to API and default traffic directly to web."
  }

  assert {
    condition = (
      {
        for item in one(jsondecode(aws_ecs_task_definition.api.container_definitions)).environment :
        item.name => item.value
      }.DEPLOYMENT_WORKER_MODE == "ecs" &&
      {
        for item in one(jsondecode(aws_ecs_task_definition.api.container_definitions)).environment :
        item.name => item.value
      }.SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN == aws_iam_role.ecs_task.arn
      && {
        for item in one(jsondecode(aws_ecs_task_definition.api.container_definitions)).environment :
        item.name => item.value
        }.SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARNS == join(",", [
          aws_iam_role.ecs_task.arn,
          aws_iam_role.ecs_worker_task.arn
      ])
    )
    error_message = "Worker-enabled API tasks must dispatch to ECS while publishing both runtime principals for connection trust."
  }

  assert {
    condition = (
      aws_vpc_security_group_ingress_rule.runtime_cache_from_ecs_api[0].security_group_id == var.runtime_cache_security_group_id &&
      aws_vpc_security_group_ingress_rule.runtime_cache_from_ecs_api[0].referenced_security_group_id == aws_security_group.ecs_service.id &&
      aws_vpc_security_group_ingress_rule.runtime_cache_from_ecs_api[0].from_port == var.runtime_cache_port &&
      aws_vpc_security_group_ingress_rule.runtime_cache_from_ecs_api[0].to_port == var.runtime_cache_port &&
      aws_vpc_security_group_ingress_rule.runtime_cache_from_ecs_worker[0].security_group_id == var.runtime_cache_security_group_id &&
      aws_vpc_security_group_ingress_rule.runtime_cache_from_ecs_worker[0].referenced_security_group_id == aws_security_group.ecs_worker.id
    )
    error_message = "Runtime Cache ingress must allow only the current ECS API and worker security groups on the configured Redis port."
  }

  assert {
    condition = contains(
      flatten([
        for container in jsondecode(aws_ecs_task_definition.worker.container_definitions) : [
          for secret in lookup(container, "secrets", []) : secret.name
        ]
        if container.name == "worker"
      ]),
      "GIT_APP_CLIENT_SECRET"
    )
    error_message = "Worker task definitions must receive the GitHub App client secret when it is configured for the API."
  }

  assert {
    condition = contains(
      local.ecs_api_secret_names,
      "LIVE_OBSERVATION_CAPABILITY_CURRENT_SECRET"
    )
    error_message = "Production API secret requirements must preserve the Live Observation capability secret."
  }
}
