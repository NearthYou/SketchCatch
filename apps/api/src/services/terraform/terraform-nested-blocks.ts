const TERRAFORM_NESTED_BLOCK_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  aws_ami: new Set(["filter"]),
  aws_api_gateway_rest_api: new Set(["endpointConfiguration"]),
  aws_autoscaling_group: new Set(["launchTemplate", "tag"]),
  aws_db_parameter_group: new Set(["parameter"]),
  aws_dynamodb_table: new Set(["attribute"]),
  aws_instance: new Set(["rootBlockDevice"]),
  aws_lambda_function: new Set(["environment"]),
  aws_route_table: new Set(["route"]),
  aws_s3_bucket_lifecycle_configuration: new Set(["rule"]),
  aws_security_group: new Set(["egress", "ingress"])
};

export function getTerraformNestedBlockAttributes(
  resourceType: string
): ReadonlySet<string> | undefined {
  return TERRAFORM_NESTED_BLOCK_ATTRIBUTES[resourceType];
}

export function isTerraformNestedBlockAttribute(
  resourceType: string,
  attributeName: string
): boolean {
  return getTerraformNestedBlockAttributes(resourceType)?.has(toCamelCase(attributeName)) === true;
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}
