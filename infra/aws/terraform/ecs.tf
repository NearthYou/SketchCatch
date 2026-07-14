resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "aws_ecs_task_definition" "app" {
  count = 0

  family                   = "${local.name_prefix}-app"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${aws_ecr_repository.service["api"].repository_url}:${var.image_tag}"
      essential = true
      cpu       = var.legacy_api_container_cpu
      memory    = var.legacy_api_container_memory
      portMappings = [
        {
          containerPort = 4000
          hostPort      = 4000
          protocol      = "tcp"
        }
      ]
      environment = [
        for name, value in local.api_environment : {
          name  = name
          value = value
        }
        if value != ""
      ]
      secrets = [
        for name, value_from in var.api_secret_arns : {
          name      = name
          valueFrom = value_from
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs["api"].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "api"
        }
      }
    },
    {
      name      = "web"
      image     = "${aws_ecr_repository.service["web"].repository_url}:${var.image_tag}"
      essential = true
      cpu       = var.web_container_cpu
      memory    = var.web_container_memory
      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
          protocol      = "tcp"
        }
      ]
      environment = [
        for name, value in local.web_environment : {
          name  = name
          value = value
        }
        if value != ""
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs["web"].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "web"
        }
      }
    },
    {
      name      = "nginx"
      image     = "${aws_ecr_repository.service["nginx"].repository_url}:${var.image_tag}"
      essential = true
      cpu       = var.legacy_nginx_container_cpu
      memory    = var.legacy_nginx_container_memory
      portMappings = [
        {
          containerPort = 80
          hostPort      = 80
          protocol      = "tcp"
        }
      ]
      dependsOn = [
        {
          containerName = "api"
          condition     = "START"
        },
        {
          containerName = "web"
          condition     = "START"
        }
      ]
      command = [
        "/bin/sh",
        "-c",
        <<-EOT
cat > /etc/nginx/conf.d/default.conf <<'NGINX'
server {
  listen 80;
  server_name _;
  client_max_body_size 10m;

  location /api {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location = /health {
    proxy_pass http://127.0.0.1:4000/health;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location = /health/db {
    proxy_pass http://127.0.0.1:4000/health/db;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
NGINX
nginx -g 'daemon off;'
        EOT
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs["nginx"].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "nginx"
        }
      }
    }
  ])

  lifecycle {
    precondition {
      condition     = var.environment != "production" || length(setsubtract(local.ecs_api_secret_names, toset(keys(var.api_secret_arns)))) == 0
      error_message = "Production API task definitions require all approved api_secret_arns entries."
    }
  }
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name_prefix}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_task_cpu
  memory                   = var.worker_task_memory
  execution_role_arn       = aws_iam_role.ecs_worker_execution.arn
  task_role_arn            = aws_iam_role.ecs_worker_task.arn

  container_definitions = jsonencode([
    {
      name      = local.worker_container_name
      image     = "${aws_ecr_repository.service["api"].repository_url}:${var.image_tag}"
      essential = true
      cpu       = var.worker_task_cpu
      memory    = var.worker_task_memory
      command   = local.worker_command
      environment = [
        for name, value in local.worker_environment : {
          name  = name
          value = value
        }
        if value != ""
      ]
      secrets = [
        for name, value_from in local.worker_secret_arns : {
          name      = name
          valueFrom = value_from
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs["worker"].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "worker"
        }
      }
    }
  ])

  lifecycle {
    precondition {
      condition     = var.environment != "production" || length(setsubtract(local.worker_secret_names, toset(keys(local.worker_secret_arns)))) == 0
      error_message = "Worker task definition requires DATABASE_URL, REDIS_URL, and CLOUDFORMATION_TEMPLATE_TOKEN_SECRET secret ARNs."
    }

    precondition {
      condition     = !var.enable_ecs_worker_dispatch || var.worker_rds_security_group_id != ""
      error_message = "worker_rds_security_group_id is required before ECS worker dispatch can be enabled."
    }
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name_prefix}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${aws_ecr_repository.service["api"].repository_url}:${var.image_tag}"
      essential = true
      cpu       = var.api_container_cpu
      memory    = var.api_container_memory
      portMappings = [
        {
          containerPort = 4000
          hostPort      = 4000
          protocol      = "tcp"
        }
      ]
      environment = [
        for name, value in local.api_environment : {
          name  = name
          value = value
        }
        if value != ""
      ]
      secrets = [
        for name, value_from in var.api_secret_arns : {
          name      = name
          valueFrom = value_from
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs["api"].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "api"
        }
      }
    }
  ])

  lifecycle {
    precondition {
      condition     = var.environment != "production" || length(setsubtract(local.ecs_api_secret_names, toset(keys(var.api_secret_arns)))) == 0
      error_message = "Production API task definitions require all approved api_secret_arns entries."
    }
  }
}

resource "aws_ecs_task_definition" "web" {
  family                   = "${local.name_prefix}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.web_task_cpu
  memory                   = var.web_task_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_web_task.arn

  container_definitions = jsonencode([
    {
      name      = "web"
      image     = "${aws_ecr_repository.service["web"].repository_url}:${var.image_tag}"
      essential = true
      cpu       = var.web_container_cpu
      memory    = var.web_container_memory
      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
          protocol      = "tcp"
        }
      ]
      environment = [
        for name, value in local.web_environment : {
          name  = name
          value = value
        }
        if value != ""
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs["web"].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "web"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "api" {
  name                               = "${local.name_prefix}-api"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.api.arn
  desired_count                      = var.ecs_desired_count
  launch_type                        = "FARGATE"
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 60
  wait_for_steady_state              = true

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = local.ecs_service_subnet_ids
    security_groups  = [aws_security_group.ecs_service.id]
    assign_public_ip = var.assign_public_ip
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 4000
  }

  depends_on = [
    aws_lb_listener_rule.api_http,
    aws_lb_listener_rule.api_https,
    aws_iam_role_policy.ecs_execution,
    aws_iam_role_policy.ecs_task
  ]

  lifecycle {
    ignore_changes = [desired_count, task_definition]
  }
}

resource "aws_ecs_service" "web" {
  name                               = "${local.name_prefix}-web"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.web.arn
  desired_count                      = var.ecs_desired_count
  launch_type                        = "FARGATE"
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 30
  wait_for_steady_state              = true

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = local.ecs_service_subnet_ids
    security_groups  = [aws_security_group.ecs_web.id]
    assign_public_ip = var.assign_public_ip
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }

  depends_on = [
    aws_lb_listener.http_forward,
    aws_lb_listener.http_redirect,
    aws_lb_listener.https,
    aws_iam_role_policy.ecs_execution,
    aws_iam_role_policy.ecs_task
  ]

  lifecycle {
    ignore_changes = [desired_count, task_definition]
  }
}
