import {
  isDiagramConnectionAllowed,
  type DiagramConnectionPolicyInput,
  type RestrictedResourceConnectionRules
} from "./resource-connection-policy";

export const AWS_RESTRICTED_RESOURCE_CONNECTIONS: RestrictedResourceConnectionRules = new Map([
  ["aws_volume_attachment", new Set(["aws_ebs_volume", "aws_instance"])],
  [
    "aws_route_table_association",
    new Set(["aws_route_table", "aws_subnet", "aws_internet_gateway"])
  ],
  ["aws_iam_role_policy_attachment", new Set(["aws_iam_role", "aws_iam_policy"])],
  [
    "aws_lb_target_group_attachment",
    new Set([
      "aws_lb_target_group",
      "aws_instance",
      "aws_lambda_function",
      "aws_ecs_service",
      "aws_ecs_task_definition"
    ])
  ],
  [
    "aws_wafv2_web_acl_association",
    new Set([
      "aws_wafv2_web_acl",
      "aws_lb",
      "aws_api_gateway_stage",
      "aws_apigatewayv2_stage",
      "aws_cognito_user_pool"
    ])
  ]
]);

export function isAwsDiagramConnectionAllowed(input: DiagramConnectionPolicyInput): boolean {
  return isDiagramConnectionAllowed(input, AWS_RESTRICTED_RESOURCE_CONNECTIONS);
}
