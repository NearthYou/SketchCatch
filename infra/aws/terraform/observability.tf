# CloudWatch metric filters and alarms create ongoing custom metric/alarm cost.
# They are templates by default and are created only after explicit operator opt-in.
resource "aws_cloudwatch_log_metric_filter" "ecs_error" {
  for_each = var.enable_ecs_observability_alarms ? local.ecs_error_filter_patterns : {}

  name           = "${local.name_prefix}-${each.key}-errors"
  log_group_name = aws_cloudwatch_log_group.ecs[each.key].name
  pattern        = each.value

  metric_transformation {
    name          = "${title(each.key)}ErrorCount"
    namespace     = "SketchCatch/${var.environment}/ECS"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_container_errors" {
  for_each = var.enable_ecs_observability_alarms ? local.ecs_error_filter_patterns : {}

  alarm_name          = "${local.name_prefix}-${each.key}-errors"
  alarm_description   = "SketchCatch ${each.key} ECS log errors exceeded the configured threshold."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = var.ecs_log_error_alarm_threshold
  metric_name         = aws_cloudwatch_log_metric_filter.ecs_error[each.key].metric_transformation[0].name
  namespace           = aws_cloudwatch_log_metric_filter.ecs_error[each.key].metric_transformation[0].namespace
  period              = 300
  statistic           = "Sum"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.cloudwatch_alarm_action_arns
  ok_actions          = var.cloudwatch_alarm_action_arns
}

resource "aws_cloudwatch_metric_alarm" "ecs_unhealthy_hosts" {
  count = var.enable_ecs_observability_alarms ? 1 : 0

  alarm_name          = "${local.name_prefix}-unhealthy-hosts"
  alarm_description   = "The parallel ECS ALB target group has unhealthy Fargate targets."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  threshold           = 1
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.cloudwatch_alarm_action_arns
  ok_actions          = var.cloudwatch_alarm_action_arns

  dimensions = {
    LoadBalancer = aws_lb.ecs.arn_suffix
    TargetGroup  = aws_lb_target_group.ecs.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_service_cpu_high" {
  count = var.enable_ecs_observability_alarms ? 1 : 0

  alarm_name          = "${local.name_prefix}-service-cpu-high"
  alarm_description   = "The SketchCatch ECS app service CPU utilization stayed high."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 3
  threshold           = var.ecs_service_cpu_alarm_threshold
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.cloudwatch_alarm_action_arns
  ok_actions          = var.cloudwatch_alarm_action_arns

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.app.name
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_service_memory_high" {
  count = var.enable_ecs_observability_alarms ? 1 : 0

  alarm_name          = "${local.name_prefix}-service-memory-high"
  alarm_description   = "The SketchCatch ECS app service memory utilization stayed high."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 3
  threshold           = var.ecs_service_memory_alarm_threshold
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.cloudwatch_alarm_action_arns
  ok_actions          = var.cloudwatch_alarm_action_arns

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.app.name
  }
}
