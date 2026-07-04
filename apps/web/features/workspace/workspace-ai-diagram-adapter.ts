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
import { isAreaNode } from "../diagram-editor/area-nodes";
import { createDiagramNodeFromPayload } from "../diagram-editor/diagram-utils";
import { resourceCatalog } from "../resource-settings/catalog";
import { addServerStorageAreaNodes } from "./server-storage-board-layout";

const DEFAULT_VIEWPORT: DiagramJson["viewport"] = { x: 0, y: 0, zoom: 1 };
const DEFAULT_NODE_SIZE: DiagramNode["size"] = { width: 56, height: 56 };
const DEFAULT_EDGE_STYLE: NonNullable<DiagramEdge["style"]> = {
  animated: false,
  color: "#506176",
  width: "medium"
};
const EDGE_HANDLE_IDS = {
  bottom: "handle-bottom",
  left: "handle-left",
  right: "handle-right",
  top: "handle-top"
} as const;
const AREA_CHILD_PADDING = 48;
const MIN_RESOURCE_AREA_CHILD_FOOTPRINT: DiagramNode["size"] = { width: 112, height: 112 };
const MAX_AREA_FIT_PASSES = 8;
const AREA_PARENT_EDGE_LABELS = new Set(["contains", "hosts"]);
const SECURITY_GROUP_REFERENCE_KEYS = ["securityGroupIds", "vpcSecurityGroupIds", "securityGroupId"] as const;
const RESOURCE_TO_TERRAFORM_RESOURCE_TYPE: Record<ResourceType, string> = {
  AMI: "aws_ami",
  API_GATEWAY_REST_API: "aws_api_gateway_rest_api",
  CLOUDWATCH_LOG_GROUP: "aws_cloudwatch_log_group",
  CLOUDWATCH_METRIC_ALARM: "aws_cloudwatch_metric_alarm",
  CLOUDFRONT: "aws_cloudfront_distribution",
  EC2: "aws_instance",
  IAM_INSTANCE_PROFILE: "aws_iam_instance_profile",
  IAM_POLICY: "aws_iam_policy",
  IAM_ROLE: "aws_iam_role",
  INTERNET_GATEWAY: "aws_internet_gateway",
  KMS_KEY: "aws_kms_key",
  LAMBDA: "aws_lambda_function",
  LAMBDA_PERMISSION: "aws_lambda_permission",
  RDS: "aws_db_instance",
  ROUTE_TABLE: "aws_route_table",
  ROUTE_TABLE_ASSOCIATION: "aws_route_table_association",
  S3: "aws_s3_bucket",
  SECURITY_GROUP: "aws_security_group",
  SUBNET: "aws_subnet",
  UNKNOWN: "unknown_resource",
  VPC: "aws_vpc"
};
const TERRAFORM_RESOURCE_TYPE_TO_RESOURCE: Record<string, ResourceType> = {
  aws_api_gateway_rest_api: "API_GATEWAY_REST_API",
  aws_ami: "AMI",
  aws_cloudwatch_log_group: "CLOUDWATCH_LOG_GROUP",
  aws_cloudwatch_metric_alarm: "CLOUDWATCH_METRIC_ALARM",
  aws_cloudfront_distribution: "CLOUDFRONT",
  aws_db_instance: "RDS",
  aws_iam_instance_profile: "IAM_INSTANCE_PROFILE",
  aws_iam_policy: "IAM_POLICY",
  aws_iam_role: "IAM_ROLE",
  aws_internet_gateway: "INTERNET_GATEWAY",
  aws_instance: "EC2",
  aws_kms_key: "KMS_KEY",
  aws_lambda_function: "LAMBDA",
  aws_lambda_permission: "LAMBDA_PERMISSION",
  aws_route_table: "ROUTE_TABLE",
  aws_route_table_association: "ROUTE_TABLE_ASSOCIATION",
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
  const convertedNodes = architectureJson.nodes.map(convertArchitectureNodeToDiagramNode);
  const nodes = fitAreaNodesToChildren(
    applyAreaParentMetadata(addServerStorageAreaNodes(convertedNodes), architectureJson.edges)
  );
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return {
    edges: architectureJson.edges
      .filter((edge) => shouldRenderArchitectureEdge(edge, nodeIds, nodeById))
      .map((edge) => convertArchitectureEdgeToDiagramEdge(edge, nodeById)),
    nodes,
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

function convertArchitectureEdgeToDiagramEdge(
  edge: ArchitectureJson["edges"][number],
  nodeById: ReadonlyMap<string, DiagramNode>
): DiagramEdge {
  const handles = getDefaultEdgeHandles(nodeById.get(edge.sourceId), nodeById.get(edge.targetId));

  return {
    id: edge.id,
    label: edge.label,
    sourceNodeId: edge.sourceId,
    sourceHandleId: handles.sourceHandleId,
    style: { ...DEFAULT_EDGE_STYLE },
    targetHandleId: handles.targetHandleId,
    targetNodeId: edge.targetId,
    type: "smoothstep"
  };
}

function shouldRenderArchitectureEdge(
  edge: ArchitectureJson["edges"][number],
  architectureNodeIds: ReadonlySet<string>,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  if (!architectureNodeIds.has(edge.sourceId) || !architectureNodeIds.has(edge.targetId)) {
    return false;
  }

  const sourceNode = nodeById.get(edge.sourceId);
  const targetNode = nodeById.get(edge.targetId);

  if (!sourceNode || !targetNode) {
    return false;
  }

  return !isAreaContainmentRenderEdge(edge, sourceNode, targetNode, nodeById);
}

function isAreaContainmentRenderEdge(
  edge: ArchitectureJson["edges"][number],
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  if (isAreaParentEdge(edge)) {
    return true;
  }

  return (
    (isAreaDiagramNode(sourceNode) && hasAreaAncestor(targetNode, sourceNode.id, nodeById)) ||
    (isAreaDiagramNode(targetNode) && hasAreaAncestor(sourceNode, targetNode.id, nodeById))
  );
}

function hasAreaAncestor(
  node: DiagramNode,
  ancestorAreaNodeId: string,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  let parentAreaNodeId = node.metadata?.parentAreaNodeId;
  const visitedNodeIds = new Set<string>();

  while (parentAreaNodeId) {
    if (parentAreaNodeId === ancestorAreaNodeId) {
      return true;
    }

    if (visitedNodeIds.has(parentAreaNodeId)) {
      return false;
    }

    visitedNodeIds.add(parentAreaNodeId);
    parentAreaNodeId = nodeById.get(parentAreaNodeId)?.metadata?.parentAreaNodeId;
  }

  return false;
}

function getDefaultEdgeHandles(
  sourceNode: DiagramNode | undefined,
  targetNode: DiagramNode | undefined
): Pick<DiagramEdge, "sourceHandleId" | "targetHandleId"> {
  if (!sourceNode || !targetNode) {
    return {
      sourceHandleId: EDGE_HANDLE_IDS.right,
      targetHandleId: EDGE_HANDLE_IDS.left
    };
  }

  const sourceCenter = getNodeCenter(sourceNode);
  const targetCenter = getNodeCenter(targetNode);
  const deltaX = targetCenter.x - sourceCenter.x;
  const deltaY = targetCenter.y - sourceCenter.y;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0
      ? {
          sourceHandleId: EDGE_HANDLE_IDS.right,
          targetHandleId: EDGE_HANDLE_IDS.left
        }
      : {
          sourceHandleId: EDGE_HANDLE_IDS.left,
          targetHandleId: EDGE_HANDLE_IDS.right
        };
  }

  return deltaY >= 0
    ? {
        sourceHandleId: EDGE_HANDLE_IDS.bottom,
        targetHandleId: EDGE_HANDLE_IDS.top
      }
    : {
        sourceHandleId: EDGE_HANDLE_IDS.top,
        targetHandleId: EDGE_HANDLE_IDS.bottom
      };
}

function getNodeCenter(node: DiagramNode): DiagramNode["position"] {
  return {
    x: node.position.x + node.size.width / 2,
    y: node.position.y + node.size.height / 2
  };
}

// AI 초안의 vpcId/subnetId/contains/hosts 정보를 보드의 포함관계 이름표로 바꿉니다.
function applyAreaParentMetadata(
  nodes: readonly DiagramNode[],
  edges: readonly ArchitectureJson["edges"][number][]
): DiagramNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return nodes.map((node) => {
    const parentAreaNodeId =
      findSecurityBoundaryParentAreaNodeId(node, nodeById) ??
      node.metadata?.parentAreaNodeId ??
      findConfigParentAreaNodeId(node, nodeById) ??
      findEdgeParentAreaNodeId(node, nodeById, edges);

    if (!parentAreaNodeId) {
      return node;
    }

    return {
      ...node,
      metadata: {
        ...node.metadata,
        parentAreaNodeId
      }
    };
  });
}

// 자식이 밖으로 튀어나오지 않도록 VPC/Subnet 박스 크기를 필요한 만큼 키웁니다.
function fitAreaNodesToChildren(nodes: readonly DiagramNode[]): DiagramNode[] {
  let currentNodes = [...nodes];

  for (let pass = 0; pass < MAX_AREA_FIT_PASSES; pass += 1) {
    const nextNodes = fitAreaNodesToDirectChildren(currentNodes);

    if (areNodeLayoutsEqual(currentNodes, nextNodes)) {
      return nextNodes;
    }

    currentNodes = nextNodes;
  }

  return currentNodes;
}

// 깊게 중첩된 Region/VPC/AZ/SG/Subnet 박스가 안정될 때 반복 계산을 멈춥니다.
function areNodeLayoutsEqual(leftNodes: readonly DiagramNode[], rightNodes: readonly DiagramNode[]): boolean {
  return leftNodes.every((leftNode, index) => {
    const rightNode = rightNodes[index];

    return (
      rightNode?.position.x === leftNode.position.x &&
      rightNode.position.y === leftNode.position.y &&
      rightNode.size.width === leftNode.size.width &&
      rightNode.size.height === leftNode.size.height
    );
  });
}

function fitAreaNodesToDirectChildren(nodes: readonly DiagramNode[]): DiagramNode[] {
  const childrenByParentId = new Map<string, DiagramNode[]>();

  for (const node of nodes) {
    const parentAreaNodeId = node.metadata?.parentAreaNodeId;

    if (!parentAreaNodeId) {
      continue;
    }

    const children = childrenByParentId.get(parentAreaNodeId) ?? [];
    children.push(node);
    childrenByParentId.set(parentAreaNodeId, children);
  }

  return nodes.map((node) => {
    if (!isAreaDiagramNode(node)) {
      return node;
    }

    const children = childrenByParentId.get(node.id) ?? [];

    if (children.length === 0) {
      return node;
    }

    const requiredLayout = getRequiredAreaLayout(node, children);

    if (
      requiredLayout.position.x === node.position.x &&
      requiredLayout.position.y === node.position.y &&
      requiredLayout.size.width === node.size.width &&
      requiredLayout.size.height === node.size.height
    ) {
      return node;
    }

    return {
      ...node,
      position: requiredLayout.position,
      size: requiredLayout.size
    };
  });
}

function getRequiredAreaLayout(
  node: DiagramNode,
  children: readonly DiagramNode[]
): Pick<DiagramNode, "position" | "size"> {
  let left = node.position.x;
  let top = node.position.y;
  let right = node.position.x + node.size.width;
  let bottom = node.position.y + node.size.height;

  for (const child of children) {
    const childFitSize = getAreaChildFitSize(child);
    left = Math.min(left, child.position.x - AREA_CHILD_PADDING);
    top = Math.min(top, child.position.y - AREA_CHILD_PADDING);
    right = Math.max(right, child.position.x + childFitSize.width + AREA_CHILD_PADDING);
    bottom = Math.max(bottom, child.position.y + childFitSize.height + AREA_CHILD_PADDING);
  }

  return {
    position: {
      x: left,
      y: top
    },
    size: {
      width: right - left,
      height: bottom - top
    }
  };
}

function getAreaChildFitSize(child: DiagramNode): DiagramNode["size"] {
  if (isAreaDiagramNode(child) || child.kind !== "resource") {
    return child.size;
  }

  return {
    width: Math.max(child.size.width, MIN_RESOURCE_AREA_CHILD_FOOTPRINT.width),
    height: Math.max(child.size.height, MIN_RESOURCE_AREA_CHILD_FOOTPRINT.height)
  };
}

function findSecurityBoundaryParentAreaNodeId(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): string | undefined {
  if (isSecurityGroupAreaNode(node)) {
    return findProtectedSubnetAreaNodeId(node, nodeById);
  }

  const securityGroupNode = findReferencedSecurityGroupAreaNodes(node, nodeById)[0];

  return securityGroupNode?.id;
}

function findProtectedSubnetAreaNodeId(
  securityGroupNode: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): string | undefined {
  for (const node of nodeById.values()) {
    if (node.id === securityGroupNode.id || !referencesSecurityGroup(node, securityGroupNode, nodeById)) {
      continue;
    }

    const subnetNode = findConfigAreaNodeByParameter(node, "subnetId", nodeById);

    if (subnetNode && subnetNode.id !== securityGroupNode.id) {
      return subnetNode.id;
    }
  }

  return undefined;
}

function referencesSecurityGroup(
  node: DiagramNode,
  securityGroupNode: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  return getSecurityGroupReferenceValues(node).some((referenceValue) => {
    const referencedNode = findReferencedNode(referenceValue, nodeById);

    return referencedNode?.id === securityGroupNode.id;
  });
}

function findReferencedSecurityGroupAreaNodes(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): DiagramNode[] {
  return getSecurityGroupReferenceValues(node)
    .map((referenceValue) => findReferencedNode(referenceValue, nodeById))
    .filter((referencedNode): referencedNode is DiagramNode => {
      return referencedNode !== undefined && isSecurityGroupAreaNode(referencedNode);
    });
}

function findConfigParentAreaNodeId(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): string | undefined {
  const subnetNode = findConfigAreaNodeByParameter(node, "subnetId", nodeById);

  if (subnetNode && subnetNode.id !== node.id) {
    return subnetNode.id;
  }

  const vpcNode = findConfigAreaNodeByParameter(node, "vpcId", nodeById);

  return vpcNode && vpcNode.id !== node.id ? vpcNode.id : undefined;
}

function findConfigAreaNodeByParameter(
  node: DiagramNode,
  parameterName: string,
  nodeById: ReadonlyMap<string, DiagramNode>
): DiagramNode | undefined {
  const referenceValue = getStringParameterValue(node, parameterName);
  const referencedNode = referenceValue ? findReferencedNode(referenceValue, nodeById) : undefined;

  return referencedNode && isAreaDiagramNode(referencedNode) ? referencedNode : undefined;
}

function findReferencedNode(
  rawReferenceValue: string,
  nodeById: ReadonlyMap<string, DiagramNode>
): DiagramNode | undefined {
  const referenceValue = normalizeReferenceValue(rawReferenceValue);
  const directNode = nodeById.get(referenceValue);

  if (directNode) {
    return directNode;
  }

  for (const node of nodeById.values()) {
    if (matchesTerraformNodeReference(referenceValue, node)) {
      return node;
    }
  }

  return undefined;
}

function matchesTerraformNodeReference(referenceValue: string, node: DiagramNode): boolean {
  const parameters = node.parameters;

  if (!parameters) {
    return false;
  }

  const referenceNames = new Set([parameters.resourceName, node.id]);
  const references = [...referenceNames].flatMap((resourceName) => {
    const resourceReference = `${parameters.resourceType}.${resourceName}.id`;

    return parameters.terraformBlockType === "data"
      ? [resourceReference, `data.${resourceReference}`]
      : [resourceReference];
  });

  return references.includes(referenceValue);
}

function normalizeReferenceValue(value: string): string {
  return value.trim().replace(/^\$\{(.+)\}$/u, "$1");
}

function findEdgeParentAreaNodeId(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>,
  edges: readonly ArchitectureJson["edges"][number][]
): string | undefined {
  for (const edge of edges) {
    if (edge.targetId !== node.id || !isAreaParentEdge(edge)) {
      continue;
    }

    const sourceNode = nodeById.get(edge.sourceId);

    if (sourceNode && sourceNode.id !== node.id && isAreaDiagramNode(sourceNode)) {
      return sourceNode.id;
    }
  }

  return undefined;
}

function isAreaParentEdge(edge: ArchitectureJson["edges"][number]): boolean {
  return typeof edge.label === "string" && AREA_PARENT_EDGE_LABELS.has(edge.label.trim().toLowerCase());
}

function isAreaDiagramNode(node: DiagramNode): boolean {
  return isAreaNode(node);
}

function isSecurityGroupAreaNode(node: DiagramNode): boolean {
  return node.kind === "resource" && (node.parameters?.resourceType ?? node.type) === "aws_security_group";
}

function getStringParameterValue(node: DiagramNode, key: string): string | undefined {
  const value = node.parameters?.values[key];

  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function getSecurityGroupReferenceValues(node: DiagramNode): string[] {
  return SECURITY_GROUP_REFERENCE_KEYS.flatMap((key) => getStringParameterValues(node, key));
}

function getStringParameterValues(node: DiagramNode, key: string): string[] {
  const value = node.parameters?.values[key];

  if (typeof value === "string" && value.trim().length > 0) {
    return [value];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isString).filter((item) => item.trim().length > 0);
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
