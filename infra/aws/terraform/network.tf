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

resource "aws_vpc_security_group_egress_rule" "ecs_service_all" {
  security_group_id = aws_security_group.ecs_service.id
  description       = "Allow app egress to AWS APIs, RDS, Redis, OAuth providers, and artifact storage; tighten with VPC endpoints/private runtime in a later phase."
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
