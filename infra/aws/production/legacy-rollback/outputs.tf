output "cold_rollback" {
  description = "Temporary restore endpoints. Route53 stays outside this state and changes only after direct smoke."
  value = var.enable_cold_rollback ? {
    instance_id                = aws_instance.app[0].id
    instance_security_group_id = aws_security_group.instance[0].id
    alb_arn                    = aws_lb.rollback[0].arn
    alb_dns_name               = aws_lb.rollback[0].dns_name
    alb_zone_id                = aws_lb.rollback[0].zone_id
    target_group_arn           = aws_lb_target_group.rollback[0].arn
  } : null
}
