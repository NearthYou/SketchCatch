import type {
  DiagramJson,
  DiagramNodeParameters,
  InfrastructureGraph,
  InfrastructureGraphNode,
  ResourceType
} from "@sketchcatch/types";

const DEFAULT_TERRAFORM_BLOCK_TYPE = "resource";

export function buildInfrastructureGraphFromDiagramJson(
  diagramJson: DiagramJson
): InfrastructureGraph {
  return {
    nodes: diagramJson.nodes.flatMap((node): InfrastructureGraphNode[] => {
      if (node.kind !== "resource" || !isRenderableParameters(node.parameters)) {
        return [];
      }

      return [
        {
          id: node.id,
          type: toResourceType(node.parameters.resourceType),
          label: node.label,
          iac: {
            provider: "aws",
            terraformBlockType:
              node.parameters.terraformBlockType ?? DEFAULT_TERRAFORM_BLOCK_TYPE,
            resourceType: node.parameters.resourceType,
            resourceName: node.parameters.resourceName,
            fileName: node.parameters.fileName
          },
          config: node.parameters.values
        }
      ];
    }),
    edges: []
  };
}

function isRenderableParameters(
  parameters: DiagramNodeParameters | undefined
): parameters is DiagramNodeParameters {
  return parameters !== undefined && parameters.invalid !== true;
}

function toResourceType(resourceType: string): ResourceType {
  if (resourceType === "aws_vpc") {
    return "VPC";
  }

  return "UNKNOWN";
}
