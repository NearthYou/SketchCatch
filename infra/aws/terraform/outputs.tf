output "ecr_repository_urls" {
  description = "ECR repository URLs for Phase 2 image push wiring."
  value = {
    for name, repository in aws_ecr_repository.service : name => repository.repository_url
  }
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_names" {
  description = "ECS API/web service names plus the protected legacy nginx rollback service."
  value = {
    api        = aws_ecs_service.api.name
    web        = aws_ecs_service.web.name
    legacy_app = aws_ecs_service.app.name
  }
}

output "ecs_cutover_stage" {
  description = "Current ALB routing stage: warmup keeps legacy at weight 100; split sends API/web traffic to the split targets."
  value       = var.ecs_cutover_stage
}

output "ecs_task_definition_families" {
  description = "ECS task definition families for API, web, worker, and the protected legacy app."
  value = {
    api        = aws_ecs_task_definition.api.family
    web        = aws_ecs_task_definition.web.family
    worker     = aws_ecs_task_definition.worker.family
    legacy_app = aws_ecs_task_definition.app.family
  }
}

output "ecs_alb_dns_name" {
  description = "Parallel ECS ALB DNS name for smoke testing before Route53 alias cutover."
  value       = aws_lb.ecs.dns_name
}

output "ecs_alb_zone_id" {
  description = "Parallel ECS ALB hosted zone ID, needed for later Route53 alias cutover."
  value       = aws_lb.ecs.zone_id
}

output "ecs_target_group_arns" {
  description = "Fargate-compatible ip target group ARNs for API and web."
  value = {
    api = aws_lb_target_group.api.arn
    web = aws_lb_target_group.web.arn
  }
}

output "ecs_task_role_arn" {
  description = "Runtime task role ARN. Use this as SKETCHCATCH_AWS_CALLER_PRINCIPAL_ARN when the API runs on ECS."
  value       = aws_iam_role.ecs_task.arn
}

output "ecs_execution_role_arn" {
  description = "API/web task execution role ARN."
  value       = aws_iam_role.ecs_execution.arn
}

output "ecs_web_isolation" {
  description = "Permissionless web task role and dedicated web security group."
  value = {
    task_role_arn     = aws_iam_role.ecs_web_task.arn
    security_group_id = aws_security_group.ecs_web.id
  }
}

output "ecs_worker_roles" {
  description = "Dedicated one-off worker execution and task role ARNs."
  value = {
    execution = aws_iam_role.ecs_worker_execution.arn
    task      = aws_iam_role.ecs_worker_task.arn
  }
}

output "ecs_worker_security_group_id" {
  description = "Dedicated no-ingress worker security group."
  value       = aws_security_group.ecs_worker.id
}

output "ecs_log_group_names" {
  description = "CloudWatch log groups for API, web, worker, and the retained legacy nginx rollback logs."
  value = {
    for name, log_group in aws_cloudwatch_log_group.ecs : name => log_group.name
  }
}

output "ecs_observability_alarm_names" {
  description = "CloudWatch alarms created only when enable_ecs_observability_alarms is true."
  value = {
    container_errors = {
      for name, alarm in aws_cloudwatch_metric_alarm.ecs_container_errors : name => alarm.alarm_name
    }
    unhealthy_hosts = {
      for name, alarm in aws_cloudwatch_metric_alarm.ecs_unhealthy_hosts : name => alarm.alarm_name
    }
    service_cpu = {
      for name, alarm in aws_cloudwatch_metric_alarm.ecs_service_cpu_high : name => alarm.alarm_name
    }
    service_memory = {
      for name, alarm in aws_cloudwatch_metric_alarm.ecs_service_memory_high : name => alarm.alarm_name
    }
  }
}
