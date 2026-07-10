import type { DiagramEdge, DiagramNode } from "../../../../packages/types/src";

type ParameterReference = {
  parameterPath: string;
  targetResourceType: string;
  value: unknown;
};

type TerraformReference = {
  resourceName: string;
  resourceType: string;
  terraformBlockType: "data" | "resource";
};

const parameterReferenceEdgeManager = "parameter-reference";

export function syncParameterReferenceEdgesForNode(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[],
  sourceNodeId: string
): DiagramEdge[] {
  const preservedEdges = removeManagedEdgesForSources(edges, new Set([sourceNodeId]));

  return [...preservedEdges, ...createParameterReferenceEdges(nodes, new Set([sourceNodeId]))];
}

export function syncParameterReferenceEdges(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[]
): DiagramEdge[] {
  return [
    ...edges.filter((edge) => edge.metadata?.managedBy !== parameterReferenceEdgeManager),
    ...createParameterReferenceEdges(nodes)
  ];
}

function removeManagedEdgesForSources(
  edges: readonly DiagramEdge[],
  sourceNodeIds: ReadonlySet<string>
): DiagramEdge[] {
  return edges.filter(
    (edge) =>
      !sourceNodeIds.has(edge.sourceNodeId) || edge.metadata?.managedBy !== parameterReferenceEdgeManager
  );
}

function createParameterReferenceEdges(
  nodes: readonly DiagramNode[],
  sourceNodeIds?: ReadonlySet<string>
): DiagramEdge[] {
  const targetNodeByIdentity = createTargetNodeByIdentity(nodes);
  const nextEdges: DiagramEdge[] = [];
  const seenReferences = new Set<string>();

  for (const sourceNode of nodes) {
    if (!sourceNode.parameters || (sourceNodeIds && !sourceNodeIds.has(sourceNode.id))) {
      continue;
    }

    for (const parameterReference of getParameterReferences(sourceNode)) {
      if (typeof parameterReference.value !== "string") {
        continue;
      }

      const terraformReference = parseTerraformReference(parameterReference.value);

      if (!terraformReference || terraformReference.resourceType !== parameterReference.targetResourceType) {
        continue;
      }

      const targetNode = targetNodeByIdentity.get(getTerraformIdentity(terraformReference));

      if (!targetNode) {
        continue;
      }

      const semanticKey = `${sourceNode.id}:${parameterReference.parameterPath}:${targetNode.id}`;

      if (seenReferences.has(semanticKey)) {
        continue;
      }

      seenReferences.add(semanticKey);
      nextEdges.push({
        id: `parameter-reference:${sourceNode.id}:${parameterReference.parameterPath}:${targetNode.id}`,
        sourceNodeId: sourceNode.id,
        targetNodeId: targetNode.id,
        type: "smoothstep",
        style: {
          lineStyle: "solid",
          width: "thin"
        },
        metadata: {
          managedBy: parameterReferenceEdgeManager,
          parameterPath: parameterReference.parameterPath
        }
      });
    }
  }

  return nextEdges;
}

function createTargetNodeByIdentity(nodes: readonly DiagramNode[]): Map<string, DiagramNode> {
  const targetNodeByIdentity = new Map<string, DiagramNode>();

  for (const node of nodes) {
    if (node.kind !== "resource" || !node.parameters) {
      continue;
    }

    const identity = getTerraformIdentity({
      terraformBlockType: node.parameters.terraformBlockType ?? "resource",
      resourceType: node.parameters.resourceType,
      resourceName: node.parameters.resourceName
    });

    if (!targetNodeByIdentity.has(identity)) {
      targetNodeByIdentity.set(identity, node);
    }
  }

  return targetNodeByIdentity;
}

function getTerraformIdentity(reference: TerraformReference): string {
  return `${reference.terraformBlockType}:${reference.resourceType}:${reference.resourceName}`;
}

function getParameterReferences(sourceNode: DiagramNode): ParameterReference[] {
  const params = sourceNode.parameters;

  if (!params || !params.values) {
    return [];
  }

  switch (params.resourceType) {
    case "aws_lb_listener":
      return [
        {
          parameterPath: "loadBalancerArn",
          targetResourceType: "aws_lb",
          value: params.values.loadBalancerArn
        },
        ...getNestedTargetGroupReferences(params.values.defaultAction)
      ];
    case "aws_autoscaling_group":
      return getListReferences(
        params.values.targetGroupArns,
        "targetGroupArns",
        "aws_lb_target_group"
      );
    case "aws_cloudwatch_metric_alarm":
      return getListReferences(params.values.alarmActions, "alarmActions", "aws_autoscaling_policy");
    case "aws_autoscaling_policy":
      return [
        {
          parameterPath: "autoscalingGroupName",
          targetResourceType: "aws_autoscaling_group",
          value: params.values.autoscalingGroupName
        }
      ];
    default:
      return [];
  }
}

function getNestedTargetGroupReferences(value: unknown): ParameterReference[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    return [
      {
        parameterPath: `defaultAction[${index}].targetGroupArn`,
        targetResourceType: "aws_lb_target_group",
        value: entry.targetGroupArn
      }
    ];
  });
}

function getListReferences(
  value: unknown,
  parameterName: string,
  targetResourceType: string
): ParameterReference[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry, index) => ({
    parameterPath: `${parameterName}[${index}]`,
    targetResourceType,
    value: entry
  }));
}

function parseTerraformReference(value: string): TerraformReference | null {
  const match = /^(data\.)?(aws_[A-Za-z0-9_]+)\.([A-Za-z_][A-Za-z0-9_]*)\.[A-Za-z_][A-Za-z0-9_]*$/.exec(
    value
  );

  if (!match?.[2] || !match[3]) {
    return null;
  }

  return {
    terraformBlockType: match[1] ? "data" : "resource",
    resourceType: match[2],
    resourceName: match[3]
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
