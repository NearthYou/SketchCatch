mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = jsonencode({
        Version   = "2012-10-17"
        Statement = []
      })
    }
  }
}

run "alb_path_routing" {
  command = plan

  variables {
    vpc_id                          = "vpc-0123456789abcdef0"
    public_subnet_ids               = ["subnet-11111111111111111", "subnet-22222222222222222"]
    artifact_bucket_name            = "sketchcatch-test-artifacts"
    sketchcatch_public_base_url     = "https://sketchcatch.example"
    oauth_redirect_base_url         = "https://sketchcatch.example"
    enable_ecs_observability_alarms = false
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
      repository_url = "111122223333.dkr.ecr.ap-northeast-2.amazonaws.com/sketchcatch-production-api"
    }
    override_during = plan
  }

  override_resource {
    target = aws_ecr_repository.service["web"]
    values = {
      repository_url = "111122223333.dkr.ecr.ap-northeast-2.amazonaws.com/sketchcatch-production-web"
    }
    override_during = plan
  }

  override_resource {
    target = aws_iam_role.ecs_task
    values = {
      arn = "arn:aws:iam::111122223333:role/sketchcatch-production-ecs-task"
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
    condition     = local.api_path_patterns == ["/api", "/api/*", "/health", "/health/db"]
    error_message = "API listener rules must own /api and both health paths."
  }

  assert {
    condition = (
      aws_lb_listener.http_forward[0].default_action[0].target_group_arn == aws_lb_target_group.web.arn &&
      aws_lb_listener_rule.api_http[0].action[0].target_group_arn == aws_lb_target_group.api.arn
    )
    error_message = "The HTTP listener must default to web and route API paths to the API target group."
  }

  assert {
    condition = (
      [for container in jsondecode(aws_ecs_task_definition.api.container_definitions) : container.name] == ["api"] &&
      [for container in jsondecode(aws_ecs_task_definition.web.container_definitions) : container.name] == ["web"]
    )
    error_message = "Steady-state task definitions must contain only their API or web container and no nginx."
  }

  assert {
    condition = (
      one(jsondecode(aws_ecs_task_definition.api.container_definitions)).cpu == var.ecs_task_cpu &&
      one(jsondecode(aws_ecs_task_definition.api.container_definitions)).memory == var.ecs_task_memory
    )
    error_message = "The single API container must be able to use all CPU and memory allocated to its task."
  }

  assert {
    condition = (
      one(aws_ecs_service.api.load_balancer).container_name == "api" &&
      one(aws_ecs_service.api.load_balancer).container_port == 4000 &&
      one(aws_ecs_service.web.load_balancer).container_name == "web" &&
      one(aws_ecs_service.web.load_balancer).container_port == 3000
    )
    error_message = "Each ECS service must register the matching container and port."
  }
}
run "https_alb_path_routing" {
  command = plan

  variables {
    vpc_id                      = "vpc-0123456789abcdef0"
    public_subnet_ids           = ["subnet-11111111111111111", "subnet-22222222222222222"]
    artifact_bucket_name        = "sketchcatch-test-artifacts"
    sketchcatch_public_base_url = "https://sketchcatch.example"
    oauth_redirect_base_url     = "https://sketchcatch.example"
    certificate_arn             = "arn:aws:acm:ap-northeast-2:111122223333:certificate/11111111-2222-3333-4444-555555555555"
  }

  override_resource {
    target = aws_lb_target_group.api
    values = {
      arn = "arn:aws:elasticloadbalancing:ap-northeast-2:111122223333:targetgroup/api/1234567890"
    }
    override_during = plan
  }

  override_resource {
    target = aws_lb_target_group.web
    values = {
      arn = "arn:aws:elasticloadbalancing:ap-northeast-2:111122223333:targetgroup/web/1234567890"
    }
    override_during = plan
  }

  assert {
    condition = (
      aws_lb_listener.https[0].default_action[0].target_group_arn == aws_lb_target_group.web.arn &&
      aws_lb_listener_rule.api_https[0].action[0].target_group_arn == aws_lb_target_group.api.arn &&
      aws_lb_listener.http_redirect[0].default_action[0].type == "redirect"
    )
    error_message = "HTTPS must default to web, route API paths to API, and redirect HTTP to HTTPS."
  }
}