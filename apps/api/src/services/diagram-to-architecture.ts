import type {
  ArchitectureJson,
  DiagramJson,
  DiagramNode,
  DiagramNodeParameters,
  ResourceConfig,
  ResourceType
} from "@sketchcatch/types";

const TERRAFORM_RESOURCE_TYPE_TO_RESOURCE_TYPE: Record<string, ResourceType> = {
  aws_cloudfront_distribution: "CLOUDFRONT",
  aws_db_instance: "RDS",
  aws_instance: "EC2",
  aws_lambda_function: "LAMBDA",
  aws_s3_bucket: "S3",
  aws_security_group: "SECURITY_GROUP",
  aws_security_group_rule: "SECURITY_GROUP",
  aws_subnet: "SUBNET",
  aws_vpc: "VPC"
};

export function convertDiagramJsonToArchitectureJson(diagramJson: DiagramJson): ArchitectureJson {
  const nodes = diagramJson.nodes.filter(isConvertibleResourceNode).map((node) => {
    const parameters = node.parameters;

    return {
      id: node.id,
      type: mapTerraformResourceType(parameters.resourceType),
      label: node.label,
      positionX: node.position.x,
      positionY: node.position.y,
      config: createArchitectureConfig(parameters)
    };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = diagramJson.edges
    .filter((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId))
    .map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceNodeId,
      targetId: edge.targetNodeId,
      label: edge.label
    }));

  return {
    nodes,
    edges
  };
}

function isConvertibleResourceNode(
  node: DiagramNode
): node is DiagramNode & { parameters: DiagramNodeParameters } {
  return node.kind === "resource" && node.parameters != null && node.parameters.invalid !== true;
}

function mapTerraformResourceType(terraformResourceType: string): ResourceType {
  return TERRAFORM_RESOURCE_TYPE_TO_RESOURCE_TYPE[terraformResourceType] ?? "UNKNOWN";
}

function createArchitectureConfig(parameters: DiagramNodeParameters): ResourceConfig {
  const values = isRecord(parameters.values) ? parameters.values : {};
  const baseConfig: ResourceConfig = {
    ...values,
    terraformResourceName: parameters.resourceName,
    terraformResourceType: parameters.resourceType
  };

  if (parameters.resourceType !== "aws_security_group_rule") {
    return baseConfig;
  }

  const ingress = normalizeSecurityGroupRuleIngress(values);

  return ingress.length > 0
    ? {
        ...baseConfig,
        ingress
      }
    : baseConfig;
}

function normalizeSecurityGroupRuleIngress(values: ResourceConfig | null | undefined): ResourceConfig[] {
  if (values == null || values["type"] !== "ingress") {
    return [];
  }

  const rawPort = values["fromPort"] ?? values["from_port"] ?? values["toPort"] ?? values["to_port"];
  const port = normalizePort(rawPort);
  const cidrBlocks = values["cidrBlocks"] ?? values["cidr_blocks"];

  if (!Array.isArray(cidrBlocks)) {
    return [];
  }

  return cidrBlocks.filter(isString).map((cidr) => ({
    cidr,
    port
  }));
}

function normalizePort(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const port = Number(value);

  return Number.isInteger(port) ? port : undefined;
}

function isRecord(value: unknown): value is ResourceConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
