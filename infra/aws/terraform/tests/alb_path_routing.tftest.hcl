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

run "warmup_keeps_legacy_routing" {
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
    target = aws_lb_target_group.ecs
    values = {
      arn        = "arn:aws:elasticloadbalancing:ap-northeast-2:111122223333:targetgroup/legacy/1234567890"
      arn_suffix = "targetgroup/legacy/1234567890"
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
    condition     = local.api_path_patterns == ["/api", "/api/*", "/health", "/health/db"]
    error_message = "API listener rules must own /api and both health paths."
  }

  assert {
    condition = (
      {
        for target in aws_lb_listener.http_forward[0].default_action[0].forward[0].target_group :
        target.arn => target.weight
      }[aws_lb_target_group.ecs.arn] == 100 &&
      {
        for target in aws_lb_listener.http_forward[0].default_action[0].forward[0].target_group :
        target.arn => target.weight
      }[aws_lb_target_group.web.arn] == 0 &&
      {
        for target in aws_lb_listener_rule.api_http[0].action[0].forward[0].target_group :
        target.arn => target.weight
      }[aws_lb_target_group.ecs.arn] == 100 &&
      {
        for target in aws_lb_listener_rule.api_http[0].action[0].forward[0].target_group :
        target.arn => target.weight
      }[aws_lb_target_group.api.arn] == 0
    )
    error_message = "Warmup must keep all traffic on legacy nginx while associating API/web targets at weight zero."
  }

  assert {
    condition = (
      one(aws_ecs_service.app.load_balancer).container_name == "nginx" &&
      one(aws_ecs_service.api.load_balancer).container_name == "api" &&
      one(aws_ecs_service.web.load_balancer).container_name == "web" &&
      aws_ecs_service.app.desired_count == 1
    )
    error_message = "Legacy rollback and split services must coexist during warmup."
  }

  assert {
    condition = (
      [for container in jsondecode(aws_ecs_task_definition.api.container_definitions) : container.name] == ["api"] &&
      [for container in jsondecode(aws_ecs_task_definition.web.container_definitions) : container.name] == ["web"]
    )
    error_message = "Split task definitions must contain only their API or web container."
  }
}

run "split_routes_and_enables_worker_dispatch" {
  command = plan

  variables {
    environment                  = "test"
    vpc_id                       = "vpc-0123456789abcdef0"
    public_subnet_ids            = ["subnet-11111111111111111", "subnet-22222222222222222"]
    artifact_bucket_name         = "sketchcatch-test-artifacts"
    sketchcatch_public_base_url  = "https://sketchcatch.example"
    oauth_redirect_base_url      = "https://sketchcatch.example"
    certificate_arn              = "arn:aws:acm:ap-northeast-2:111122223333:certificate/11111111-2222-3333-4444-555555555555"
    ecs_cutover_stage            = "split"
    enable_ecs_worker_dispatch   = true
    worker_rds_security_group_id = "sg-0fedcba9876543210"
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
    target = aws_lb_target_group.ecs
    values = {
      arn = "arn:aws:elasticloadbalancing:ap-northeast-2:111122223333:targetgroup/legacy/1234567890"
    }
    override_during = plan
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
      {
        for target in aws_lb_listener.https[0].default_action[0].forward[0].target_group :
        target.arn => target.weight
      }[aws_lb_target_group.ecs.arn] == 0 &&
      {
        for target in aws_lb_listener.https[0].default_action[0].forward[0].target_group :
        target.arn => target.weight
      }[aws_lb_target_group.web.arn] == 100 &&
      {
        for target in aws_lb_listener_rule.api_https[0].action[0].forward[0].target_group :
        target.arn => target.weight
      }[aws_lb_target_group.ecs.arn] == 0 &&
      {
        for target in aws_lb_listener_rule.api_https[0].action[0].forward[0].target_group :
        target.arn => target.weight
      }[aws_lb_target_group.api.arn] == 100 &&
      aws_lb_listener.http_redirect[0].default_action[0].type == "redirect"
    )
    error_message = "Split must route default traffic to web, API paths to API, and retain legacy at weight zero."
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
      }.SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN == aws_iam_role.ecs_worker_task.arn
    )
    error_message = "Worker-enabled API tasks must dispatch to ECS and publish the worker principal for connection trust."
  }
}