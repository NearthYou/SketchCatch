locals {
  autoscaled_ecs_services = var.enable_ecs_service_autoscaling ? {
    api = aws_ecs_service.api.name
    web = aws_ecs_service.web.name
  } : {}
}

resource "aws_appautoscaling_target" "ecs_service" {
  for_each = local.autoscaled_ecs_services

  min_capacity       = var.ecs_autoscaling_min_capacity
  max_capacity       = var.ecs_autoscaling_max_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${each.value}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"

  lifecycle {
    precondition {
      condition     = var.ecs_autoscaling_max_capacity >= var.ecs_autoscaling_min_capacity
      error_message = "ecs_autoscaling_max_capacity must be greater than or equal to min capacity."
    }
  }
}

resource "aws_appautoscaling_policy" "ecs_cpu" {
  for_each = local.autoscaled_ecs_services

  name               = "${local.name_prefix}-${each.key}-cpu-target"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_service[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_service[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_service[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = var.ecs_autoscaling_target_cpu_percent
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
