resource "aws_lb" "ecs" {
  name                       = "${local.name_prefix}-ecs"
  load_balancer_type         = "application"
  internal                   = false
  security_groups            = [aws_security_group.ecs_alb.id]
  subnets                    = var.public_subnet_ids
  enable_deletion_protection = var.enable_alb_deletion_protection
  idle_timeout               = 120
  drop_invalid_header_fields = true

  tags = {
    Name = "${local.name_prefix}-ecs"
  }
}

resource "aws_lb_target_group" "api" {
  name        = "${local.name_prefix}-api"
  vpc_id      = var.vpc_id
  port        = 4000
  protocol    = "HTTP"
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = {
    Name = "${local.name_prefix}-api"
  }
}

resource "aws_lb_target_group" "web" {
  name        = "${local.name_prefix}-web"
  vpc_id      = var.vpc_id
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/"
    protocol            = "HTTP"
    matcher             = "200-399"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = {
    Name = "${local.name_prefix}-web"
  }
}

resource "aws_lb_listener" "http_forward" {
  count = var.certificate_arn == "" ? 1 : 0

  load_balancer_arn = aws_lb.ecs.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

resource "aws_lb_listener_rule" "api_http" {
  count = var.certificate_arn == "" ? 1 : 0

  listener_arn = aws_lb_listener.http_forward[0].arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern {
      values = local.api_path_patterns
    }
  }
}

resource "aws_lb_listener" "http_redirect" {
  count = var.certificate_arn == "" ? 0 : 1

  load_balancer_arn = aws_lb.ecs.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  count = var.certificate_arn == "" ? 0 : 1

  load_balancer_arn = aws_lb.ecs.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

resource "aws_lb_listener_rule" "api_https" {
  count = var.certificate_arn == "" ? 0 : 1

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern {
      values = local.api_path_patterns
    }
  }
}

resource "aws_route53_record" "ecs_alias" {
  count = var.create_route53_alias ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.route53_record_name
  type    = "A"

  alias {
    name                   = aws_lb.ecs.dns_name
    zone_id                = aws_lb.ecs.zone_id
    evaluate_target_health = true
  }

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = var.route53_zone_id != "" && var.route53_record_name != ""
      error_message = "route53_zone_id and route53_record_name are required when create_route53_alias is true."
    }
  }
}
