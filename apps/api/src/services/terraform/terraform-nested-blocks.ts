const TERRAFORM_NESTED_BLOCK_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  aws_ami: new Set(["filter"]),
  aws_route_table: new Set(["route"]),
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
  return getTerraformNestedBlockAttributes(resourceType)?.has(attributeName) === true;
}
