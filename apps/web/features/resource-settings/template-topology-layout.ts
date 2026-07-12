import type { DiagramEdge, DiagramJson, DiagramNode } from "../../../../packages/types/src";
import { isAreaNode } from "../diagram-editor/area-nodes";
import { isRenderableDiagramNode } from "../diagram-editor/diagram-node-visibility";

const ROOT_PARENT_ID = "__template_root__";
const ROOT_ORIGIN = { x: 120, y: 120 };
const AREA_PADDING = 56;
const HORIZONTAL_GAP = 88;
const VERTICAL_GAP = 64;
const MAX_NODES_PER_LANE_COLUMN = 3;
const AREA_MIN_SIZE_BY_RESOURCE_TYPE: Readonly<Record<string, DiagramNode["size"]>> = {
  aws_autoscaling_group: { height: 184, width: 232 },
  aws_security_group: { height: 164, width: 232 },
  aws_subnet: { height: 204, width: 272 },
  aws_vpc: { height: 280, width: 420 }
};
const EMPTY_AREA_SIZE_BY_RESOURCE_TYPE: Readonly<Record<string, DiagramNode["size"]>> = {
  aws_security_group: { height: 104, width: 184 },
  aws_subnet: { height: 104, width: 184 }
};
const TERRAFORM_REFERENCE_SUFFIXES = ["id", "arn", "name"] as const;

// Template source coordinates are authoring hints. This pass turns catalog-backed nodes into a compact,
// deterministic topology without changing Terraform values, node identity, or user-saved drafts.
export function arrangeTemplateTopology(diagram: DiagramJson): DiagramJson {
  const nodes = inferResolvableAreaParents(diagram.nodes);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParentId = createChildrenByParentId(nodes, nodeById);
  const layout = createTopologyLayout(nodeById, childrenByParentId, diagram.edges);

  layout.arrange();
  applyLiveObservationPresentationLayout(nodeById);

  return {
    ...diagram,
    nodes: nodes.map((node) => layout.getNode(node.id) ?? node)
  };
}

const LIVE_OBSERVATION_PRESENTATION_LAYOUT: Readonly<Record<
  string,
  { readonly position: DiagramNode["position"]; readonly size?: DiagramNode["size"] }
>> = {
  "template-live-vpc": { position: { x: 280, y: 120 }, size: { height: 520, width: 1000 } },
  "template-live-igw": { position: { x: 360, y: 200 } },
  "template-live-route-table": { position: { x: 520, y: 200 } },
  "template-live-route-a": { position: { x: 480, y: 320 } },
  "template-live-route-c": { position: { x: 480, y: 480 } },
  "template-live-subnet-a": { position: { x: 400, y: 280 }, size: { height: 120, width: 200 } },
  "template-live-subnet-c": { position: { x: 400, y: 480 }, size: { height: 120, width: 200 } },
  "template-live-alb-sg": { position: { x: 680, y: 160 }, size: { height: 120, width: 200 } },
  "template-live-api-sg": { position: { x: 680, y: 480 }, size: { height: 120, width: 200 } },
  "template-live-launch-template": { position: { x: 760, y: 520 } },
  "template-live-listener": { position: { x: 800, y: 280 } },
  "template-live-alb": { position: { x: 800, y: 360 } },
  "template-live-target-group": { position: { x: 920, y: 360 } },
  "template-live-asg": { position: { x: 1040, y: 240 }, size: { height: 320, width: 200 } },
  "template-live-policy": { position: { x: 1120, y: 320 } },
  "template-live-alarm": { position: { x: 1120, y: 440 } },
  "template-live-site": { position: { x: 80, y: 360 } }
};

function applyLiveObservationPresentationLayout(nodeById: Map<string, DiagramNode>): void {
  if (!nodeById.has("template-live-vpc") || !nodeById.has("template-live-site")) {
    return;
  }

  for (const [nodeId, presentation] of Object.entries(LIVE_OBSERVATION_PRESENTATION_LAYOUT)) {
    const node = nodeById.get(nodeId);

    if (!node) {
      continue;
    }

    nodeById.set(nodeId, {
      ...node,
      position: { ...presentation.position },
      ...(presentation.size ? { size: { ...presentation.size } } : {})
    });
  }
}

function inferResolvableAreaParents(nodes: readonly DiagramNode[]): DiagramNode[] {
  let currentNodes = [...nodes];

  for (let pass = 0; pass < nodes.length; pass += 1) {
    const nodeById = new Map(currentNodes.map((node) => [node.id, node]));
    let changed = false;

    const nextNodes = currentNodes.map((node) => {
      if (node.metadata?.parentAreaNodeId) {
        return node;
      }

      const parentAreaNodeId = findResolvableAreaParentId(node, nodeById);

      if (!parentAreaNodeId) {
        return node;
      }

      changed = true;
      return {
        ...node,
        metadata: {
          ...node.metadata,
          parentAreaNodeId
        }
      };
    });

    if (!changed) {
      return currentNodes;
    }

    currentNodes = nextNodes;
  }

  return currentNodes;
}

function findResolvableAreaParentId(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): string | undefined {
  const resourceType = getResourceType(node);

  if (resourceType === "aws_route_table_association") {
    const routeTable = findReferenceForValue(node, "routeTableId", nodeById);
    const routeTableVpc = routeTable
      ? findReferenceForValue(routeTable, "vpcId", nodeById)
      : undefined;

    if (routeTableVpc && isAreaNode(routeTableVpc)) {
      return routeTableVpc.id;
    }
  }

  for (const key of ["subnetId", "vpcId", "autoscalingGroupName"] as const) {
    const referencedNode = findReferenceForValue(node, key, nodeById);

    if (referencedNode && referencedNode.id !== node.id && isAreaNode(referencedNode)) {
      return referencedNode.id;
    }
  }

  return findCommonReferenceArea(node, nodeById);
}

function findReferenceForValue(
  node: DiagramNode,
  key: string,
  nodeById: ReadonlyMap<string, DiagramNode>
): DiagramNode | undefined {
  const values = getParameterValues(node);
  const referenceValue = values?.[key];
  const reference = flattenStringValues(referenceValue)[0];

  return reference ? findReferencedNode(reference, nodeById) : undefined;
}

function findCommonReferenceArea(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): string | undefined {
  const values = getParameterValues(node);

  if (!values) {
    return undefined;
  }

  const candidates = [
    ...flattenStringValues(values.subnets),
    ...flattenStringValues(values.vpcZoneIdentifier),
    ...flattenStringValues(values.securityGroupIds),
    ...flattenStringValues(values.vpcSecurityGroupIds),
    ...flattenStringValues(values.targetGroupArns),
    ...flattenStringValues(values.launchTemplate),
    ...flattenStringValues(values.loadBalancerArn),
    ...flattenStringValues(values.targetGroupArn),
    ...flattenStringValues(values.alarmActions)
  ]
    .map((reference) => findReferencedNode(reference, nodeById))
    .filter((candidate): candidate is DiagramNode => candidate !== undefined && candidate.id !== node.id);

  if (candidates.length === 0) {
    return undefined;
  }

  const firstCandidate = candidates[0];
  if (!firstCandidate) {
    return undefined;
  }

  const firstLineage = getAreaLineage(firstCandidate, nodeById);

  return firstLineage.find((areaId) =>
    candidates.every((candidate) => getAreaLineage(candidate, nodeById).includes(areaId))
  );
}

function getAreaLineage(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): string[] {
  const lineage: string[] = [];
  let currentNode: DiagramNode | undefined = node;
  const visitedIds = new Set<string>();

  while (currentNode && !visitedIds.has(currentNode.id)) {
    visitedIds.add(currentNode.id);

    if (isAreaNode(currentNode)) {
      lineage.push(currentNode.id);
    }

    const parentAreaNodeId: string | undefined = currentNode.metadata?.parentAreaNodeId;
    currentNode = parentAreaNodeId ? nodeById.get(parentAreaNodeId) : undefined;
  }

  return lineage;
}

function findReferencedNode(
  rawReference: string,
  nodeById: ReadonlyMap<string, DiagramNode>
): DiagramNode | undefined {
  const reference = normalizeReference(rawReference);
  const directNode = nodeById.get(reference);

  if (directNode) {
    return directNode;
  }

  for (const node of nodeById.values()) {
    if (createTerraformReferences(node).includes(reference)) {
      return node;
    }
  }

  return undefined;
}

function createTerraformReferences(node: DiagramNode): string[] {
  const parameters = node.parameters;

  if (!parameters) {
    return [node.id];
  }

  const names = [parameters.resourceName, node.id]
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const references = names.flatMap((name) =>
    TERRAFORM_REFERENCE_SUFFIXES.map((suffix) => `${parameters.resourceType}.${name}.${suffix}`)
  );

  return parameters.terraformBlockType === "data"
    ? [...references, ...references.map((reference) => `data.${reference}`), node.id]
    : [...references, node.id];
}

function normalizeReference(value: string): string {
  return value.trim().replace(/^\$\{(.+)\}$/u, "$1");
}

function getParameterValues(node: DiagramNode): Readonly<Record<string, unknown>> | undefined {
  const values = node.parameters?.values;

  return values && typeof values === "object" && !Array.isArray(values)
    ? values as Readonly<Record<string, unknown>>
    : undefined;
}

function flattenStringValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenStringValues);
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap(flattenStringValues);
  }

  return [];
}

function createChildrenByParentId(
  nodes: readonly DiagramNode[],
  nodeById: ReadonlyMap<string, DiagramNode>
): ReadonlyMap<string, readonly string[]> {
  const childrenByParentId = new Map<string, string[]>();

  for (const node of nodes) {
    const parentAreaNodeId = node.metadata?.parentAreaNodeId;
    const parentAreaNode = parentAreaNodeId ? nodeById.get(parentAreaNodeId) : undefined;
    const parentId = parentAreaNode && isAreaNode(parentAreaNode)
      ? parentAreaNode.id
      : ROOT_PARENT_ID;
    const children = childrenByParentId.get(parentId) ?? [];

    children.push(node.id);
    childrenByParentId.set(parentId, children);
  }

  return childrenByParentId;
}

function createTopologyLayout(
  nodeById: Map<string, DiagramNode>,
  childrenByParentId: ReadonlyMap<string, readonly string[]>,
  edges: readonly DiagramEdge[]
) {
  function arrange(): void {
    const rootAreaIds = (childrenByParentId.get(ROOT_PARENT_ID) ?? [])
      .filter((id) => isAreaNode(getRequiredNode(id)));

    for (const areaId of rootAreaIds) {
      arrangeArea(areaId);
    }

    arrangeGroup(ROOT_PARENT_ID, ROOT_ORIGIN, false);
    applyLayerOrder();
  }

  function arrangeArea(areaId: string): void {
    const childAreaIds = (childrenByParentId.get(areaId) ?? [])
      .filter((id) => isAreaNode(getRequiredNode(id)));

    for (const childAreaId of childAreaIds) {
      arrangeArea(childAreaId);
    }

    const area = getRequiredNode(areaId);
    arrangeGroup(areaId, { x: area.position.x + AREA_PADDING, y: area.position.y + AREA_PADDING }, true);
  }

  function arrangeGroup(parentId: string, origin: DiagramNode["position"], fitParent: boolean): void {
    const childIds = childrenByParentId.get(parentId) ?? [];
    const layoutChildIds = childIds.filter((id) => isRenderableDiagramNode(getRequiredNode(id)));

    if (layoutChildIds.length === 0) {
      if (fitParent) {
        const parent = getRequiredNode(parentId);
        const emptySize = EMPTY_AREA_SIZE_BY_RESOURCE_TYPE[getResourceType(parent)];

        if (emptySize) {
          nodeById.set(parent.id, { ...parent, size: { ...emptySize } });
        }
      }
      return;
    }

    const rankedChildren = createRankedChildren(layoutChildIds, parentId);
    let nextX = origin.x;
    let requiredBottom = origin.y;

    for (const lane of rankedChildren) {
      let laneRight = nextX;

      for (const column of chunkLane(lane)) {
        let nextY = origin.y;
        let columnWidth = 0;

        for (const childId of column) {
          const child = getRequiredNode(childId);
          moveSubtree(childId, { x: laneRight - child.position.x, y: nextY - child.position.y });
          const placedChild = getRequiredNode(childId);

          columnWidth = Math.max(columnWidth, placedChild.size.width);
          nextY += placedChild.size.height + VERTICAL_GAP;
          requiredBottom = Math.max(requiredBottom, nextY - VERTICAL_GAP);
        }

        laneRight += columnWidth + HORIZONTAL_GAP / 2;
      }

      nextX = laneRight + HORIZONTAL_GAP / 2;
    }

    if (!fitParent) {
      return;
    }

    const parent = getRequiredNode(parentId);
    const minimumSize = AREA_MIN_SIZE_BY_RESOURCE_TYPE[getResourceType(parent)] ?? { height: 160, width: 220 };
    const requiredWidth = nextX - parent.position.x - HORIZONTAL_GAP + AREA_PADDING;
    const requiredHeight = requiredBottom - parent.position.y + AREA_PADDING;

    nodeById.set(parent.id, {
      ...parent,
      size: {
        height: Math.max(minimumSize.height, requiredHeight),
        width: Math.max(minimumSize.width, requiredWidth)
      }
    });
  }

  function createRankedChildren(childIds: readonly string[], parentId: string): readonly string[][] {
    const children = [...childIds].sort(compareStableNodeIds);
    const childIdSet = new Set(children);
    const outgoing = new Map(children.map((id) => [id, new Set<string>()]));
    const incomingCount = new Map(children.map((id) => [id, 0]));

    for (const edge of edges) {
      const sourceId = findDirectGroupChildId(edge.sourceNodeId, parentId, childIdSet);
      const targetId = findDirectGroupChildId(edge.targetNodeId, parentId, childIdSet);

      if (!sourceId || !targetId || sourceId === targetId || outgoing.get(sourceId)?.has(targetId)) {
        continue;
      }

      outgoing.get(sourceId)?.add(targetId);
      incomingCount.set(targetId, (incomingCount.get(targetId) ?? 0) + 1);
    }

    const rankById = new Map(children.map((id) => [id, 0]));
    const queue = children.filter((id) => incomingCount.get(id) === 0);
    const visitedIds = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift();

      if (!currentId || visitedIds.has(currentId)) {
        continue;
      }

      visitedIds.add(currentId);

      for (const targetId of [...(outgoing.get(currentId) ?? [])].sort(compareStableNodeIds)) {
        rankById.set(targetId, Math.max(rankById.get(targetId) ?? 0, (rankById.get(currentId) ?? 0) + 1));
        const nextIncomingCount = (incomingCount.get(targetId) ?? 1) - 1;

        incomingCount.set(targetId, nextIncomingCount);
        if (nextIncomingCount === 0) {
          queue.push(targetId);
        }
      }
    }

    const lanes = new Map<number, string[]>();

    for (const childId of children) {
      const rank = rankById.get(childId) ?? 0;
      const lane = lanes.get(rank) ?? [];

      lane.push(childId);
      lanes.set(rank, lane);
    }

    return [...lanes.entries()]
      .sort(([leftRank], [rightRank]) => leftRank - rightRank)
      .map(([, lane]) => lane.sort(compareStableNodeIds));
  }

  function findDirectGroupChildId(
    nodeId: string,
    parentId: string,
    childIdSet: ReadonlySet<string>
  ): string | undefined {
    let node = nodeById.get(nodeId);
    const visitedIds = new Set<string>();

    while (node && !visitedIds.has(node.id)) {
      if (childIdSet.has(node.id)) {
        return node.id;
      }

      visitedIds.add(node.id);
      node = node.metadata?.parentAreaNodeId
        ? nodeById.get(node.metadata.parentAreaNodeId)
        : undefined;
    }

    return undefined;
  }

  function moveSubtree(rootId: string, delta: DiagramNode["position"]): void {
    if (delta.x === 0 && delta.y === 0) {
      return;
    }

    for (const node of [...nodeById.values()]) {
      if (node.id !== rootId && !hasAreaAncestor(node, rootId)) {
        continue;
      }

      nodeById.set(node.id, {
        ...node,
        position: {
          x: node.position.x + delta.x,
          y: node.position.y + delta.y
        }
      });
    }
  }

  function hasAreaAncestor(node: DiagramNode, ancestorId: string): boolean {
    let parentId = node.metadata?.parentAreaNodeId;
    const visitedIds = new Set<string>();

    while (parentId && !visitedIds.has(parentId)) {
      if (parentId === ancestorId) {
        return true;
      }

      visitedIds.add(parentId);
      parentId = nodeById.get(parentId)?.metadata?.parentAreaNodeId;
    }

    return false;
  }

  function applyLayerOrder(): void {
    for (const node of nodeById.values()) {
      const depth = getAreaDepth(node);

      nodeById.set(node.id, {
        ...node,
        zIndex: isAreaNode(node) ? 1 + depth : 100 + depth
      });
    }
  }

  function getAreaDepth(node: DiagramNode): number {
    let depth = 0;
    let parentId = node.metadata?.parentAreaNodeId;
    const visitedIds = new Set<string>();

    while (parentId && !visitedIds.has(parentId)) {
      visitedIds.add(parentId);
      depth += 1;
      parentId = nodeById.get(parentId)?.metadata?.parentAreaNodeId;
    }

    return depth;
  }

  function compareStableNodeIds(leftId: string, rightId: string): number {
    const leftNode = getRequiredNode(leftId);
    const rightNode = getRequiredNode(rightId);

    return (
      leftNode.position.y - rightNode.position.y ||
      leftNode.position.x - rightNode.position.x ||
      leftNode.id.localeCompare(rightNode.id)
    );
  }

  function getRequiredNode(id: string): DiagramNode {
    const node = nodeById.get(id);

    if (!node) {
      throw new Error(`Missing Template topology node: ${id}`);
    }

    return node;
  }

  return { arrange, getNode: (id: string) => nodeById.get(id) };
}

function chunkLane(lane: readonly string[]): readonly (readonly string[])[] {
  const columns: string[][] = [];

  for (let index = 0; index < lane.length; index += MAX_NODES_PER_LANE_COLUMN) {
    columns.push(lane.slice(index, index + MAX_NODES_PER_LANE_COLUMN));
  }

  return columns;
}

function getResourceType(node: DiagramNode): string {
  return node.parameters?.resourceType ?? node.type;
}
