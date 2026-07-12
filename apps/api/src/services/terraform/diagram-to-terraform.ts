import type {
  InfrastructureGraph,
  InfrastructureGraphNode,
  TerraformBlockType
} from "@sketchcatch/types";
import { isTerraformNestedBlockAttribute } from "./terraform-nested-blocks.js";

const DEFAULT_TERRAFORM_BLOCK_TYPE: TerraformBlockType = "resource";
const INDENT_UNIT = "  ";
export const TERRAFORM_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
const TERRAFORM_REFERENCE_PATTERN =
  /^(?:var|local|each|count|path|terraform)\.[a-zA-Z_][a-zA-Z0-9_]*$|^module\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$|^aws_[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$|^data\.aws_[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$/;
const TERRAFORM_RESOURCE_ADDRESS_PATTERN =
  /^(?:aws_[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+|module\.[a-zA-Z0-9_]+)$/;

export class TerraformDiagramValidationError extends Error {
  readonly reason = "invalid_identifier";

  constructor(label: string, value: string) {
    super(`Invalid Terraform ${label}: ${value}`);
    this.name = "TerraformDiagramValidationError";
  }
}

export function renderTerraformFromInfrastructureGraph(graph: InfrastructureGraph): string {
  const resourceBlocks = graph.nodes.map((node) => renderBlock(node));

  return [...resourceBlocks, ...renderLiveObservationOutputs(graph)].join("\n\n");
}

function renderLiveObservationOutputs(graph: InfrastructureGraph): string[] {
  const website = findResourceNode(graph, "aws_s3_bucket_website_configuration");
  const loadBalancer = findResourceNode(graph, "aws_lb");
  const targetGroup = findResourceNode(graph, "aws_lb_target_group");
  const autoScalingGroup = findResourceNode(graph, "aws_autoscaling_group");
  const ecsCluster = findResourceNode(graph, "aws_ecs_cluster");
  const ecsService = findResourceNode(graph, "aws_ecs_service");
  const applicationScalingTarget = findResourceNode(graph, "aws_appautoscaling_target");
  const applicationScalingPolicy = findResourceNode(graph, "aws_appautoscaling_policy");
  const alarm = graph.nodes.find(
    (node) =>
      node.iac.terraformBlockType === "resource" &&
      node.iac.resourceType === "aws_cloudwatch_metric_alarm" &&
      node.config["metricName"] === "RequestCountPerTarget" &&
      typeof node.config["threshold"] === "number"
  );

  if (!website || !loadBalancer || !targetGroup) {
    return [];
  }

  const websiteAddress = `aws_s3_bucket_website_configuration.${website.iac.resourceName}`;
  const loadBalancerAddress = `aws_lb.${loadBalancer.iac.resourceName}`;
  const targetGroupAddress = `aws_lb_target_group.${targetGroup.iac.resourceName}`;
  const commonOutputs = [
    renderOutput("static_site_url", `"http://\${${websiteAddress}.website_endpoint}"`),
    renderOutput("api_base_url", `"http://\${${loadBalancerAddress}.dns_name}"`),
    renderOutput("alb_arn_suffix", `${loadBalancerAddress}.arn_suffix`),
    renderOutput("target_group_arn_suffix", `${targetGroupAddress}.arn_suffix`)
  ];

  if (autoScalingGroup && alarm) {
    const autoScalingGroupAddress = `aws_autoscaling_group.${autoScalingGroup.iac.resourceName}`;

    return [
      ...commonOutputs,
      renderOutput("asg_name", `${autoScalingGroupAddress}.name`),
      renderOutput("scale_out_threshold", String(alarm.config["threshold"]))
    ];
  }

  const targetTrackingConfig = applicationScalingPolicy?.config[
    "targetTrackingScalingPolicyConfiguration"
  ];
  const targetValue = isRecord(targetTrackingConfig) ? targetTrackingConfig["targetValue"] : null;
  const maxCapacity = applicationScalingTarget?.config["maxCapacity"];

  if (
    !ecsCluster ||
    !ecsService ||
    !applicationScalingTarget ||
    !applicationScalingPolicy ||
    typeof targetValue !== "number" ||
    typeof maxCapacity !== "number"
  ) {
    return [];
  }

  const ecsClusterAddress = `aws_ecs_cluster.${ecsCluster.iac.resourceName}`;
  const ecsServiceAddress = `aws_ecs_service.${ecsService.iac.resourceName}`;

  return [
    ...commonOutputs,
    renderOutput("ecs_cluster_name", `${ecsClusterAddress}.name`),
    renderOutput("ecs_service_name", `${ecsServiceAddress}.name`),
    renderOutput("max_capacity", String(maxCapacity)),
    renderOutput("scale_out_threshold", String(targetValue))
  ];
}

function findResourceNode(
  graph: InfrastructureGraph,
  resourceType: string
): InfrastructureGraphNode | undefined {
  return graph.nodes.find(
    (node) =>
      node.iac.terraformBlockType === "resource" && node.iac.resourceType === resourceType
  );
}

function renderOutput(name: string, valueExpression: string): string {
  return [`output "${name}" {`, `${INDENT_UNIT}value = ${valueExpression}`, "}"].join("\n");
}

// resource/data block 하나를 만든다. 예: resource "aws_vpc" "main" { ... }
function renderBlock(node: InfrastructureGraphNode): string {
  const terraformBlockType = node.iac.terraformBlockType ?? DEFAULT_TERRAFORM_BLOCK_TYPE;
  assertTerraformIdentifier(node.iac.resourceType, "resource type");
  assertTerraformIdentifier(node.iac.resourceName, "resource name");

  const body = Object.entries(node.config).flatMap(([key, value]) =>
    renderBodyEntry(node.iac.resourceType, key, value, 1)
  );

  return [
    `${terraformBlockType} "${node.iac.resourceType}" "${node.iac.resourceName}" {`,
    ...body,
    "}"
  ].join("\n");
}

function renderBodyEntry(
  resourceType: string,
  key: string,
  value: unknown,
  indentLevel: number
): string[] {
  const normalizedValue = normalizeTopLevelValue(resourceType, key, value);

  if (shouldRenderNestedBlocks(resourceType, key, normalizedValue)) {
    return renderNestedBlocks(key, normalizedValue, indentLevel);
  }

  return [renderAttribute(key, normalizedValue, indentLevel)];
}

function normalizeTopLevelValue(resourceType: string, key: string, value: unknown): unknown {
  if (
    resourceType === "aws_security_group" &&
    (key === "egress" || key === "ingress") &&
    Array.isArray(value)
  ) {
    return value.map((item) => (isRecord(item) ? normalizeSecurityGroupRuleBlock(item) : item));
  }

  return value;
}

function normalizeSecurityGroupRuleBlock(rule: Record<string, unknown>): Record<string, unknown> {
  const normalizedRule: Record<string, unknown> = {};
  const port = rule["port"];
  const cidr = rule["cidr"];
  const hasCidrBlocks = rule["cidrBlocks"] !== undefined || rule["cidr_blocks"] !== undefined;

  for (const [key, value] of Object.entries(rule)) {
    if (key !== "cidr" && key !== "port") {
      normalizedRule[key] = value;
    }
  }

  if (port !== undefined) {
    if (rule["fromPort"] === undefined && rule["from_port"] === undefined) {
      normalizedRule.fromPort = port;
    }

    if (rule["toPort"] === undefined && rule["to_port"] === undefined) {
      normalizedRule.toPort = port;
    }

    if (rule["protocol"] === undefined) {
      normalizedRule.protocol = "tcp";
    }
  }

  if (cidr !== undefined && !hasCidrBlocks) {
    normalizedRule.cidrBlocks = [cidr];
  }

  return normalizedRule;
}

function shouldRenderNestedBlocks(
  resourceType: string,
  key: string,
  value: unknown
): value is Record<string, unknown> | Record<string, unknown>[] {
  return (
    isTerraformNestedBlockAttribute(resourceType, key) &&
    ((Array.isArray(value) && value.every(isRecord)) || isRecord(value))
  );
}

function renderNestedBlocks(
  key: string,
  value: Record<string, unknown> | Record<string, unknown>[],
  indentLevel: number
): string[] {
  const blockName = toSnakeCase(key);
  const values = Array.isArray(value) ? value : [value];

  assertTerraformIdentifier(blockName, "nested block name");

  return values.map((value) =>
    [
      `${indent(indentLevel)}${blockName} {`,
      ...Object.entries(value).flatMap(([nestedKey, nestedValue]) =>
        renderNestedBlockEntry(nestedKey, nestedValue, indentLevel + 1)
      ),
      `${indent(indentLevel)}}`
    ].join("\n")
  );
}

function renderNestedBlockEntry(key: string, value: unknown, indentLevel: number): string[] {
  if (Array.isArray(value) && value.every(isRecord)) {
    return renderNestedBlocks(key, value, indentLevel);
  }

  return [renderAttribute(key, value, indentLevel)];
}

function renderAttribute(key: string, value: unknown, indentLevel: number): string {
  const attributeName = toSnakeCase(key);
  assertTerraformIdentifier(attributeName, "attribute name");

  const renderedValue =
    attributeName === "depends_on"
      ? renderDependencyList(value, indentLevel)
      : renderValue(value, indentLevel);

  return `${indent(indentLevel)}${attributeName} = ${renderedValue}`;
}

function renderDependencyList(value: unknown, indentLevel: number): string {
  if (!Array.isArray(value)) {
    return renderValue(value, indentLevel);
  }

  if (value.length === 0) {
    return "[]";
  }

  return [
    "[",
    ...value.map((dependency) => {
      const renderedDependency =
        typeof dependency === "string" && TERRAFORM_RESOURCE_ADDRESS_PATTERN.test(dependency)
          ? dependency
          : renderValue(dependency, indentLevel + 1);

      return `${indent(indentLevel + 1)}${renderedDependency},`;
    }),
    `${indent(indentLevel)}]`
  ].join("\n");
}

// JavaScript 값을 Terraform HCL 값 표현으로 바꾼다.
function renderValue(value: unknown, indentLevel: number): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    return isTerraformReference(value) ? value : JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return renderArray(value, indentLevel);
  }

  if (isRecord(value)) {
    return renderObject(value, indentLevel);
  }

  return JSON.stringify(String(value));
}

// 배열 값을 사람이 읽기 쉬운 여러 줄 Terraform list로 출력한다.
function renderArray(values: unknown[], indentLevel: number): string {
  if (values.length === 0) {
    return "[]";
  }

  return [
    "[",
    ...values.map((value) => `${indent(indentLevel + 1)}${renderValue(value, indentLevel + 1)},`),
    `${indent(indentLevel)}]`
  ].join("\n");
}

// object 값을 Terraform map/object 표현으로 바꾼다. tags 같은 nested key는 원래 이름을 유지한다.
function renderObject(value: Record<string, unknown>, indentLevel: number): string {
  const entries = Object.entries(value);

  if (entries.length === 0) {
    return "{}";
  }

  return [
    "{",
    ...entries.map(
      ([key, nestedValue]) =>
        `${indent(indentLevel + 1)}${renderObjectKey(key)} = ${renderValue(nestedValue, indentLevel + 1)}`
    ),
    `${indent(indentLevel)}}`
  ].join("\n");
}

function renderObjectKey(key: string): string {
  return TERRAFORM_IDENTIFIER_PATTERN.test(key) ? key : JSON.stringify(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Terraform reference는 따옴표 없이 출력해야 하므로 일반 문자열과 구분한다.
function isTerraformReference(value: string): boolean {
  return TERRAFORM_REFERENCE_PATTERN.test(value);
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
}

function indent(level: number): string {
  return INDENT_UNIT.repeat(level);
}

function assertTerraformIdentifier(value: string, label: string): void {
  if (TERRAFORM_IDENTIFIER_PATTERN.test(value)) {
    return;
  }

  throw new TerraformDiagramValidationError(label, value);
}
