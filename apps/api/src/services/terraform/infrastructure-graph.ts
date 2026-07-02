import type {
  DiagramJson,
  DiagramNodeParameters,
  InfrastructureGraph,
  InfrastructureGraphEdge,
  InfrastructureGraphNode,
  ResourceType,
  TerraformBlockType
} from "@sketchcatch/types";

const DEFAULT_TERRAFORM_BLOCK_TYPE: TerraformBlockType = "resource";
const RESOURCE_TYPE_BY_TERRAFORM_RESOURCE_TYPE: Readonly<Record<string, ResourceType>> = {
  aws_ami: "AMI",
  aws_instance: "EC2",
  aws_internet_gateway: "INTERNET_GATEWAY",
  aws_route_table: "ROUTE_TABLE",
  aws_route_table_association: "ROUTE_TABLE_ASSOCIATION",
  aws_s3_bucket: "S3",
  aws_security_group: "SECURITY_GROUP",
  aws_subnet: "SUBNET",
  aws_vpc: "VPC"
};
const ALLOWED_TERRAFORM_PREVIEW_BLOCKS = new Set<string>([
  createTerraformBlockKey("resource", "aws_vpc"),
  createTerraformBlockKey("resource", "aws_subnet"),
  createTerraformBlockKey("resource", "aws_internet_gateway"),
  createTerraformBlockKey("resource", "aws_route_table"),
  createTerraformBlockKey("resource", "aws_route_table_association"),
  createTerraformBlockKey("resource", "aws_security_group"),
  createTerraformBlockKey("resource", "aws_instance"),
  createTerraformBlockKey("resource", "aws_s3_bucket"),
  createTerraformBlockKey("data", "aws_ami")
]);

export function buildInfrastructureGraphFromDiagramJson(
  diagramJson: DiagramJson
): InfrastructureGraph {
  const nodes = diagramJson.nodes.flatMap((node): InfrastructureGraphNode[] => {
    if (node.kind !== "resource" || !isRenderableParameters(node.parameters)) {
      return [];
    }

    const terraformBlockType = node.parameters.terraformBlockType ?? DEFAULT_TERRAFORM_BLOCK_TYPE;

    if (!isAllowedTerraformPreviewBlock(terraformBlockType, node.parameters.resourceType)) {
      return [];
    }

    return [
      {
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
      }
    ];
  });
  const projectedNodeIds = new Set(nodes.map((node) => node.id));

  return {
    nodes,
    edges: diagramJson.edges.flatMap((edge): InfrastructureGraphEdge[] => {
      if (!projectedNodeIds.has(edge.sourceNodeId) || !projectedNodeIds.has(edge.targetNodeId)) {
        return [];
      }

      return [
        {
          id: edge.id,
          sourceId: edge.sourceNodeId,
          targetId: edge.targetNodeId,
          ...(edge.label === undefined ? {} : { label: edge.label })
        }
      ];
    })
  };
}

function isRenderableParameters(
  parameters: DiagramNodeParameters | undefined
): parameters is DiagramNodeParameters {
  return parameters !== undefined && parameters.invalid !== true;
}

function toResourceType(resourceType: string): ResourceType {
  return RESOURCE_TYPE_BY_TERRAFORM_RESOURCE_TYPE[resourceType] ?? "UNKNOWN";
}

function isAllowedTerraformPreviewBlock(
  terraformBlockType: TerraformBlockType,
  resourceType: string
): boolean {
  return ALLOWED_TERRAFORM_PREVIEW_BLOCKS.has(
    createTerraformBlockKey(terraformBlockType, resourceType)
  );
}

function createTerraformBlockKey(
  terraformBlockType: TerraformBlockType,
  resourceType: string
): string {
  return `${terraformBlockType}:${resourceType}`;
}
