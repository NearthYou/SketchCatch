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
  referenced_security_group_id = aws_security_group.ecs_service.id
}

resource "aws_security_group" "ecs_service" {
  name        = "${local.name_prefix}-ecs-service"
  description = "Shared API/web task security group retained to preserve existing RDS and runtime allowlists during service split."
  vpc_id      = var.vpc_id

  tags = {
    Name = "${local.name_prefix}-ecs-service"
  }
}

resource "aws_vpc_security_group_ingress_rule" "ecs_service_api_from_alb" {
  security_group_id            = aws_security_group.ecs_service.id
  description                  = "Allow ALB traffic to the API task port"
  ip_protocol                  = "tcp"
  from_port                    = 4000
  to_port                      = 4000
  referenced_security_group_id = aws_security_group.ecs_alb.id
}

resource "aws_vpc_security_group_ingress_rule" "ecs_service_web_from_alb" {
  security_group_id            = aws_security_group.ecs_service.id
  description                  = "Allow ALB traffic to the web task port"
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  referenced_security_group_id = aws_security_group.ecs_alb.id
}

resource "aws_vpc_security_group_egress_rule" "ecs_service_all" {
  security_group_id = aws_security_group.ecs_service.id
  description       = "Allow app egress to AWS APIs, RDS, Redis, OAuth providers, and artifact storage; tighten with separate API/web groups after rollback allowlists are migrated."
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
