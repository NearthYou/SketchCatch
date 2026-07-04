import { getResourceDefinitionByTerraform } from "@sketchcatch/types/resource-definitions";
import type {
  AwsAvailabilityZoneCode,
  DiagramJson,
  DiagramNode,
  InfrastructureGraph,
  InfrastructureGraphEdge,
  InfrastructureGraphNode,
  TerraformBlockType
} from "@sketchcatch/types";

const DEFAULT_TERRAFORM_BLOCK_TYPE: TerraformBlockType = "resource";
const defaultAwsAvailabilityZone: AwsAvailabilityZoneCode = "ap-northeast-2a";
const legacyAvailabilityZoneDesignNodeTypes = new Set(["design_az", "sketchcatch_az"]);
const availabilityZoneResourceNodeTypes = new Set(["aws_availability_zone"]);
const availabilityZoneAwareResourceTypes = new Set(["aws_subnet", "aws_ebs_volume"]);
const awsAvailabilityZoneCodePattern = /^[a-z]{2}-[a-z]+-\d[a-z]$/;

export function buildInfrastructureGraphFromDiagramJson(diagramJson: DiagramJson): InfrastructureGraph {
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  const nodes = diagramJson.nodes.flatMap((node) => {
    const graphNode = toInfrastructureGraphNode(node, nodeById);

    return graphNode ? [graphNode] : [];
  });
  const nodeIds = new Set(nodes.map((node) => node.id));

  return {
    nodes,
    edges: diagramJson.edges.flatMap((edge): InfrastructureGraphEdge[] => {
      if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
        return [];
      }

      return [
        {
          id: edge.id,
          sourceId: edge.sourceNodeId,
          targetId: edge.targetNodeId,
          ...(edge.label !== undefined ? { label: edge.label } : {})
        }
      ];
    })
  };
}

function toInfrastructureGraphNode(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): InfrastructureGraphNode | null {
  if (node.kind !== "resource" || !node.parameters) {
    return null;
  }

  const terraformBlockType = node.parameters.terraformBlockType ?? DEFAULT_TERRAFORM_BLOCK_TYPE;
  const resourceDefinition = getResourceDefinitionByTerraform(
    terraformBlockType,
    node.parameters.resourceType
  );

  if (resourceDefinition?.capabilities.terraformPreview !== true) {
    return null;
  }

  return {
    id: node.id,
    label: node.label,
    iac: {
      provider: resourceDefinition.provider,
      terraformBlockType,
      resourceType: node.parameters.resourceType,
      resourceName: node.parameters.resourceName,
      fileName: node.parameters.fileName
    },
    config: applyAvailabilityZonePlacement(node, node.parameters.values, nodeById)
  };
}

function applyAvailabilityZonePlacement(
  node: DiagramNode,
  values: Record<string, unknown>,
  nodeById: ReadonlyMap<string, DiagramNode>
): Record<string, unknown> {
  const resourceType = node.parameters?.resourceType;

  if (
    !resourceType ||
    !availabilityZoneAwareResourceTypes.has(resourceType) ||
    values["availabilityZone"] !== undefined ||
    values["availability_zone"] !== undefined
  ) {
    return values;
  }

  const availabilityZone = findAncestorAvailabilityZone(node, nodeById);

  return availabilityZone ? { ...values, availabilityZone } : values;
}

function findAncestorAvailabilityZone(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): AwsAvailabilityZoneCode | null {
  const visitedNodeIds = new Set<string>();
  let parentAreaNodeId = node.metadata?.parentAreaNodeId;

  while (parentAreaNodeId) {
    if (visitedNodeIds.has(parentAreaNodeId)) {
      return null;
    }

    visitedNodeIds.add(parentAreaNodeId);

    const parentNode = nodeById.get(parentAreaNodeId);

    if (!parentNode) {
      return null;
    }

    if (isAvailabilityZoneAreaNode(parentNode)) {
      return getAvailabilityZoneFromAreaNode(parentNode);
    }

    parentAreaNodeId = parentNode.metadata?.parentAreaNodeId;
  }

  return null;
}

function isAvailabilityZoneAreaNode(node: DiagramNode): boolean {
  return (
    (node.kind === "design" && legacyAvailabilityZoneDesignNodeTypes.has(node.type)) ||
    (node.kind === "resource" && availabilityZoneResourceNodeTypes.has(getResourceNodeType(node)))
  );
}

function getAvailabilityZoneFromAreaNode(node: DiagramNode): AwsAvailabilityZoneCode {
  const availabilityZone =
    node.parameters?.values.awsAvailabilityZone ??
    node.parameters?.values.availabilityZone ??
    node.metadata?.awsAvailabilityZone;

  return isAwsAvailabilityZoneCode(availabilityZone) ? availabilityZone : defaultAwsAvailabilityZone;
}

function getResourceNodeType(node: DiagramNode): string {
  return node.parameters?.resourceType ?? node.type;
}

function isAwsAvailabilityZoneCode(value: unknown): value is AwsAvailabilityZoneCode {
  return typeof value === "string" && awsAvailabilityZoneCodePattern.test(value);
}
