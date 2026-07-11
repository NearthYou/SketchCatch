locals {
  create_cold_rollback = var.enable_cold_rollback ? 1 : 0
}

resource "aws_security_group" "alb" {
  count = local.create_cold_rollback

  name_prefix = "sketchcatch-cold-rollback-alb-"
  description = "Temporary ALB ingress for an approved SketchCatch cold rollback."
  vpc_id      = var.vpc_id

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  for_each = var.enable_cold_rollback ? toset(var.allowed_https_cidr_blocks) : toset([])

  security_group_id = aws_security_group.alb[0].id
  description       = "Temporary HTTPS access during cold rollback"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = each.value
}

resource "aws_vpc_security_group_egress_rule" "alb_to_instance" {
  count = local.create_cold_rollback

  security_group_id            = aws_security_group.alb[0].id
  description                  = "Forward rollback traffic to the restored EC2 instance"
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
  referenced_security_group_id = aws_security_group.instance[0].id
}

resource "aws_security_group" "instance" {
  count = local.create_cold_rollback

  name_prefix = "sketchcatch-cold-rollback-instance-"
  description = "Temporary EC2 security group for an approved SketchCatch cold rollback."
  vpc_id      = var.vpc_id

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "instance_from_alb" {
  count = local.create_cold_rollback

  security_group_id            = aws_security_group.instance[0].id
  description                  = "Allow only the temporary rollback ALB to reach nginx"
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
  referenced_security_group_id = aws_security_group.alb[0].id
}

resource "aws_vpc_security_group_egress_rule" "instance_all" {
  count = local.create_cold_rollback

  security_group_id = aws_security_group.instance[0].id
  description       = "Allow temporary restore access to SSM, S3, RDS, Redis, OAuth, and AWS APIs"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_instance" {
  for_each = var.enable_cold_rollback ? var.rds_security_group_ids : toset([])

  security_group_id            = each.value
  description                  = "Temporary PostgreSQL access from the approved cold rollback instance"
  ip_protocol                  = "tcp"
  from_port                    = var.rds_port
  to_port                      = var.rds_port
  referenced_security_group_id = aws_security_group.instance[0].id
}

resource "aws_vpc_security_group_ingress_rule" "redis_from_instance" {
  for_each = var.enable_cold_rollback ? var.redis_security_group_ids : toset([])

  security_group_id            = each.value
  description                  = "Temporary Redis access from the approved cold rollback instance"
  ip_protocol                  = "tcp"
  from_port                    = var.redis_port
  to_port                      = var.redis_port
  referenced_security_group_id = aws_security_group.instance[0].id
}

resource "aws_instance" "app" {
  count = local.create_cold_rollback

  ami                         = var.cold_rollback_ami_id
  instance_type               = var.instance_type
  subnet_id                   = var.instance_subnet_id
  associate_public_ip_address = true
  iam_instance_profile        = var.instance_profile_name
  vpc_security_group_ids      = [aws_security_group.instance[0].id]

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    encrypted             = true
    delete_on_termination = true
  }

  tags = {
    Name = "sketchcatch-cold-rollback"
  }

  lifecycle {
    precondition {
      condition = (
        var.cold_rollback_ami_id != "" &&
        var.vpc_id != "" &&
        var.instance_subnet_id != "" &&
        length(var.public_subnet_ids) >= 2 &&
        var.certificate_arn != ""
      )
      error_message = "Cold rollback requires the retained AMI, VPC, instance subnet, at least two ALB subnets, and certificate ARN."
    }
  }
}

resource "aws_lb" "rollback" {
  count = local.create_cold_rollback

  name                       = "sketchcatch-cold-rollback"
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb[0].id]
  subnets                    = var.public_subnet_ids
  enable_deletion_protection = true
}

resource "aws_lb_target_group" "rollback" {
  count = local.create_cold_rollback

  name        = "sketchcatch-cold-rollback"
  port        = 80
  protocol    = "HTTP"
  target_type = "instance"
  vpc_id      = var.vpc_id

  health_check {
    enabled             = true
    path                = "/health"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_target_group_attachment" "app" {
  count = local.create_cold_rollback

  target_group_arn = aws_lb_target_group.rollback[0].arn
  target_id        = aws_instance.app[0].id
  port             = 80
}

resource "aws_lb_listener" "https" {
  count = local.create_cold_rollback

  load_balancer_arn = aws_lb.rollback[0].arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.rollback[0].arn
  }
}
