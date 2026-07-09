resource "aws_cloudwatch_log_group" "ecs" {
  for_each = local.log_group_names

  name              = each.value
  retention_in_days = var.log_retention_days
}
