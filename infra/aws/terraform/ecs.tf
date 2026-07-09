resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "aws_ecs_task_definition" "app" {
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
      cpu       = var.nginx_container_cpu
      memory    = var.nginx_container_memory
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
}

resource "aws_ecs_service" "app" {
  name            = "${local.name_prefix}-app"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.ecs_desired_count
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = length(var.ecs_service_subnet_ids) == 0 ? var.public_subnet_ids : var.ecs_service_subnet_ids
    security_groups  = [aws_security_group.ecs_service.id]
    assign_public_ip = var.assign_public_ip
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.ecs.arn
    container_name   = "nginx"
    container_port   = 80
  }

  depends_on = [
    aws_lb_listener.http_forward,
    aws_lb_listener.http_redirect,
    aws_lb_listener.https
  ]
}
