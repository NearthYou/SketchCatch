import { getResourceDefinitionByTerraform } from "@sketchcatch/types/resource-definitions";
import type {
  DiagramJson,
  DiagramNode,
  InfrastructureGraph,
  InfrastructureGraphEdge,
  InfrastructureGraphNode,
  TerraformBlockType
} from "@sketchcatch/types";
import { findKnownTerraformReferenceResourceIds } from "../../reverse-engineering/reverse-engineering-import-dependency.js";

const DEFAULT_TERRAFORM_BLOCK_TYPE: TerraformBlockType = "resource";
const REVERSE_ENGINEERING_RENDERABLE_CONFIG_KEYS = new Map<string, ReadonlySet<string>>([
  ["aws_eip", new Set(["domain", "tags"])],
  [
    "aws_nat_gateway",
    new Set(["allocationId", "connectivityType", "secondaryAllocationIds", "subnetId", "tags"])
  ],
  [
    "aws_lb_target_group",
    new Set([
      "name",
      "port",
      "protocol",
      "targetType",
      "vpcId",
      "deregistrationDelay",
      "healthCheck",
      "tags"
    ])
  ],
  [
    "aws_lb_listener",
    new Set(["loadBalancerArn", "port", "protocol", "certificateArn", "defaultAction", "tags"])
  ]
]);
const NON_RENDERABLE_TERRAFORM_CONFIG_KEYS = new Set([
  "analysisExcluded",
  "analysis_excluded",
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
  "parentAreaNodeId",
  "parent_area_node_id",
  "providerResourceId",
  "provider_resource_id",
  "providerResourceType",
  "provider_resource_type",
  "publicAccessBlock",
  "public_access_block",
  "reverseEngineeringDraftId",
  "reverse_engineering_draft_id",
  "reverseEngineeringManagement",
  "reverse_engineering_management",
  "reverseEngineeringObservedConfig",
  "reverse_engineering_observed_config",
  "reverseEngineeringSourceKind",
  "reverse_engineering_source_kind",
  "reverseEngineeringSourceScanId",
  "reverse_engineering_source_scan_id",
  "servicePurpose",
  "service_purpose",
  "sketchcatchReferenceTerraform",
  "sketchcatch_reference_terraform",
  "terraformResourceName",
  "terraform_resource_name",
  "terraformResourceType",
  "terraform_resource_type",
  "terraformBlockType",
  "terraform_block_type",
  "terraformFileName",
  "terraform_file_name",
  "templateId",
  "template_id",
  "templateResourceId",
  "template_resource_id",
  "tier"
]);

/** gg: 서버 확정된 source와 완전한 same-scan 참조만 Terraform graph에 남깁니다. */
export function buildInfrastructureGraphFromDiagramJson(
  diagramJson: DiagramJson
): InfrastructureGraph {
  const nodeById = new Map(diagramJson.nodes.map((node) => [node.id, node]));
  const projectedNodes = diagramJson.nodes.flatMap((node) => {
    const graphNode = toInfrastructureGraphNode(node, nodeById);

    return graphNode ? [graphNode] : [];
  });
  const nodes = removeNodesWithMissingReverseEngineeringDependencies(
    diagramJson.nodes,
    projectedNodes
  );
  const nodeIds = new Set(nodes.map((node) => node.id));

  return {
    nodes,
    edges: diagramJson.edges.flatMap((edge): InfrastructureGraphEdge[] => {
      if (
        edge.metadata?.presentationRole === "summary" ||
        !nodeIds.has(edge.sourceNodeId) ||
        !nodeIds.has(edge.targetNodeId)
      ) {
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

/** gg: 선택되지 않은 source 참조가 있으면 의존하는 상위 node까지 반복해서 제거합니다. */
function removeNodesWithMissingReverseEngineeringDependencies(
  diagramNodes: readonly DiagramNode[],
  projectedNodes: readonly InfrastructureGraphNode[]
): InfrastructureGraphNode[] {
  const sourceAddressByResourceId = new Map<string, string>();
  for (const node of diagramNodes) {
    if (!isReverseEngineeringSourceNode(node) || !node.parameters) {
      continue;
    }
    const resourceType = node.parameters.resourceType?.trim();
    const resourceName = node.parameters.resourceName?.trim();
    if (node.parameters.terraformBlockType === "resource" && resourceType && resourceName) {
      sourceAddressByResourceId.set(node.id, `${resourceType}.${resourceName}`);
    }
  }

  const activeNodeById = new Map(projectedNodes.map((node) => [node.id, node]));
  let removedNode = true;
  while (removedNode) {
    removedNode = false;
    for (const node of [...activeNodeById.values()]) {
      const referencedSourceIds = findKnownTerraformReferenceResourceIds(
        node.config,
        sourceAddressByResourceId
      );
      if ([...referencedSourceIds].some((resourceId) => !activeNodeById.has(resourceId))) {
        activeNodeById.delete(node.id);
        removedNode = true;
      }
    }
  }

  return projectedNodes.filter((node) => activeNodeById.has(node.id));
}

/** 보드 Resource를 Terraform graph로 승격하되 참고용·미승인 AWS node는 제외한다. */
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

  if (node.parameters.values?.["analysisExcluded"] === true) {
    return null;
  }

  if (isReverseEngineeringSourceNode(node) && !hasConfirmedImportDecision(node)) {
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

/** gg: 일부 provenance가 손상돼도 AWS에서 가져온 node를 일반 신규 리소스로 오인하지 않습니다. */
function isReverseEngineeringSourceNode(node: DiagramNode): boolean {
  const values = node.parameters?.values;

  return Boolean(
    node.metadata?.reverseEngineering?.source === "aws_scan" ||
    Object.prototype.hasOwnProperty.call(values ?? {}, "reverseEngineeringSourceKind") ||
    Object.prototype.hasOwnProperty.call(values ?? {}, "reverse_engineering_source_kind") ||
    Object.prototype.hasOwnProperty.call(values ?? {}, "reverseEngineeringSourceScanId") ||
    Object.prototype.hasOwnProperty.call(values ?? {}, "reverse_engineering_source_scan_id") ||
    Object.prototype.hasOwnProperty.call(values ?? {}, "reverseEngineeringDraftId") ||
    Object.prototype.hasOwnProperty.call(values ?? {}, "reverse_engineering_draft_id") ||
    Object.prototype.hasOwnProperty.call(values ?? {}, "reverseEngineeringManagement") ||
    Object.prototype.hasOwnProperty.call(values ?? {}, "reverse_engineering_management") ||
    Object.prototype.hasOwnProperty.call(values ?? {}, "reverseEngineeringObservedConfig") ||
    Object.prototype.hasOwnProperty.call(values ?? {}, "reverse_engineering_observed_config")
  );
}

/** gg: 사용자가 기존 인프라 관리 대상으로 고르고 서버가 확정한 ready 결정만 Terraform에 포함합니다. */
function hasConfirmedImportDecision(node: DiagramNode): boolean {
  const decision = node.metadata?.reverseEngineering?.importDecision;

  return Boolean(
    decision &&
    typeof decision === "object" &&
    Object.keys(decision).length === 3 &&
    decision.version === 1 &&
    decision.mode === "import_existing" &&
    decision.statusAtConfirmation === "ready"
  );
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
  const reverseEngineeringAllowedKeys = isReverseEngineeringConfig(values)
    ? REVERSE_ENGINEERING_RENDERABLE_CONFIG_KEYS.get(resourceType ?? "")
    : undefined;

  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) =>
        !NON_RENDERABLE_TERRAFORM_CONFIG_KEYS.has(key) &&
        (reverseEngineeringAllowedKeys === undefined || reverseEngineeringAllowedKeys.has(key)) &&
        !isInvalidAutoscalingGroupDesiredCapacity(resourceType, key, value)
    )
  );
}

function isReverseEngineeringConfig(values: Record<string, unknown>): boolean {
  return (
    values["reverseEngineeringSourceKind"] === "saved_scan" ||
    values["reverse_engineering_source_kind"] === "saved_scan" ||
    typeof values["providerResourceType"] === "string" ||
    typeof values["provider_resource_type"] === "string"
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
