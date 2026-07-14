import type {
  ArchitectureJson,
  DiagramJson,
  DiagramNode,
  DiagramNodeParameters,
  ResourceConfig,
  ResourceType,
  TerraformBlockType
} from "@sketchcatch/types";
import { getResourceDefinitionByTerraform } from "@sketchcatch/types/resource-definitions";

const DEFAULT_TERRAFORM_BLOCK_TYPE: TerraformBlockType = "resource";

export function convertDiagramJsonToArchitectureJson(diagramJson: DiagramJson): ArchitectureJson {
  const nodes = diagramJson.nodes.flatMap((node) => {
    const parameters = getConvertibleResourceNodeParameters(node);

    if (!parameters) {
      return [];
    }

    return [
      {
        id: node.id,
        type: mapTerraformResourceType(parameters),
        label: node.label,
        positionX: node.position.x,
        positionY: node.position.y,
        config: createArchitectureConfig(parameters)
      }
    ];
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = diagramJson.edges
    .filter(
      (edge) =>
        edge.metadata?.presentationRole !== "summary" &&
        nodeIds.has(edge.sourceNodeId) &&
        nodeIds.has(edge.targetNodeId)
    )
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

function getConvertibleResourceNodeParameters(node: DiagramNode): DiagramNodeParameters | null {
  if (node.kind !== "resource") {
    return null;
  }

  if (node.parameters?.invalid === true) {
    return null;
  }

  if (node.parameters != null) {
    return node.parameters;
  }

  const resourceType = node.type.trim();

  if (!getResourceDefinitionByTerraform(DEFAULT_TERRAFORM_BLOCK_TYPE, resourceType)) {
    return null;
  }

  return {
    fileName: "main",
    resourceName: createFallbackResourceName(node),
    resourceType,
    terraformBlockType: DEFAULT_TERRAFORM_BLOCK_TYPE,
    values: {}
  };
}

function mapTerraformResourceType(parameters: DiagramNodeParameters): ResourceType {
  if (isRdsReadReplica(parameters)) {
    return "RDS_READ_REPLICA";
  }

  const terraformBlockType = parameters.terraformBlockType ?? DEFAULT_TERRAFORM_BLOCK_TYPE;

  return (
    getResourceDefinitionByTerraform(terraformBlockType, parameters.resourceType)?.resourceType ??
    "UNKNOWN"
  );
}

function isRdsReadReplica(parameters: DiagramNodeParameters): boolean {
  if (parameters.resourceType !== "aws_db_instance") {
    return false;
  }

  const values = isRecord(parameters.values) ? parameters.values : {};
  const replicateSourceDb = values["replicateSourceDb"] ?? values["replicate_source_db"];

  return typeof replicateSourceDb === "string" && replicateSourceDb.trim().length > 0;
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

function normalizeSecurityGroupRuleIngress(
  values: ResourceConfig | null | undefined
): ResourceConfig[] {
  if (values == null || values["type"] !== "ingress") {
    return [];
  }

  const rawPort =
    values["fromPort"] ?? values["from_port"] ?? values["toPort"] ?? values["to_port"];
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

function toTerraformName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized.length > 0 ? normalized : "resource";
}

function createFallbackResourceName(node: DiagramNode): string {
  const labelName = toTerraformName(node.label);

  return labelName === "resource" ? toTerraformName(node.id) : labelName;
}
