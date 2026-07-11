import type { DiagramNode } from "../../../../packages/types/src";

const COLLAPSED_PARAMETER_RESOURCE_TYPES = new Set([
  "aws_acm_certificate",
  "aws_acm_certificate_validation",
  "aws_ami",
  "aws_api_gateway_deployment",
  "aws_api_gateway_integration",
  "aws_api_gateway_method",
  "aws_api_gateway_resource",
  "aws_api_gateway_stage",
  "aws_appautoscaling_policy",
  "aws_appautoscaling_target",
  "aws_db_subnet_group",
  "aws_iam_instance_profile",
  "aws_iam_policy",
  "aws_iam_role",
  "aws_key_pair",
  "aws_kms_key",
  "aws_kms_alias",
  "aws_lambda_permission",
  "aws_launch_template",
  "aws_lb_target_group_attachment",
  "aws_route_table_association",
  "aws_security_group_rule"
]);

export function isRenderableDiagramNode(node: DiagramNode): boolean {
  return !COLLAPSED_PARAMETER_RESOURCE_TYPES.has(getNodeResourceType(node));
}

export function getNodeResourceType(node: DiagramNode | undefined): string {
  return node?.parameters?.resourceType ?? node?.type ?? "";
}
