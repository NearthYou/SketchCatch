import type {
  DiagramJson,
  DiagramNode,
  InfrastructureGraph,
  InfrastructureGraphEdge,
  InfrastructureGraphNode,
  ResourceType,
  TerraformBlockType
} from "@sketchcatch/types";

const DEFAULT_TERRAFORM_BLOCK_TYPE: TerraformBlockType = "resource";

const PREVIEW_SUPPORTED_BLOCKS = new Set<string>([
  "resource/aws_vpc",
  "resource/aws_subnet",
  "resource/aws_internet_gateway",
  "resource/aws_route_table",
  "resource/aws_route_table_association",
  "resource/aws_security_group",
  "resource/aws_security_group_rule",
  "resource/aws_instance",
  "resource/aws_s3_bucket",
  "data/aws_ami"
]);

const RESOURCE_TYPE_BY_TERRAFORM_TYPE: Record<string, ResourceType> = {
  aws_ami: "AMI",
  aws_instance: "EC2",
  aws_internet_gateway: "INTERNET_GATEWAY",
  aws_route_table: "ROUTE_TABLE",
  aws_route_table_association: "ROUTE_TABLE_ASSOCIATION",
  aws_s3_bucket: "S3",
  aws_security_group: "SECURITY_GROUP",
  aws_security_group_rule: "SECURITY_GROUP",
  aws_subnet: "SUBNET",
  aws_vpc: "VPC"
};

export function buildInfrastructureGraphFromDiagramJson(diagramJson: DiagramJson): InfrastructureGraph {
  const nodes = diagramJson.nodes.flatMap((node) => {
    const graphNode = toInfrastructureGraphNode(node);

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

function toInfrastructureGraphNode(node: DiagramNode): InfrastructureGraphNode | null {
  if (node.kind !== "resource" || !node.parameters) {
    return null;
  }

  const terraformBlockType = node.parameters.terraformBlockType ?? DEFAULT_TERRAFORM_BLOCK_TYPE;

  if (!isPreviewSupportedBlock(terraformBlockType, node.parameters.resourceType)) {
    return null;
  }

  return {
    id: node.id,
    type: toResourceType(node.parameters.resourceType),
    label: node.label,
    iac: {
      provider: "aws",
      terraformBlockType,
      resourceType: node.parameters.resourceType,
      resourceName: node.parameters.resourceName,
      fileName: node.parameters.fileName
    },
    config: node.parameters.values
  };
}

function isPreviewSupportedBlock(
  terraformBlockType: TerraformBlockType,
  resourceType: string
): boolean {
  return PREVIEW_SUPPORTED_BLOCKS.has(`${terraformBlockType}/${resourceType}`);
}

function toResourceType(terraformResourceType: string): ResourceType {
  return RESOURCE_TYPE_BY_TERRAFORM_TYPE[terraformResourceType] ?? "UNKNOWN";
}
