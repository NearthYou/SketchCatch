import { getResourceDefinitionByTerraform } from "@sketchcatch/types/resource-definitions";
import type {
  DiagramJson,
  DiagramNode,
  InfrastructureGraph,
  InfrastructureGraphEdge,
  InfrastructureGraphNode,
  TerraformBlockType
} from "@sketchcatch/types";

const DEFAULT_TERRAFORM_BLOCK_TYPE: TerraformBlockType = "resource";

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
    config: node.parameters.values
  };
}
