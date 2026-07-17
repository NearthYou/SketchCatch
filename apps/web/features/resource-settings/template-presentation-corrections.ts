import type { DiagramEdge, DiagramJson, DiagramNode } from "../../../../packages/types/src";

const ASG_LOAD_BALANCER_TEMPLATE_ID = "brainboard-aws-asg-lb-vpc-subnets";
const ASG_NODE_ID = "d75efaba-a405-4bf0-9cf0-929116e2c267";
const LAUNCH_CONFIGURATION_NODE_ID = "cd499b89-a918-4f50-a93a-2b865f961e60";
const SUBNET_A_NODE_ID = "ff98d607-abd3-49b8-bf7f-f5dae753e5c8";
const SUBNET_B_NODE_ID = "af851fdf-0467-46fb-a990-ae069729728c";
const LOAD_BALANCER_NODE_ID = "d67cbec1-5217-44ea-95e8-93c2bae28504";
const EC2_SECURITY_GROUP_NODE_ID = "a514bd55-a14d-45a0-a047-4220529bd4e2";

/**
 * Captured Brainboard geometry is preserved by default. This one source places the ASG icon
 * inside the EC2 security-group area and omits Terraform relationships from its visual edges.
 * Keep the raw capture immutable and apply the reviewed, visual-only correction at consumption.
 */
export function applyBoardTemplatePresentationCorrections(
  templateId: string,
  diagram: DiagramJson
): DiagramJson {
  if (templateId !== ASG_LOAD_BALANCER_TEMPLATE_ID) {
    return diagram;
  }

  return {
    ...diagram,
    edges: applyAsgRelationshipPresentation(diagram.edges),
    nodes: diagram.nodes.map(applyAsgNodePresentation)
  };
}

function applyAsgNodePresentation(node: DiagramNode): DiagramNode {
  switch (node.id) {
    case ASG_NODE_ID:
      return {
        ...node,
        label: "Auto Scaling Group",
        position: { x: 1160, y: 3150 }
      };
    case LAUNCH_CONFIGURATION_NODE_ID:
      return {
        ...node,
        label: "Launch Configuration",
        position: { x: 980, y: 3150 }
      };
    case LOAD_BALANCER_NODE_ID:
      return {
        ...node,
        label: "Classic Load Balancer",
        position: { x: 1340, y: 3150 }
      };
    case EC2_SECURITY_GROUP_NODE_ID:
      return { ...node, label: "EC2 Security Group" };
    default:
      return node;
  }
}

function applyAsgRelationshipPresentation(
  sourceEdges: readonly DiagramEdge[]
): readonly DiagramEdge[] {
  const existingEdges = sourceEdges.map((edge) => {
    if (edge.sourceNodeId !== ASG_NODE_ID || edge.targetNodeId !== LOAD_BALANCER_NODE_ID) {
      return edge;
    }

    const {
      route: _route,
      sourceHandleId: _sourceHandleId,
      targetHandleId: _targetHandleId,
      ...rest
    } = edge;
    return { ...rest, label: "load balancer" };
  });
  const relationshipEdges = [
    createAsgRelationshipEdge(LAUNCH_CONFIGURATION_NODE_ID, "launch configuration"),
    createAsgRelationshipEdge(SUBNET_A_NODE_ID, "subnet"),
    createAsgRelationshipEdge(SUBNET_B_NODE_ID, "subnet")
  ];

  return relationshipEdges.reduce(
    (edges, relationship) =>
      edges.some(
        (edge) =>
          edge.sourceNodeId === relationship.sourceNodeId &&
          edge.targetNodeId === relationship.targetNodeId
      )
        ? edges
        : [...edges, relationship],
    existingEdges
  );
}

function createAsgRelationshipEdge(sourceNodeId: string, label: string): DiagramEdge {
  return {
    id: `presentation-${sourceNodeId}-${ASG_NODE_ID}`,
    label,
    sourceNodeId,
    targetNodeId: ASG_NODE_ID,
    type: "smoothstep"
  };
}
