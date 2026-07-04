export type TerraformNestedBlockCardinality = "list" | "single";

const TERRAFORM_NESTED_BLOCK_ATTRIBUTES: Record<
  string,
  Readonly<Record<string, TerraformNestedBlockCardinality>>
> = {
  aws_ami: { filter: "list" },
  aws_api_gateway_rest_api: { endpointConfiguration: "single" },
  aws_autoscaling_group: { launchTemplate: "list", tag: "list" },
  aws_db_parameter_group: { parameter: "list" },
  aws_dynamodb_table: { attribute: "list" },
  aws_instance: { rootBlockDevice: "list" },
  aws_lambda_function: { environment: "single" },
  aws_route_table: { route: "list" },
  aws_s3_bucket_lifecycle_configuration: { rule: "list" },
  aws_s3_bucket_server_side_encryption_configuration: { rule: "single" },
  aws_s3_bucket_versioning: { versioningConfiguration: "single" },
  aws_security_group: { egress: "list", ingress: "list" }
};

export function getTerraformNestedBlockAttributes(
  resourceType: string
): ReadonlySet<string> | undefined {
  const attributes = TERRAFORM_NESTED_BLOCK_ATTRIBUTES[resourceType];

  return attributes ? new Set(Object.keys(attributes)) : undefined;
}

export function getTerraformNestedBlockCardinality(
  resourceType: string | undefined,
  attributeName: string
): TerraformNestedBlockCardinality | undefined {
  if (!resourceType) {
    return undefined;
  }

  const attributes = TERRAFORM_NESTED_BLOCK_ATTRIBUTES[resourceType];
  const normalizedAttributeName = toCamelCase(attributeName);

  return attributes?.[attributeName] ?? attributes?.[normalizedAttributeName];
}

export function isTerraformNestedBlockAttribute(
  resourceType: string,
  attributeName: string
): boolean {
  return getTerraformNestedBlockCardinality(resourceType, attributeName) !== undefined;
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-z0-9])/g, (_match, character: string) => character.toUpperCase());
}
