resource "aws_security_group" "ecs_alb" {
  name        = "${local.name_prefix}-ecs-alb"
  description = "Parallel SketchCatch ECS ALB ingress. Cost-bearing ALB stays separate from EC2 rollback ALB."
  vpc_id      = var.vpc_id

  tags = {
    Name = "${local.name_prefix}-ecs-alb"
  }
}

resource "aws_vpc_security_group_ingress_rule" "ecs_alb_http" {
  for_each = toset(var.allowed_http_cidr_blocks)

  security_group_id = aws_security_group.ecs_alb.id
  description       = "Allow HTTP smoke traffic to the parallel ECS ALB"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = each.value
}

resource "aws_vpc_security_group_ingress_rule" "ecs_alb_https" {
  for_each = var.certificate_arn == "" ? toset([]) : toset(var.allowed_https_cidr_blocks)

  security_group_id = aws_security_group.ecs_alb.id
  description       = "Allow HTTPS traffic to the parallel ECS ALB"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = each.value
}

resource "aws_vpc_security_group_egress_rule" "ecs_alb_to_service" {
  security_group_id            = aws_security_group.ecs_alb.id
  description                  = "Forward ALB traffic only to ECS tasks"
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
  referenced_security_group_id = aws_security_group.ecs_service.id
}

resource "aws_vpc_security_group_egress_rule" "ecs_alb_to_api" {
  security_group_id            = aws_security_group.ecs_alb.id
  description                  = "Forward API and health paths only to the API container port"
  ip_protocol                  = "tcp"
  from_port                    = 4000
  to_port                      = 4000
  referenced_security_group_id = aws_security_group.ecs_service.id
}

resource "aws_vpc_security_group_egress_rule" "ecs_alb_to_web" {
  security_group_id            = aws_security_group.ecs_alb.id
  description                  = "Forward default application traffic only to the web container port"
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  referenced_security_group_id = aws_security_group.ecs_web.id
}

resource "aws_security_group" "ecs_service" {
  name        = "${local.name_prefix}-ecs-service"
  description = "SketchCatch ECS service tasks; nginx receives traffic only from the parallel ECS ALB."
  vpc_id      = var.vpc_id

  tags = {
    Name = "${local.name_prefix}-ecs-service"
  }
}

resource "aws_vpc_security_group_ingress_rule" "ecs_service_from_alb" {
  security_group_id            = aws_security_group.ecs_service.id
  description                  = "Allow nginx port from the parallel ECS ALB"
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
  referenced_security_group_id = aws_security_group.ecs_alb.id
}

resource "aws_vpc_security_group_ingress_rule" "ecs_service_api_from_alb" {
  security_group_id            = aws_security_group.ecs_service.id
  description                  = "Allow ALB traffic to the API task port"
  ip_protocol                  = "tcp"
  from_port                    = 4000
  to_port                      = 4000
  referenced_security_group_id = aws_security_group.ecs_alb.id
}

resource "aws_vpc_security_group_ingress_rule" "ecs_web_from_alb" {
  security_group_id            = aws_security_group.ecs_web.id
  description                  = "Allow ALB traffic to the web task port"
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  referenced_security_group_id = aws_security_group.ecs_alb.id
}

resource "aws_vpc_security_group_egress_rule" "ecs_service_all" {
  security_group_id = aws_security_group.ecs_service.id
  description       = "Allow app egress to AWS APIs, RDS, Redis, OAuth providers, and artifact storage; tighten with VPC endpoints/private runtime in a later phase."
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "ecs_web" {
  name        = "${local.name_prefix}-ecs-web"
  description = "Dedicated public web tasks with no database allowlist membership."
  vpc_id      = var.vpc_id

  tags = {
    Name = "${local.name_prefix}-ecs-web"
  }
}

resource "aws_vpc_security_group_egress_rule" "ecs_web_all" {
  security_group_id = aws_security_group.ecs_web.id
  description       = "Allow web server egress without granting database security group ingress."
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "ecs_worker" {
  name        = "${local.name_prefix}-ecs-worker"
  description = "Dedicated one-off Terraform worker tasks; no inbound traffic is permitted."
  vpc_id      = var.vpc_id

  tags = {
    Name = "${local.name_prefix}-ecs-worker"
  }
}

resource "aws_vpc_security_group_egress_rule" "ecs_worker_all" {
  security_group_id = aws_security_group.ecs_worker.id
  description       = "Allow one-off workers to reach RDS, Redis, S3, ECR, STS, and target cloud APIs."
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_ecs_worker" {
  count = var.worker_rds_security_group_id == "" ? 0 : 1

  security_group_id            = var.worker_rds_security_group_id
  description                  = "Allow SketchCatch one-off ECS workers to reach PostgreSQL"
  ip_protocol                  = "tcp"
  from_port                    = var.worker_rds_port
  to_port                      = var.worker_rds_port
  referenced_security_group_id = aws_security_group.ecs_worker.id
}