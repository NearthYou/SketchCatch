import type {
  ArchitectureJson,
  DiagramEdge,
  DiagramJson,
  DiagramNode,
  DiagramNodeParameters,
  ResourceConfig,
  ResourceDragPayload,
  ResourceItem,
  ResourceType
} from "@sketchcatch/types";
import { createDiagramNodeFromPayload } from "../diagram-editor/diagram-utils";
import { resourceCatalog } from "../resource-settings/catalog";

const DEFAULT_VIEWPORT: DiagramJson["viewport"] = { x: 0, y: 0, zoom: 1 };
const DEFAULT_NODE_SIZE: DiagramNode["size"] = { width: 180, height: 96 };
const DEFAULT_EDGE_STYLE: NonNullable<DiagramEdge["style"]> = {
  animated: false,
  color: "#506176",
  width: "medium"
};
const RESOURCE_TO_TERRAFORM_RESOURCE_TYPE: Record<ResourceType, string> = {
  CLOUDFRONT: "aws_cloudfront_distribution",
  EC2: "aws_instance",
  LAMBDA: "aws_lambda_function",
  RDS: "aws_db_instance",
  S3: "aws_s3_bucket",
  SECURITY_GROUP: "aws_security_group",
  SUBNET: "aws_subnet",
  UNKNOWN: "unknown_resource",
  VPC: "aws_vpc"
};
const TERRAFORM_RESOURCE_TYPE_TO_RESOURCE: Record<string, ResourceType> = {
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
const RESOURCE_ITEMS_BY_TERRAFORM_TYPE = new Map<string, ResourceItem>(
  resourceCatalog.map((item) => [item.nodeDefaults.type, item])
);

// AI Draft를 실제 Architecture Board가 받을 수 있는 DiagramJson으로 바꾸는 gg 경계입니다.
export function convertArchitectureJsonToDiagramJson(architectureJson: ArchitectureJson): DiagramJson {
  const nodeIds = new Set(architectureJson.nodes.map((node) => node.id));

  return {
    edges: architectureJson.edges
      .filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId))
      .map(convertArchitectureEdgeToDiagramEdge),
    nodes: architectureJson.nodes.map(convertArchitectureNodeToDiagramNode),
    viewport: { ...DEFAULT_VIEWPORT }
  };
}

// 현재 보드 상태를 gg 분석 API가 이해하는 ArchitectureJson으로 되돌립니다.
export function convertDiagramJsonToArchitectureJson(diagramJson: DiagramJson): ArchitectureJson {
  const nodes = diagramJson.nodes.filter(isConvertibleResourceNode).map((node) => {
    const parameters = node.parameters;

    return {
      config: createArchitectureConfig(parameters),
      id: node.id,
      label: node.label,
      positionX: node.position.x,
      positionY: node.position.y,
      type: mapTerraformResourceType(parameters.resourceType)
    };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));

  return {
    edges: diagramJson.edges
      .filter((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId))
      .map((edge) => ({
        id: edge.id,
        label: edge.label,
        sourceId: edge.sourceNodeId,
        targetId: edge.targetNodeId
      })),
    nodes
  };
}

function convertArchitectureNodeToDiagramNode(node: ArchitectureJson["nodes"][number], index: number): DiagramNode {
  const terraformResourceType = mapResourceTypeToTerraform(node.type);
  const position = {
    x: node.positionX,
    y: node.positionY
  };
  const zIndex = index + 1;
  const baseNode = createResourceCatalogDiagramNode(terraformResourceType, position, zIndex);

  return {
    ...baseNode,
    id: node.id,
    label: node.label ?? baseNode.label,
    locked: false,
    parameters: createDiagramNodeParameters(node, terraformResourceType, baseNode.parameters),
    position,
    type: terraformResourceType,
    zIndex
  };
}

// jh Resource catalog를 거쳐 수동 drag/drop 노드와 같은 iconUrl, size, 기본 style을 사용합니다.
function createResourceCatalogDiagramNode(
  terraformResourceType: string,
  position: DiagramNode["position"],
  zIndex: number
): DiagramNode {
  const resourceItem = RESOURCE_ITEMS_BY_TERRAFORM_TYPE.get(terraformResourceType);

  if (!resourceItem) {
    return createFallbackDiagramNode(terraformResourceType, position, zIndex);
  }

  const payload: ResourceDragPayload = {
    source: "resource-settings-panel",
    item: resourceItem
  };

  return createDiagramNodeFromPayload(payload, position, zIndex);
}

function createFallbackDiagramNode(
  terraformResourceType: string,
  position: DiagramNode["position"],
  zIndex: number
): DiagramNode {
  return {
    id: "",
    kind: "resource",
    label: terraformResourceType,
    locked: false,
    parameters: {
      fileName: "main",
      resourceName: "resource",
      resourceType: terraformResourceType,
      terraformBlockType: "resource",
      values: {}
    },
    position,
    size: { ...DEFAULT_NODE_SIZE },
    style: {
      borderColor: "#2f6db3",
      textColor: "#172033"
    },
    type: terraformResourceType,
    zIndex
  };
}

// 보드 노드 파라미터는 jh 기본값 위에 AI config를 얹어 Terraform Preview와 맞춥니다.
function createDiagramNodeParameters(
  node: ArchitectureJson["nodes"][number],
  terraformResourceType: string,
  baseParameters: DiagramNodeParameters | undefined
): DiagramNodeParameters {
  const config = node.config ?? {};

  return {
    fileName: baseParameters?.fileName ?? "main",
    resourceName: getArchitectureResourceName(node),
    resourceType: terraformResourceType,
    terraformBlockType: baseParameters?.terraformBlockType ?? "resource",
    values: {
      ...(baseParameters?.values ?? {}),
      ...config
    }
  };
}

function convertArchitectureEdgeToDiagramEdge(edge: ArchitectureJson["edges"][number]): DiagramEdge {
  return {
    id: edge.id,
    label: edge.label,
    sourceNodeId: edge.sourceId,
    style: { ...DEFAULT_EDGE_STYLE },
    targetNodeId: edge.targetId,
    type: "smoothstep"
  };
}

function isConvertibleResourceNode(
  node: DiagramNode
): node is DiagramNode & { parameters: DiagramNodeParameters } {
  return node.kind === "resource" && node.parameters != null && node.parameters.invalid !== true;
}

function createArchitectureConfig(parameters: DiagramNodeParameters): ResourceConfig {
  const values = isRecord(parameters.values) ? parameters.values : {};
  const config: ResourceConfig = {
    ...values,
    terraformResourceName: parameters.resourceName,
    terraformResourceType: parameters.resourceType
  };

  return parameters.resourceType === "aws_security_group_rule"
    ? addSecurityGroupRuleIngress(config, values)
    : config;
}

function addSecurityGroupRuleIngress(config: ResourceConfig, values: ResourceConfig): ResourceConfig {
  const ingress = normalizeSecurityGroupRuleIngress(values);

  return ingress.length > 0
    ? {
        ...config,
        ingress
      }
    : config;
}

function normalizeSecurityGroupRuleIngress(values: ResourceConfig): ResourceConfig[] {
  if (values["type"] !== "ingress") {
    return [];
  }

  const cidrBlocks = values["cidrBlocks"] ?? values["cidr_blocks"];

  if (!Array.isArray(cidrBlocks)) {
    return [];
  }

  const port = normalizePort(values["fromPort"] ?? values["from_port"] ?? values["toPort"] ?? values["to_port"]);

  return cidrBlocks.filter(isString).map((cidr) => (port === undefined ? { cidr } : { cidr, port }));
}

// Security Group Rule 포트는 AWS가 받을 수 있는 숫자 범위만 분석 입력에 남깁니다.
function normalizePort(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return isValidPort(value) ? value : undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const port = Number(value);

  return isValidPort(port) ? port : undefined;
}

// LLM/API 응답에서 config가 비어도 Architecture Board 반영이 멈추지 않게 이름을 복구합니다.
function getArchitectureResourceName(node: ArchitectureJson["nodes"][number]): string {
  const configuredName = node.config?.["terraformResourceName"];

  return typeof configuredName === "string" && configuredName.trim().length > 0
    ? configuredName
    : toTerraformName(node.id);
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 0 && port <= 65_535;
}

function mapResourceTypeToTerraform(resourceType: ResourceType): string {
  return RESOURCE_TO_TERRAFORM_RESOURCE_TYPE[resourceType];
}

function mapTerraformResourceType(terraformResourceType: string): ResourceType {
  return TERRAFORM_RESOURCE_TYPE_TO_RESOURCE[terraformResourceType] ?? "UNKNOWN";
}

// Terraform resource name은 사용자 로케일과 무관한 ASCII identifier로 정규화합니다.
function toTerraformName(value: string): string {
  const name = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return name.length > 0 ? name : "resource";
}

function isRecord(value: unknown): value is ResourceConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
