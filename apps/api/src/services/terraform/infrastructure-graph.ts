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
const NON_RENDERABLE_TERRAFORM_CONFIG_KEYS = new Set([
  "applicationPurpose",
  "application_purpose",
  "bucketPurpose",
  "bucket_purpose",
  "diagramHeight",
  "diagram_height",
  "diagramAreaLabel",
  "diagram_area_label",
  "diagramBorderColor",
  "diagram_border_color",
  "diagramIconUrl",
  "diagram_icon_url",
  "diagramKind",
  "diagram_kind",
  "diagramLabel",
  "diagram_label",
  "diagramRenderAsResource",
  "diagram_render_as_resource",
  "diagramTextColor",
  "diagram_text_color",
  "diagramType",
  "diagram_type",
  "diagramWidth",
  "diagram_width",
  "managedByAutoScalingGroup",
  "managed_by_auto_scaling_group",
  "originResourceId",
  "origin_resource_id",
  "publicAccessBlock",
  "public_access_block",
  "servicePurpose",
  "service_purpose",
  "sketchcatchReferenceTerraform",
  "sketchcatch_reference_terraform",
  "terraformResourceName",
  "terraform_resource_name",
  "terraformResourceType",
  "terraform_resource_type"
]);

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

  if (node.parameters.values?.["sketchcatchReferenceTerraform"] === true) {
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
    config: getRenderableConfig(node, nodeById)
  };
}

function getRenderableConfig(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): Record<string, unknown> {
  const values = filterRenderableConfigValues(
    node.parameters?.resourceType,
    node.parameters?.values ?? {}
  );
  const inheritedAvailabilityZone = getInheritedAvailabilityZone(node, nodeById);

  if (!inheritedAvailabilityZone || hasOwnAvailabilityZone(values)) {
    return values;
  }

  return {
    ...values,
    availabilityZone: inheritedAvailabilityZone
  };
}

function filterRenderableConfigValues(
  resourceType: string | undefined,
  values: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) =>
        !NON_RENDERABLE_TERRAFORM_CONFIG_KEYS.has(key) &&
        !isInvalidAutoscalingGroupDesiredCapacity(resourceType, key, value)
    )
  );
}

function isInvalidAutoscalingGroupDesiredCapacity(
  resourceType: string | undefined,
  key: string,
  value: unknown
): boolean {
  return (
    resourceType === "aws_autoscaling_group" &&
    (key === "desiredCapacity" || key === "desired_capacity") &&
    typeof value !== "number"
  );
}

function getInheritedAvailabilityZone(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): string | null {
  if (!isAvailabilityZoneChildResource(node)) {
    return null;
  }

  const parentAreaNodeId = node.metadata?.parentAreaNodeId;
  const parentNode = parentAreaNodeId ? nodeById.get(parentAreaNodeId) : undefined;

  if (!parentNode || getResourceNodeType(parentNode) !== "aws_availability_zone") {
    return null;
  }

  const availabilityZone = parentNode.parameters?.values?.["awsAvailabilityZone"];

  return typeof availabilityZone === "string" && availabilityZone.trim().length > 0
    ? availabilityZone
    : null;
}

function isAvailabilityZoneChildResource(node: DiagramNode): boolean {
  const resourceType = getResourceNodeType(node);

  return resourceType === "aws_subnet" || resourceType === "aws_ebs_volume";
}

function getResourceNodeType(node: DiagramNode): string {
  return node.parameters?.resourceType ?? node.type;
}

function hasOwnAvailabilityZone(values: Record<string, unknown>): boolean {
  const availabilityZone = values["availabilityZone"];

  return availabilityZone !== undefined && availabilityZone !== null && availabilityZone !== "";
}
