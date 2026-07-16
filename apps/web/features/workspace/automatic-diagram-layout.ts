import type { DiagramNode } from "@sketchcatch/types";
import { isAreaNode, isSecurityGroupScopeNode } from "../diagram-editor/area-nodes";
import {
  createAreaTitleRoutingObstacle,
  getObstacleSafeEdgeHandles,
  getObstacleSafeOrthogonalRouteSegments,
  getOrthogonalRouteNodeOverlapLength,
  type OrthogonalRouteSegment
} from "../diagram-editor/obstacle-safe-edge-routing";
import { getResourceNodeVisualBounds } from "../diagram-editor/resource-node-visual-footprint";
import {
  getAutomaticDiagramAreaMinimumSize,
  getAutomaticDiagramSemanticRole,
  type AutomaticDiagramSemanticRole as SemanticRole
} from "./automatic-diagram-layout-provider-mapping";

export type AutomaticDiagramLayoutEdge = {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly label?: string | undefined;
};

export type AutomaticDiagramLayoutInput = {
  readonly candidateProfiles?: readonly AutomaticDiagramLayoutCandidateProfile[] | undefined;
  readonly edges: readonly AutomaticDiagramLayoutEdge[];
  readonly nodes: readonly DiagramNode[];
  readonly protectedNodeIds?: ReadonlySet<string> | undefined;
};

export type AutomaticDiagramLayoutCandidateProfile = {
  readonly columnGap: number;
  readonly id: string;
  readonly rowGap: number;
};

export type AutomaticDiagramLayoutResult = {
  readonly candidateCount: number;
  readonly candidateId: string;
  readonly nodes: DiagramNode[];
  readonly quality: AutomaticDiagramLayoutQuality;
};

export type AutomaticDiagramLayoutQuality = {
  readonly backwardEdgeCount: number;
  readonly canvasArea: number;
  readonly canvasAspectRatioPenalty: number;
  readonly edgeCrossingCount: number;
  readonly edgeAreaTitleIntersectionCount: number;
  readonly edgeNodeIntersectionCount: number;
  readonly emptySpaceRatio: number;
  readonly mainFlowContinuityError: number;
  readonly nodeOverlapCount: number;
  readonly parentBoundaryViolationCount: number;
  readonly repeatAlignmentError: number;
  readonly score: number;
  readonly siblingAreaOverlapCount: number;
  readonly supportLaneIntrusionCount: number;
  readonly totalEdgeLength: number;
};

type LayoutLane = "primary" | "upper-support" | "lower-support";

type LayoutCandidateConfig = {
  readonly columnGap: number;
  readonly id: string;
  readonly knowledgeProfileId?: string | undefined;
  readonly primaryOrder: "ascending" | "descending";
  readonly rowGap: number;
  readonly supportPlacement: "split" | "above" | "below";
};

const ROLE_RANK: Readonly<Record<SemanticRole, number>> = {
  actor: 0,
  entry: 1,
  network: 2,
  compute: 3,
  async: 4,
  data: 4,
  security: 1,
  delivery: 1,
  observability: 4,
  support: 3
};

const AREA_PADDING = 36;
const ROOT_PARENT_ID = "__root__";
const SUPPORT_LANE_GAP = 80;
const SUPPORT_ROUTE_OBSTACLE_PENALTY = 1_000_000;
const SUPPORT_ROUTE_CANVAS_EXPANSION_PENALTY = 20;
const SUPPORT_ROUTE_OFFSET_PENALTY = 1_000;
const SUPPORT_ROUTE_NODE_OVERLAP_PENALTY = 10_000_000;
const DENSE_SUPPORT_MIN_COUNT = 8;
const DENSE_SUPPORT_MIN_COLUMNS = 4;
const DENSE_SUPPORT_MAX_COLUMNS = 8;
const DENSE_SUPPORT_COLUMN_GAP = 48;
const REPEATED_AREA_MIN_COUNT = 4;
const PREFERRED_CANVAS_HEIGHT_TO_WIDTH_RATIO = 1;
const CANVAS_ASPECT_RATIO_PENALTY = 5_000_000;
const LAYOUT_CANDIDATES: readonly LayoutCandidateConfig[] = [
  { columnGap: 64, id: "split-support", primaryOrder: "ascending", rowGap: 56, supportPlacement: "split" },
  { columnGap: 64, id: "split-support-reversed", primaryOrder: "descending", rowGap: 56, supportPlacement: "split" },
  { columnGap: 64, id: "support-above", primaryOrder: "ascending", rowGap: 56, supportPlacement: "above" },
  { columnGap: 64, id: "support-above-reversed", primaryOrder: "descending", rowGap: 56, supportPlacement: "above" },
  { columnGap: 64, id: "support-below", primaryOrder: "ascending", rowGap: 56, supportPlacement: "below" },
  { columnGap: 64, id: "support-below-reversed", primaryOrder: "descending", rowGap: 56, supportPlacement: "below" }
];

export function layoutAutomaticDiagram(input: AutomaticDiagramLayoutInput): AutomaticDiagramLayoutResult {
  const candidates = getLayoutCandidateConfigs(input).map((config) => {
    const nodes = createLayoutCandidate(input, config);

    return {
      config,
      nodes,
      quality: evaluateAutomaticDiagramLayout({ edges: input.edges, nodes })
    };
  });
  const baselineCandidate = selectBestCandidate(
    candidates.filter(({ config }) => config.knowledgeProfileId === undefined)
  );
  const eligibleCandidates = baselineCandidate
    ? candidates.filter(
        ({ config, quality }) =>
          config.knowledgeProfileId === undefined || doesNotRegressVisualAnomalies(quality, baselineCandidate.quality)
      )
    : candidates;
  const bestCandidate = selectBestCandidate(eligibleCandidates);

  if (!bestCandidate) {
    const quality = evaluateAutomaticDiagramLayout(input);

    return {
      candidateCount: 0,
      candidateId: "unchanged",
      nodes: [...input.nodes],
      quality
    };
  }

  return {
    candidateCount: candidates.length,
    candidateId: bestCandidate.config.id,
    nodes: bestCandidate.nodes,
    quality: bestCandidate.quality
  };
}

function selectBestCandidate<T extends { readonly config: LayoutCandidateConfig; readonly quality: AutomaticDiagramLayoutQuality }>(
  candidates: readonly T[]
): T | undefined {
  return [...candidates].sort(
    (left, right) => left.quality.score - right.quality.score || left.config.id.localeCompare(right.config.id)
  )[0];
}

// A knowledge profile broadens the candidate search, but it must not trade a clean Board for a
// lower weighted score with a newly introduced overlap, boundary violation, or edge obstruction.
function doesNotRegressVisualAnomalies(
  candidate: AutomaticDiagramLayoutQuality,
  baseline: AutomaticDiagramLayoutQuality
): boolean {
  return (
    candidate.nodeOverlapCount <= baseline.nodeOverlapCount &&
    candidate.siblingAreaOverlapCount <= baseline.siblingAreaOverlapCount &&
    candidate.parentBoundaryViolationCount <= baseline.parentBoundaryViolationCount &&
    candidate.edgeNodeIntersectionCount <= baseline.edgeNodeIntersectionCount &&
    candidate.edgeAreaTitleIntersectionCount <= baseline.edgeAreaTitleIntersectionCount &&
    candidate.edgeCrossingCount <= baseline.edgeCrossingCount &&
    candidate.backwardEdgeCount <= baseline.backwardEdgeCount &&
    candidate.supportLaneIntrusionCount <= baseline.supportLaneIntrusionCount
  );
}

function getLayoutCandidateConfigs(
  input: AutomaticDiagramLayoutInput
): readonly LayoutCandidateConfig[] {
  const profiles = [...(input.candidateProfiles ?? [])]
    .filter(isUsableCandidateProfile)
    .sort((left, right) => left.id.localeCompare(right.id));

  return [
    ...LAYOUT_CANDIDATES,
    ...profiles.flatMap((profile) =>
      LAYOUT_CANDIDATES.map((candidate) => ({
        ...candidate,
        columnGap: profile.columnGap,
        id: `${profile.id}:${candidate.id}`,
        knowledgeProfileId: profile.id,
        rowGap: profile.rowGap
      }))
    )
  ];
}

function isUsableCandidateProfile(
  profile: AutomaticDiagramLayoutCandidateProfile
): boolean {
  return (
    profile.id.trim().length > 0 &&
    Number.isFinite(profile.columnGap) &&
    profile.columnGap > 0 &&
    Number.isFinite(profile.rowGap) &&
    profile.rowGap > 0
  );
}

function createLayoutCandidate(
  input: AutomaticDiagramLayoutInput,
  config: LayoutCandidateConfig
): DiagramNode[] {
  const protectedNodeIds = input.protectedNodeIds ?? new Set<string>();
  const layoutNodes = input.nodes.filter((node) => !isAreaNode(node));
  const roleByNodeId = new Map(layoutNodes.map((node) => [node.id, classifySemanticRole(node)]));
  const rankByNodeId = createFlowRanks(layoutNodes, input.edges, roleByNodeId);
  const primaryDistanceByNodeId = createPrimaryDistanceMap(layoutNodes, input.edges, roleByNodeId);
  const primaryFlowPathByNodeId = createPrimaryFlowPathMap(
    layoutNodes,
    input.edges,
    roleByNodeId,
    rankByNodeId
  );
  const nextNodeById = new Map(
    input.nodes.map((node) => [node.id, compactEmptyAreaNode(node, input.nodes, protectedNodeIds)])
  );
  const parentIds = collectParentIds(input.nodes).sort(
    (left, right) => getParentDepth(right, nextNodeById) - getParentDepth(left, nextNodeById) || left.localeCompare(right)
  );

  for (const parentId of parentIds) {
    layoutSiblingGroup(
      parentId,
      nextNodeById,
      rankByNodeId,
      roleByNodeId,
      primaryDistanceByNodeId,
      primaryFlowPathByNodeId,
      protectedNodeIds,
      config
    );
    compactRepeatedAreaSiblingLayouts(
      [parentId],
      nextNodeById,
      protectedNodeIds,
      config
    );
    compactDenseNestedSupportLayouts(
      input.edges,
      [parentId],
      nextNodeById,
      roleByNodeId,
      protectedNodeIds
    );
    fitParentAreaToChildren(parentId, nextNodeById, protectedNodeIds);
  }

  alignSupportNodesWithConnectedPrimaryTargets(
    input.edges,
    nextNodeById,
    roleByNodeId,
    protectedNodeIds,
    config
  );
  compactRootSupportLayout(input.edges, nextNodeById, roleByNodeId, protectedNodeIds);
  avoidSupportEdgeNodeIntersections(
    input.edges,
    nextNodeById,
    roleByNodeId,
    protectedNodeIds
  );

  for (const parentId of parentIds) {
    fitParentAreaToChildren(parentId, nextNodeById, protectedNodeIds);
  }

  resolveSiblingAreaOverlaps([ROOT_PARENT_ID, ...parentIds], nextNodeById, protectedNodeIds);

  for (const parentId of parentIds) {
    fitParentAreaToChildren(parentId, nextNodeById, protectedNodeIds);
  }

  resolveSiblingAreaOverlaps([ROOT_PARENT_ID, ...parentIds], nextNodeById, protectedNodeIds);

  return input.nodes.map((node) => nextNodeById.get(node.id) ?? node);
}

function resolveSiblingAreaOverlaps(
  parentIds: readonly string[],
  nodeById: Map<string, DiagramNode>,
  protectedNodeIds: ReadonlySet<string>
): void {
  for (const parentId of parentIds) {
    const siblingAreas = [...nodeById.values()]
      .filter(
        (node) =>
          isAreaNode(node) &&
          !isSecurityGroupScopeNode(node) &&
          (node.metadata?.parentAreaNodeId ?? ROOT_PARENT_ID) === parentId
      )
      .sort(compareAreaOverlapResolutionOrder);
    const placedAreas: DiagramNode[] = [];

    for (const area of siblingAreas) {
      let currentArea = nodeById.get(area.id) ?? area;

      if (!canMoveSubtree(currentArea.id, nodeById, protectedNodeIds)) {
        placedAreas.push(currentArea);
        continue;
      }

      for (let pass = 0; pass < 12; pass += 1) {
        const overlappingArea = placedAreas.find((placedArea) =>
          doNodesOverlap(currentArea, placedArea)
        );

        if (!overlappingArea) {
          break;
        }

        const currentBounds = getLayoutNodeBounds(currentArea);
        const placedBounds = getLayoutNodeBounds(overlappingArea);
        moveSubtree(
          currentArea.id,
          {
            x: 0,
            y: placedBounds.y + placedBounds.height + SUPPORT_LANE_GAP - currentBounds.y
          },
          nodeById
        );
        currentArea = nodeById.get(currentArea.id) ?? currentArea;
      }

      placedAreas.push(currentArea);
    }
  }
}

function compareAreaOverlapResolutionOrder(left: DiagramNode, right: DiagramNode): number {
  const leftBounds = getLayoutNodeBounds(left);
  const rightBounds = getLayoutNodeBounds(right);

  return (
    leftBounds.height - rightBounds.height ||
    leftBounds.y - rightBounds.y ||
    leftBounds.x - rightBounds.x ||
    left.id.localeCompare(right.id)
  );
}

function compactRootSupportLayout(
  edges: readonly AutomaticDiagramLayoutEdge[],
  nodeById: Map<string, DiagramNode>,
  roleByNodeId: ReadonlyMap<string, SemanticRole>,
  protectedNodeIds: ReadonlySet<string>
): void {
  const rootNodes = [...nodeById.values()].filter(
    (node) => !node.metadata?.parentAreaNodeId
  );
  const supportNodes = rootNodes.filter(
    (node) =>
      !isAreaNode(node) &&
      !isPrimaryFlowRole(roleByNodeId.get(node.id)) &&
      canMoveSubtree(node.id, nodeById, protectedNodeIds)
  );

  if (supportNodes.length < 3) {
    return;
  }

  let primaryRootNodes = rootNodes.filter(
    (node) => isAreaNode(node) || isPrimaryFlowRole(roleByNodeId.get(node.id))
  );

  if (primaryRootNodes.length === 0) {
    return;
  }

  const movablePrimaryRootNodes = primaryRootNodes.filter((node) =>
    canMoveSubtree(node.id, nodeById, protectedNodeIds)
  );
  if (movablePrimaryRootNodes.length === primaryRootNodes.length) {
    const primaryTop = Math.min(
      ...primaryRootNodes.map((node) => getLayoutNodeBounds(node).y)
    );
    const rootOriginY = Math.min(...rootNodes.map((node) => getLayoutNodeBounds(node).y), 0);

    for (const node of primaryRootNodes) {
      moveSubtree(node.id, { x: 0, y: rootOriginY - primaryTop }, nodeById);
    }

    primaryRootNodes = primaryRootNodes.map((node) => nodeById.get(node.id) ?? node);
  }

  const supportRailY = Math.max(
    ...primaryRootNodes.map((node) => node.position.y + node.size.height)
  ) + SUPPORT_LANE_GAP;

  const supportNodeIds = new Set(supportNodes.map((node) => node.id));
  const supportTargetRootNodes = edges
    .flatMap((edge) => {
      const targetNodeId = supportNodeIds.has(edge.sourceId) && !supportNodeIds.has(edge.targetId)
        ? edge.targetId
        : supportNodeIds.has(edge.targetId) && !supportNodeIds.has(edge.sourceId)
          ? edge.sourceId
          : undefined;
      const targetNode = targetNodeId ? nodeById.get(targetNodeId) : undefined;

      return targetNode ? [getRootLayoutNode(targetNode, nodeById)] : [];
    })
    .filter(
      (node, index, nodes) => nodes.findIndex((candidate) => candidate.id === node.id) === index
    );
  const supportTargetRootAreas = supportTargetRootNodes.filter(isAreaNode);
  const gridAnchorNodes = supportTargetRootAreas.length > 0
    ? supportTargetRootAreas
    : primaryRootNodes;
  const gridAnchorBounds = gridAnchorNodes.map(getLayoutNodeBounds);
  const primaryLeft = Math.min(...gridAnchorBounds.map((bounds) => bounds.x));
  const primaryRight = Math.max(...gridAnchorBounds.map((bounds) => bounds.x + bounds.width));

  placeDenseSupportGrid(
    supportNodes,
    edges,
    primaryLeft,
    primaryRight,
    supportRailY,
    nodeById,
    supportTargetRootAreas.length > 0
      ? Math.min(DENSE_SUPPORT_MAX_COLUMNS, supportNodes.length)
      : undefined
  );
}

function getRootLayoutNode(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): DiagramNode {
  let rootNode = node;
  const visitedNodeIds = new Set<string>();

  while (rootNode.metadata?.parentAreaNodeId && !visitedNodeIds.has(rootNode.id)) {
    visitedNodeIds.add(rootNode.id);
    const parentNode = nodeById.get(rootNode.metadata.parentAreaNodeId);
    if (!parentNode) break;
    rootNode = parentNode;
  }

  return rootNode;
}

function compactDenseNestedSupportLayouts(
  edges: readonly AutomaticDiagramLayoutEdge[],
  parentIds: readonly string[],
  nodeById: Map<string, DiagramNode>,
  roleByNodeId: ReadonlyMap<string, SemanticRole>,
  protectedNodeIds: ReadonlySet<string>
): void {
  for (const parentId of parentIds) {
    if (parentId === ROOT_PARENT_ID) {
      continue;
    }

    const parent = nodeById.get(parentId);
    if (!parent || !isAreaNode(parent)) {
      continue;
    }

    const children = [...nodeById.values()].filter(
      (node) =>
        node.metadata?.parentAreaNodeId === parentId &&
        !isSecurityGroupScopeNode(node)
    );
    const supportNodes = children.filter(
      (node) =>
        !isAreaNode(node) &&
        !isPrimaryFlowRole(roleByNodeId.get(node.id)) &&
        canMoveSubtree(node.id, nodeById, protectedNodeIds)
    );

    if (supportNodes.length < DENSE_SUPPORT_MIN_COUNT) {
      continue;
    }

    const supportNodeIds = new Set(supportNodes.map((node) => node.id));
    const anchorNodes = children.filter((node) => !supportNodeIds.has(node.id));
    const anchorBounds = anchorNodes.map(getLayoutNodeBounds);
    const parentInnerLeft = parent.position.x + AREA_PADDING;
    const parentInnerRight = parent.position.x + parent.size.width - AREA_PADDING;
    const supportGridY = anchorBounds.length > 0
      ? Math.max(...anchorBounds.map((bounds) => bounds.y + bounds.height)) + SUPPORT_LANE_GAP
      : parent.position.y + AREA_PADDING;
    const gridLeft = anchorBounds.length > 0
      ? Math.min(parentInnerLeft, ...anchorBounds.map((bounds) => bounds.x))
      : parentInnerLeft;
    const gridRight = anchorBounds.length > 0
      ? Math.max(parentInnerRight, ...anchorBounds.map((bounds) => bounds.x + bounds.width))
      : parentInnerRight;

    placeDenseSupportGrid(supportNodes, edges, gridLeft, gridRight, supportGridY, nodeById);
  }
}

function placeDenseSupportGrid(
  supportNodes: readonly DiagramNode[],
  edges: readonly AutomaticDiagramLayoutEdge[],
  gridLeft: number,
  gridRight: number,
  supportGridY: number,
  nodeById: Map<string, DiagramNode>,
  minimumColumnCount?: number
): void {
  const supportBounds = supportNodes.map(getLayoutNodeBounds);
  const supportCellWidth =
    Math.max(...supportBounds.map((bounds) => bounds.width)) + DENSE_SUPPORT_COLUMN_GAP;
  const supportCellHeight =
    Math.max(...supportBounds.map((bounds) => bounds.height)) + DENSE_SUPPORT_COLUMN_GAP;
  const preferredColumnCount = Math.max(
    minimumColumnCount ?? 0,
    Math.ceil(supportNodes.length / 2)
  );
  const columnCount = Math.min(
    DENSE_SUPPORT_MAX_COLUMNS,
    Math.max(
      DENSE_SUPPORT_MIN_COLUMNS,
      preferredColumnCount,
      Math.floor((gridRight - gridLeft + DENSE_SUPPORT_COLUMN_GAP) / supportCellWidth)
    )
  );
  const orderedSupportNodes = orderSupportNodesForCompactGrid(supportNodes, edges, nodeById);

  orderedSupportNodes.forEach((node, index) => {
    const bounds = getLayoutNodeBounds(node);
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    const targetVisualLeft =
      gridLeft + column * supportCellWidth + (supportCellWidth - bounds.width) / 2;
    const targetVisualTop = supportGridY + row * supportCellHeight;

    moveSubtree(
      node.id,
      {
        x: targetVisualLeft - bounds.x,
        y: targetVisualTop - bounds.y
      },
      nodeById
    );
  });
}

function orderSupportNodesForCompactGrid(
  supportNodes: readonly DiagramNode[],
  edges: readonly AutomaticDiagramLayoutEdge[],
  allNodeById: ReadonlyMap<string, DiagramNode>
): DiagramNode[] {
  const nodeById = new Map(supportNodes.map((node) => [node.id, node]));
  const neighborIdsByNodeId = new Map(
    supportNodes.map((node) => [node.id, new Set<string>()])
  );

  for (const edge of edges) {
    if (!nodeById.has(edge.sourceId) || !nodeById.has(edge.targetId)) {
      continue;
    }

    neighborIdsByNodeId.get(edge.sourceId)?.add(edge.targetId);
    neighborIdsByNodeId.get(edge.targetId)?.add(edge.sourceId);
  }

  const remainingNodeIds = new Set(nodeById.keys());
  const components: string[][] = [];

  while (remainingNodeIds.size > 0) {
    const firstNodeId = [...remainingNodeIds].sort()[0];
    if (!firstNodeId) break;

    const componentNodeIds: string[] = [];
    const queue = [firstNodeId];
    remainingNodeIds.delete(firstNodeId);

    for (let index = 0; index < queue.length; index += 1) {
      const nodeId = queue[index];
      if (!nodeId) continue;

      componentNodeIds.push(nodeId);
      for (const neighborId of [...(neighborIdsByNodeId.get(nodeId) ?? [])].sort()) {
        if (remainingNodeIds.delete(neighborId)) {
          queue.push(neighborId);
        }
      }
    }

    components.push(componentNodeIds);
  }

  return components
    .sort(
      (left, right) =>
        getSupportComponentTargetX(left, edges, allNodeById) -
          getSupportComponentTargetX(right, edges, allNodeById) ||
        left.length - right.length ||
        (left[0] ?? "").localeCompare(right[0] ?? "")
    )
    .flatMap((componentNodeIds) =>
      orderSupportComponent(componentNodeIds, edges)
        .map((nodeId) => nodeById.get(nodeId))
        .filter((node): node is DiagramNode => Boolean(node))
    );
}

function getSupportComponentTargetX(
  componentNodeIds: readonly string[],
  edges: readonly AutomaticDiagramLayoutEdge[],
  nodeById: ReadonlyMap<string, DiagramNode>
): number {
  const componentNodeIdSet = new Set(componentNodeIds);
  const externalNodes = edges.flatMap((edge) => {
    const externalNodeId = componentNodeIdSet.has(edge.sourceId) && !componentNodeIdSet.has(edge.targetId)
      ? edge.targetId
      : componentNodeIdSet.has(edge.targetId) && !componentNodeIdSet.has(edge.sourceId)
        ? edge.sourceId
        : undefined;
    const externalNode = externalNodeId ? nodeById.get(externalNodeId) : undefined;

    return externalNode ? [externalNode] : [];
  });

  return externalNodes.length > 0
    ? externalNodes.reduce((total, node) => total + getNodeCenter(node).x, 0) /
        externalNodes.length
    : Number.POSITIVE_INFINITY;
}

function orderSupportComponent(
  componentNodeIds: readonly string[],
  edges: readonly AutomaticDiagramLayoutEdge[]
): string[] {
  const componentNodeIdSet = new Set(componentNodeIds);
  const outgoingNodeIdsByNodeId = new Map(
    componentNodeIds.map((nodeId) => [nodeId, new Set<string>()])
  );
  const incomingCountByNodeId = new Map(componentNodeIds.map((nodeId) => [nodeId, 0]));

  for (const edge of edges) {
    if (!componentNodeIdSet.has(edge.sourceId) || !componentNodeIdSet.has(edge.targetId)) {
      continue;
    }

    const outgoingNodeIds = outgoingNodeIdsByNodeId.get(edge.sourceId);
    if (!outgoingNodeIds?.has(edge.targetId)) {
      outgoingNodeIds?.add(edge.targetId);
      incomingCountByNodeId.set(
        edge.targetId,
        (incomingCountByNodeId.get(edge.targetId) ?? 0) + 1
      );
    }
  }

  const readyNodeIds = componentNodeIds
    .filter((nodeId) => incomingCountByNodeId.get(nodeId) === 0)
    .sort();
  const orderedNodeIds: string[] = [];

  while (readyNodeIds.length > 0) {
    const nodeId = readyNodeIds.shift();
    if (!nodeId) continue;

    orderedNodeIds.push(nodeId);
    for (const targetNodeId of [...(outgoingNodeIdsByNodeId.get(nodeId) ?? [])].sort()) {
      const incomingCount = (incomingCountByNodeId.get(targetNodeId) ?? 0) - 1;
      incomingCountByNodeId.set(targetNodeId, incomingCount);
      if (incomingCount === 0) {
        readyNodeIds.push(targetNodeId);
        readyNodeIds.sort();
      }
    }
  }

  return [
    ...orderedNodeIds,
    ...componentNodeIds.filter((nodeId) => !orderedNodeIds.includes(nodeId)).sort()
  ];
}

function compactRepeatedAreaSiblingLayouts(
  parentIds: readonly string[],
  nodeById: Map<string, DiagramNode>,
  protectedNodeIds: ReadonlySet<string>,
  config: LayoutCandidateConfig
): void {
  for (const parentId of parentIds) {
    const areasByType = new Map<string, DiagramNode[]>();

    for (const node of nodeById.values()) {
      if (
        node.metadata?.parentAreaNodeId !== parentId ||
        !isAreaNode(node) ||
        isSecurityGroupScopeNode(node) ||
        !canMoveSubtree(node.id, nodeById, protectedNodeIds)
      ) {
        continue;
      }

      const resourceType = node.parameters?.resourceType ?? node.type;
      const repeatedAreas = areasByType.get(resourceType) ?? [];
      repeatedAreas.push(node);
      areasByType.set(resourceType, repeatedAreas);
    }

    for (const repeatedAreas of areasByType.values()) {
      if (repeatedAreas.length < REPEATED_AREA_MIN_COUNT) {
        continue;
      }

      placeRepeatedAreaGrid(repeatedAreas, nodeById, config);
    }
  }
}

function placeRepeatedAreaGrid(
  areas: readonly DiagramNode[],
  nodeById: Map<string, DiagramNode>,
  config: LayoutCandidateConfig
): void {
  const areaBounds = areas.map(getLayoutNodeBounds);
  const gridLeft = Math.min(...areaBounds.map((bounds) => bounds.x));
  const gridTop = Math.min(...areaBounds.map((bounds) => bounds.y));
  const cellWidth = Math.max(...areaBounds.map((bounds) => bounds.width)) + config.columnGap;
  const cellHeight = Math.max(...areaBounds.map((bounds) => bounds.height)) + config.rowGap;
  const { columnCount, orderedAreas } = getRepeatedAreaGridPlan(areas);

  orderedAreas.forEach((node, index) => {
    const bounds = getLayoutNodeBounds(node);
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    const targetLeft = gridLeft + column * cellWidth + (cellWidth - bounds.width) / 2;
    const targetTop = gridTop + row * cellHeight;

    moveSubtree(
      node.id,
      { x: targetLeft - bounds.x, y: targetTop - bounds.y },
      nodeById
    );
  });
}

function getRepeatedAreaGridPlan(areas: readonly DiagramNode[]): {
  readonly columnCount: number;
  readonly orderedAreas: DiagramNode[];
} {
  const variantKeys = areas.map(getRepeatedAreaVariantKey);
  const distinctVariantKeys = [...new Set(
    variantKeys.filter((key): key is string => Boolean(key))
  )].sort();
  const distinctFamilyKeys = [...new Set(areas.map(createRepeatKey))].sort();
  const familyCounts = new Map<string, number>();

  for (const area of areas) {
    const familyKey = createRepeatKey(area);
    familyCounts.set(familyKey, (familyCounts.get(familyKey) ?? 0) + 1);
  }

  if (
    distinctVariantKeys.length >= 2 &&
    distinctVariantKeys.length <= 4 &&
    variantKeys.every(Boolean) &&
    [...familyCounts.values()].every((count) => count === distinctVariantKeys.length)
  ) {
    const placesFamiliesInColumns = distinctFamilyKeys.length >= distinctVariantKeys.length;
    const familyOrder = new Map(distinctFamilyKeys.map((key, index) => [key, index]));
    const variantOrder = new Map(distinctVariantKeys.map((key, index) => [key, index]));
    const orderedAreas = [...areas].sort((left, right) => {
      const familyDifference =
        (familyOrder.get(createRepeatKey(left)) ?? 0) -
        (familyOrder.get(createRepeatKey(right)) ?? 0);
      const variantDifference =
        (variantOrder.get(getRepeatedAreaVariantKey(left) ?? "") ?? 0) -
        (variantOrder.get(getRepeatedAreaVariantKey(right) ?? "") ?? 0);

      return placesFamiliesInColumns
        ? variantDifference || familyDifference
        : familyDifference || variantDifference;
    });

    return {
      columnCount: placesFamiliesInColumns
        ? distinctFamilyKeys.length
        : distinctVariantKeys.length,
      orderedAreas
    };
  }

  return {
    columnCount: Math.min(4, Math.max(2, Math.ceil(Math.sqrt(areas.length)))),
    orderedAreas: [...areas].sort(compareRepeatedNodes)
  };
}

function getRepeatedAreaVariantKey(node: DiagramNode): string | undefined {
  const idMatch = node.id.toLowerCase().match(/(?:^|[-_])(?:az[-_]?)?([a-z])$/u);

  if (idMatch?.[1]) {
    return idMatch[1];
  }

  const labelMatch = node.label.toLowerCase().match(/(?:^|\s)(?:az\s*)?([a-z])$/u);

  return labelMatch?.[1];
}

function alignSupportNodesWithConnectedPrimaryTargets(
  edges: readonly AutomaticDiagramLayoutEdge[],
  nodeById: Map<string, DiagramNode>,
  roleByNodeId: ReadonlyMap<string, SemanticRole>,
  protectedNodeIds: ReadonlySet<string>,
  config: LayoutCandidateConfig
): void {
  const supportNodes = [...nodeById.values()]
    .filter(
      (node) =>
        !isAreaNode(node) &&
        !isPrimaryFlowRole(roleByNodeId.get(node.id)) &&
        canMoveSubtree(node.id, nodeById, protectedNodeIds)
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const connectedPrimaryNodesBySupportId = new Map(
    supportNodes.map((node) => [
      node.id,
      getConnectedPrimaryNodes(node.id, edges, nodeById, roleByNodeId)
    ])
  );
  const alignmentGroupBySupportId = new Map(
    supportNodes.map((node) => [
      node.id,
      `${getLayoutLane(roleByNodeId.get(node.id) ?? "support", config.supportPlacement)}:${(
        connectedPrimaryNodesBySupportId.get(node.id) ?? []
      )
        .map((connectedNode) => connectedNode.id)
        .join(",")}`
    ])
  );

  for (const node of supportNodes) {
    const connectedPrimaryNodes = connectedPrimaryNodesBySupportId.get(node.id) ?? [];

    if (connectedPrimaryNodes.length === 0) {
      continue;
    }

    const alignmentGroup = alignmentGroupBySupportId.get(node.id);
    const alignedPeers = supportNodes.filter(
      (candidate) => alignmentGroupBySupportId.get(candidate.id) === alignmentGroup
    );
    const alignmentIndex = alignedPeers.findIndex((candidate) => candidate.id === node.id);
    const alignmentSpacing = Math.max(...alignedPeers.map((candidate) => candidate.size.width)) + 48;
    const alignmentOffset =
      (alignmentIndex - (alignedPeers.length - 1) / 2) * alignmentSpacing;

    const targetCenterX =
      connectedPrimaryNodes.reduce(
        (total, connectedNode) => total + getNodeCenter(connectedNode).x,
        0
      ) / connectedPrimaryNodes.length;
    moveSubtree(
      node.id,
      {
        x: targetCenterX + alignmentOffset - node.size.width / 2 - node.position.x,
        y: 0
      },
      nodeById
    );
  }
}

function getConnectedPrimaryNodes(
  nodeId: string,
  edges: readonly AutomaticDiagramLayoutEdge[],
  nodeById: ReadonlyMap<string, DiagramNode>,
  roleByNodeId: ReadonlyMap<string, SemanticRole>
): DiagramNode[] {
  return edges
    .flatMap((edge) => {
      const connectedNodeId =
        edge.sourceId === nodeId
          ? edge.targetId
          : edge.targetId === nodeId
            ? edge.sourceId
            : undefined;
      const connectedNode = connectedNodeId ? nodeById.get(connectedNodeId) : undefined;

      return connectedNode && isPrimaryFlowRole(roleByNodeId.get(connectedNode.id))
        ? [connectedNode]
        : [];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function avoidSupportEdgeNodeIntersections(
  edges: readonly AutomaticDiagramLayoutEdge[],
  nodeById: Map<string, DiagramNode>,
  roleByNodeId: ReadonlyMap<string, SemanticRole>,
  protectedNodeIds: ReadonlySet<string>
): void {
  for (let pass = 0; pass < 4; pass += 1) {
    const supportNodes = [...nodeById.values()]
      .filter(
        (node) =>
          !isAreaNode(node) &&
          !isPrimaryFlowRole(roleByNodeId.get(node.id)) &&
          canMoveSubtree(node.id, nodeById, protectedNodeIds)
      )
      .sort((left, right) => left.id.localeCompare(right.id));

    for (const supportNode of supportNodes) {
      const incidentEdges = edges.filter(
        (edge) => edge.sourceId === supportNode.id || edge.targetId === supportNode.id
      );

      if (incidentEdges.length === 0) {
        continue;
      }

      const spacing = supportNode.size.width + 48;
      const offsets = [0, -spacing, spacing, -spacing * 2, spacing * 2, -spacing * 3, spacing * 3];
      const baselineCanvasArea = getCanvasArea([...nodeById.values()]);
      let bestOffset = 0;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const offset of offsets) {
        const candidateNode = {
          ...supportNode,
          position: { x: supportNode.position.x + offset, y: supportNode.position.y }
        };
        const candidateNodes = [...nodeById.values()].map((node) =>
          node.id === supportNode.id ? candidateNode : node
        );
        const candidateNodeById = new Map(candidateNodes.map((node) => [node.id, node]));
        const routeObstacleCount = incidentEdges.reduce(
          (count, edge) => count + getRouteObstacleCount(edge, candidateNodes, candidateNodeById),
          0
        );
        const nodeOverlapCount = candidateNodes.filter(
          (node) =>
            node.id !== candidateNode.id &&
            !isAreaNode(node) &&
            doNodesOverlap(candidateNode, node)
        ).length;
        const canvasExpansion = Math.max(0, getCanvasArea(candidateNodes) - baselineCanvasArea);
        const score =
          routeObstacleCount * SUPPORT_ROUTE_OBSTACLE_PENALTY +
          nodeOverlapCount * SUPPORT_ROUTE_NODE_OVERLAP_PENALTY +
          canvasExpansion * SUPPORT_ROUTE_CANVAS_EXPANSION_PENALTY +
          Math.abs(offset) * SUPPORT_ROUTE_OFFSET_PENALTY;

        if (score < bestScore) {
          bestOffset = offset;
          bestScore = score;
        }
      }

      if (bestOffset !== 0) {
        moveSubtree(supportNode.id, { x: bestOffset, y: 0 }, nodeById);
      }
    }
  }
}

function getRouteObstacleCount(
  edge: AutomaticDiagramLayoutEdge,
  nodes: readonly DiagramNode[],
  nodeById: ReadonlyMap<string, DiagramNode>
): number {
  const source = nodeById.get(edge.sourceId);
  const target = nodeById.get(edge.targetId);

  if (!source || !target || isContainmentLabel(edge.label)) {
    return 0;
  }

  const handles = getObstacleSafeEdgeHandles(source, target, nodes);

  return nodes.filter(
    (node) =>
      node.id !== source.id &&
      node.id !== target.id &&
      !isAreaNode(node) &&
      getOrthogonalRouteNodeOverlapLength(source, target, handles, node) > 0
  ).length;
}

export function evaluateAutomaticDiagramLayout(
  input: Pick<AutomaticDiagramLayoutInput, "edges" | "nodes">
): AutomaticDiagramLayoutQuality {
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const roleByNodeId = new Map(
    input.nodes.filter((node) => !isAreaNode(node)).map((node) => [node.id, classifySemanticRole(node)])
  );
  const nonAreaNodes = input.nodes.filter((node) => !isAreaNode(node));
  const areaTitleObstacles = input.nodes.filter(isAreaNode).map(createAreaTitleRoutingObstacle);
  let nodeOverlapCount = 0;
  let siblingAreaOverlapCount = 0;

  for (let leftIndex = 0; leftIndex < input.nodes.length; leftIndex += 1) {
    const left = input.nodes[leftIndex];

    if (!left) continue;

    for (let rightIndex = leftIndex + 1; rightIndex < input.nodes.length; rightIndex += 1) {
      const right = input.nodes[rightIndex];

      if (!right || !doNodesOverlap(left, right)) continue;

      if (!isAreaNode(left) && !isAreaNode(right)) {
        nodeOverlapCount += 1;
      } else if (
        isAreaNode(left) &&
        isAreaNode(right) &&
        left.metadata?.parentAreaNodeId === right.metadata?.parentAreaNodeId
      ) {
        siblingAreaOverlapCount += 1;
      }
    }
  }

  const parentBoundaryViolationCount = input.nodes.reduce((count, node) => {
    const parentAreaNodeId = node.metadata?.parentAreaNodeId;
    const parent = parentAreaNodeId ? nodeById.get(parentAreaNodeId) : undefined;

    return parent && !doesNodeContain(parent, node) ? count + 1 : count;
  }, 0);
  const routedEdges = input.edges.flatMap((edge) => {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);

    if (!source || !target || isContainmentLabel(edge.label)) {
      return [];
    }

    const primary = isPrimaryLayoutEdge(edge, roleByNodeId);
    const handles = getObstacleSafeEdgeHandles(source, target, input.nodes);
    const segments = getObstacleSafeOrthogonalRouteSegments(source, target, handles);

    return [{ edge, handles, primary, segments, source, target }];
  });
  let edgeCrossingCount = 0;
  let edgeAreaTitleIntersectionCount = 0;
  let edgeNodeIntersectionCount = 0;
  let totalEdgeLength = 0;
  let backwardEdgeCount = 0;
  let mainFlowContinuityTotal = 0;
  let mainFlowEdgeCount = 0;

  for (const route of routedEdges) {
    totalEdgeLength += route.segments.reduce((length, segment) => length + getSegmentLength(segment), 0);

    if (route.primary) {
      const sourceCenter = getNodeCenter(route.source);
      const targetCenter = getNodeCenter(route.target);

      if (targetCenter.x <= sourceCenter.x) backwardEdgeCount += 1;
      mainFlowContinuityTotal += Math.abs(targetCenter.y - sourceCenter.y);
      mainFlowEdgeCount += 1;
    }

    for (const node of nonAreaNodes) {
      if (node.id === route.edge.sourceId || node.id === route.edge.targetId) continue;

      if (
        getOrthogonalRouteNodeOverlapLength(
          route.source,
          route.target,
          route.handles,
          node
        ) > 0
      ) {
        edgeNodeIntersectionCount += 1;
      }
    }

    for (const areaTitle of areaTitleObstacles) {
      if (areaTitle.id === route.edge.sourceId || areaTitle.id === route.edge.targetId) continue;

      if (
        getOrthogonalRouteNodeOverlapLength(
          route.source,
          route.target,
          route.handles,
          areaTitle
        ) > 0
      ) {
        edgeAreaTitleIntersectionCount += 1;
      }
    }
  }

  for (let leftIndex = 0; leftIndex < routedEdges.length; leftIndex += 1) {
    const left = routedEdges[leftIndex];

    if (!left) continue;

    for (let rightIndex = leftIndex + 1; rightIndex < routedEdges.length; rightIndex += 1) {
      const right = routedEdges[rightIndex];

      if (!right || shareEndpoint(left.edge, right.edge)) continue;

      edgeCrossingCount += left.segments.reduce(
        (count, leftSegment) =>
          count + right.segments.filter((rightSegment) => doSegmentsCross(leftSegment, rightSegment)).length,
        0
      );
    }
  }

  const bounds = getCanvasBounds(input.nodes);
  const canvasArea = Math.max(0, bounds.width * bounds.height);
  const canvasAspectRatioPenalty =
    bounds.width === 0
      ? 0
      : Math.max(0, bounds.height / bounds.width - PREFERRED_CANVAS_HEIGHT_TO_WIDTH_RATIO);
  const resourceArea = nonAreaNodes.reduce((area, node) => area + node.size.width * node.size.height, 0);
  const emptySpaceRatio = canvasArea === 0 ? 0 : Math.max(0, Math.min(1, 1 - resourceArea / canvasArea));
  const repeatAlignmentError = getRepeatAlignmentError(input.nodes);
  const supportLaneIntrusionCount = getSupportLaneIntrusionCount(input.nodes, roleByNodeId);
  const mainFlowContinuityError = mainFlowEdgeCount === 0 ? 0 : mainFlowContinuityTotal / mainFlowEdgeCount;
  const score =
    nodeOverlapCount * 1_000_000_000 +
    siblingAreaOverlapCount * 1_000_000_000 +
    parentBoundaryViolationCount * 1_000_000_000 +
    edgeNodeIntersectionCount * 80_000_000 +
    edgeAreaTitleIntersectionCount * 70_000_000 +
    edgeCrossingCount * 50_000_000 +
    backwardEdgeCount * 40_000_000 +
    supportLaneIntrusionCount * 30_000_000 +
    repeatAlignmentError * 10_000 +
    mainFlowContinuityError * 2_000 +
    totalEdgeLength * 20 +
    canvasArea * 0.005 +
    emptySpaceRatio * 100_000 +
    canvasAspectRatioPenalty * CANVAS_ASPECT_RATIO_PENALTY;

  return {
    backwardEdgeCount,
    canvasArea,
    canvasAspectRatioPenalty,
    edgeAreaTitleIntersectionCount,
    edgeCrossingCount,
    edgeNodeIntersectionCount,
    emptySpaceRatio,
    mainFlowContinuityError,
    nodeOverlapCount,
    parentBoundaryViolationCount,
    repeatAlignmentError,
    score,
    siblingAreaOverlapCount,
    supportLaneIntrusionCount,
    totalEdgeLength
  };
}

function isPrimaryLayoutEdge(
  edge: AutomaticDiagramLayoutEdge,
  roleByNodeId: ReadonlyMap<string, SemanticRole>
): boolean {
  const label = edge.label?.toLowerCase() ?? "";

  return (
    isPrimaryFlowRole(roleByNodeId.get(edge.sourceId)) &&
    isPrimaryFlowRole(roleByNodeId.get(edge.targetId)) &&
    !/(deploy|pipeline|monitor|metric|alarm|log|policy|role|permission|encrypt|depend)/u.test(label)
  );
}

function isContainmentLabel(label: string | undefined): boolean {
  return label?.trim().toLowerCase() === "contains" || label?.trim().toLowerCase() === "hosts";
}

function getNodeCenter(node: DiagramNode): DiagramNode["position"] {
  return {
    x: node.position.x + node.size.width / 2,
    y: node.position.y + node.size.height / 2
  };
}

function getSegmentLength(segment: OrthogonalRouteSegment): number {
  return Math.abs(segment.to.x - segment.from.x) + Math.abs(segment.to.y - segment.from.y);
}

function doSegmentsCross(left: OrthogonalRouteSegment, right: OrthogonalRouteSegment): boolean {
  const leftHorizontal = left.from.y === left.to.y;
  const rightHorizontal = right.from.y === right.to.y;

  if (leftHorizontal === rightHorizontal) return false;

  const horizontal = leftHorizontal ? left : right;
  const vertical = leftHorizontal ? right : left;
  const horizontalLeft = Math.min(horizontal.from.x, horizontal.to.x);
  const horizontalRight = Math.max(horizontal.from.x, horizontal.to.x);
  const verticalTop = Math.min(vertical.from.y, vertical.to.y);
  const verticalBottom = Math.max(vertical.from.y, vertical.to.y);

  return (
    vertical.from.x > horizontalLeft &&
    vertical.from.x < horizontalRight &&
    horizontal.from.y > verticalTop &&
    horizontal.from.y < verticalBottom
  );
}

function shareEndpoint(left: AutomaticDiagramLayoutEdge, right: AutomaticDiagramLayoutEdge): boolean {
  return (
    left.sourceId === right.sourceId ||
    left.sourceId === right.targetId ||
    left.targetId === right.sourceId ||
    left.targetId === right.targetId
  );
}

function doNodesOverlap(left: DiagramNode, right: DiagramNode): boolean {
  const leftBounds = getLayoutNodeBounds(left);
  const rightBounds = getLayoutNodeBounds(right);

  return (
    leftBounds.x < rightBounds.x + rightBounds.width &&
    leftBounds.x + leftBounds.width > rightBounds.x &&
    leftBounds.y < rightBounds.y + rightBounds.height &&
    leftBounds.y + leftBounds.height > rightBounds.y
  );
}

function doesNodeContain(parent: DiagramNode, child: DiagramNode): boolean {
  const childBounds = getLayoutNodeBounds(child);

  return (
    childBounds.x >= parent.position.x &&
    childBounds.y >= parent.position.y &&
    childBounds.x + childBounds.width <= parent.position.x + parent.size.width &&
    childBounds.y + childBounds.height <= parent.position.y + parent.size.height
  );
}

function getLayoutNodeBounds(node: DiagramNode): { x: number; y: number; width: number; height: number } {
  return isAreaNode(node)
    ? { x: node.position.x, y: node.position.y, width: node.size.width, height: node.size.height }
    : getResourceNodeVisualBounds(node);
}

function getCanvasBounds(nodes: readonly DiagramNode[]): { readonly width: number; readonly height: number } {
  if (nodes.length === 0) return { width: 0, height: 0 };

  const left = Math.min(...nodes.map((node) => node.position.x));
  const top = Math.min(...nodes.map((node) => node.position.y));
  const right = Math.max(...nodes.map((node) => node.position.x + node.size.width));
  const bottom = Math.max(...nodes.map((node) => node.position.y + node.size.height));

  return { width: right - left, height: bottom - top };
}

function getCanvasArea(nodes: readonly DiagramNode[]): number {
  const bounds = getCanvasBounds(nodes);

  return Math.max(0, bounds.width * bounds.height);
}

function getRepeatAlignmentError(nodes: readonly DiagramNode[]): number {
  const groups = new Map<string, DiagramNode[]>();

  for (const node of nodes) {
    const key = `${node.metadata?.parentAreaNodeId ?? ROOT_PARENT_ID}:${node.parameters?.resourceType ?? node.type}:${createRepeatKey(node)}`;
    const group = groups.get(key) ?? [];
    group.push(node);
    groups.set(key, group);
  }

  return [...groups.values()].reduce((total, group) => {
    if (group.length < 2) return total;

    const xRange = Math.max(...group.map((node) => node.position.x)) - Math.min(...group.map((node) => node.position.x));
    const yRange = Math.max(...group.map((node) => node.position.y)) - Math.min(...group.map((node) => node.position.y));

    return total + Math.min(xRange, yRange);
  }, 0);
}

function getSupportLaneIntrusionCount(
  nodes: readonly DiagramNode[],
  roleByNodeId: ReadonlyMap<string, SemanticRole>
): number {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodesByParentId = new Map<string, DiagramNode[]>();

  for (const node of nodes) {
    const parentId = node.metadata?.parentAreaNodeId ?? ROOT_PARENT_ID;
    const siblings = nodesByParentId.get(parentId) ?? [];
    siblings.push(node);
    nodesByParentId.set(parentId, siblings);
  }

  return [...nodesByParentId.values()].reduce((count, siblings) => {
    const primaryNodes = siblings.filter((node) =>
      isPrimaryFlowRole(getNodeSemanticRole(node, nodeById, roleByNodeId))
    );

    if (primaryNodes.length === 0) return count;

    const primaryBounds = primaryNodes.map(getLayoutNodeBounds);
    const primaryLeft = Math.min(...primaryBounds.map((bounds) => bounds.x));
    const primaryTop = Math.min(...primaryBounds.map((bounds) => bounds.y));
    const primaryRight = Math.max(...primaryBounds.map((bounds) => bounds.x + bounds.width));
    const primaryBottom = Math.max(...primaryBounds.map((bounds) => bounds.y + bounds.height));

    return (
      count +
      siblings.filter((node) => {
        if (
          isAreaNode(node) ||
          isPrimaryFlowRole(getNodeSemanticRole(node, nodeById, roleByNodeId))
        ) {
          return false;
        }
        const bounds = getLayoutNodeBounds(node);

        return (
          bounds.x < primaryRight &&
          bounds.x + bounds.width > primaryLeft &&
          bounds.y < primaryBottom &&
          bounds.y + bounds.height > primaryTop
        );
      }).length
    );
  }, 0);
}

function collectParentIds(nodes: readonly DiagramNode[]): string[] {
  const parentIds = new Set<string>([ROOT_PARENT_ID]);

  for (const node of nodes) {
    if (node.metadata?.parentAreaNodeId) {
      parentIds.add(node.metadata.parentAreaNodeId);
    }
  }

  return [...parentIds];
}

function compactEmptyAreaNode(
  node: DiagramNode,
  nodes: readonly DiagramNode[],
  protectedNodeIds: ReadonlySet<string>
): DiagramNode {
  if (
    !isAreaNode(node) ||
    protectedNodeIds.has(node.id) ||
    nodes.some((candidate) => candidate.metadata?.parentAreaNodeId === node.id)
  ) {
    return node;
  }

  const minimumSize = getAreaMinimumSize(node);

  return {
    ...node,
    size: minimumSize
  };
}

function layoutSiblingGroup(
  parentId: string,
  nodeById: Map<string, DiagramNode>,
  rankByNodeId: ReadonlyMap<string, number>,
  roleByNodeId: ReadonlyMap<string, SemanticRole>,
  primaryDistanceByNodeId: ReadonlyMap<string, number>,
  primaryFlowPathByNodeId: ReadonlyMap<string, string>,
  protectedNodeIds: ReadonlySet<string>,
  config: LayoutCandidateConfig
): void {
  const siblings = [...nodeById.values()].filter(
    (node) =>
      (node.metadata?.parentAreaNodeId ?? ROOT_PARENT_ID) === parentId &&
      !isSecurityGroupScopeNode(node)
  );

  if (siblings.length === 0) {
    return;
  }

  const nodesByRank = new Map<number, DiagramNode[]>();
  const laneByNodeId = new Map<string, LayoutLane>();
  const layoutFlowPathByNodeId = new Map(
    siblings.map((node) => [
      node.id,
      getLayoutFlowPath(node, nodeById, primaryFlowPathByNodeId)
    ])
  );

  for (const node of siblings) {
    const rank = getLayoutRank(node, nodeById, rankByNodeId, roleByNodeId);
    const rankedNodes = nodesByRank.get(rank) ?? [];
    rankedNodes.push(node);
    nodesByRank.set(rank, rankedNodes);
    laneByNodeId.set(
      node.id,
      getLayoutLane(getNodeSemanticRole(node, nodeById, roleByNodeId), config.supportPlacement)
    );
  }

  const sortedRanks = [...nodesByRank.keys()].sort((left, right) => left - right);
  const xByRank = new Map<number, number>();
  const parentNode = parentId === ROOT_PARENT_ID ? undefined : nodeById.get(parentId);
  const originX = parentNode
    ? parentNode.position.x + AREA_PADDING
    : Math.min(...siblings.map((node) => node.position.x), 0);
  let nextX = originX;

  for (const rank of sortedRanks) {
    xByRank.set(rank, nextX);
    const columnNodes = nodesByRank.get(rank) ?? [];
    const columnWidth = Math.max(...columnNodes.map((node) => node.size.width), 0);

    if (columnWidth > 0) {
      nextX += columnWidth + config.columnGap;
    }
  }

  const originY = parentNode
    ? parentNode.position.y + AREA_PADDING
    : Math.min(...siblings.map((node) => node.position.y), 0);
  const upperHeight = getLaneHeight("upper-support", sortedRanks, nodesByRank, laneByNodeId, config.rowGap);
  const primaryHeight = getLaneHeight("primary", sortedRanks, nodesByRank, laneByNodeId, config.rowGap);
  const primaryY = originY + (upperHeight > 0 ? upperHeight + SUPPORT_LANE_GAP : 0);
  const laneY: Readonly<Record<LayoutLane, number>> = {
    "upper-support": originY,
    primary: primaryY,
    "lower-support": primaryY + primaryHeight + SUPPORT_LANE_GAP
  };

  for (const lane of ["upper-support", "primary", "lower-support"] as const) {
    for (const rank of sortedRanks) {
      let nextY = laneY[lane];
      const rankedNodes = [...(nodesByRank.get(rank) ?? [])]
        .filter((node) => laneByNodeId.get(node.id) === lane)
        .sort((left, right) =>
          compareLaneNodes(
            left,
            right,
            lane,
            primaryDistanceByNodeId,
            layoutFlowPathByNodeId,
            config.primaryOrder
          )
        );

      for (const node of rankedNodes) {
        const currentNode = nodeById.get(node.id) ?? node;

        if (canMoveSubtree(currentNode.id, nodeById, protectedNodeIds)) {
          moveSubtree(
            currentNode.id,
            {
              x: (xByRank.get(rank) ?? currentNode.position.x) - currentNode.position.x,
              y: nextY - currentNode.position.y
            },
            nodeById
          );
        }

        const placedNode = nodeById.get(node.id) ?? currentNode;

        nextY = Math.max(
          nextY + placedNode.size.height + config.rowGap,
          placedNode.position.y + placedNode.size.height + config.rowGap
        );
      }
    }
  }

}

function getLayoutFlowPath(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>,
  primaryFlowPathByNodeId: ReadonlyMap<string, string>
): string {
  const directPath = primaryFlowPathByNodeId.get(node.id);

  if (directPath || !isAreaNode(node)) {
    return directPath ?? node.id;
  }

  const descendantPaths = [...nodeById.values()]
    .filter((candidate) => hasAreaAncestor(candidate, node.id, nodeById))
    .flatMap((candidate) => {
      const path = primaryFlowPathByNodeId.get(candidate.id);
      return path ? [path] : [];
    })
    .sort();

  return descendantPaths[0] ?? node.id;
}

function compareLaneNodes(
  left: DiagramNode,
  right: DiagramNode,
  lane: LayoutLane,
  primaryDistanceByNodeId: ReadonlyMap<string, number>,
  primaryFlowPathByNodeId: ReadonlyMap<string, string>,
  primaryOrder: LayoutCandidateConfig["primaryOrder"]
): number {
  if (lane === "primary") {
    const flowOrder = (primaryFlowPathByNodeId.get(left.id) ?? left.id).localeCompare(
      primaryFlowPathByNodeId.get(right.id) ?? right.id
    );

    if (flowOrder !== 0) {
      return primaryOrder === "ascending" ? flowOrder : -flowOrder;
    }
  }

  if (lane !== "primary") {
    const leftDistance = primaryDistanceByNodeId.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightDistance = primaryDistanceByNodeId.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    const distanceOrder = lane === "upper-support"
      ? rightDistance - leftDistance
      : leftDistance - rightDistance;

    if (distanceOrder !== 0) {
      return distanceOrder;
    }
  }

  return compareRepeatedNodes(left, right);
}

function getLaneHeight(
  lane: LayoutLane,
  sortedRanks: readonly number[],
  nodesByRank: ReadonlyMap<number, readonly DiagramNode[]>,
  laneByNodeId: ReadonlyMap<string, LayoutLane>,
  rowGap: number
): number {
  return Math.max(
    0,
    ...sortedRanks.map((rank) => {
      const nodes = (nodesByRank.get(rank) ?? []).filter((node) => laneByNodeId.get(node.id) === lane);

      return nodes.reduce((height, node, index) => height + node.size.height + (index === 0 ? 0 : rowGap), 0);
    })
  );
}

function getNodeSemanticRole(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>,
  roleByNodeId: ReadonlyMap<string, SemanticRole>
): SemanticRole {
  if (!isAreaNode(node)) {
    return roleByNodeId.get(node.id) ?? classifySemanticRole(node);
  }

  const descendantRoles = [...nodeById.values()]
    .filter((candidate) => hasAreaAncestor(candidate, node.id, nodeById) && !isAreaNode(candidate))
    .map((candidate) => roleByNodeId.get(candidate.id) ?? classifySemanticRole(candidate));

  return descendantRoles.find(isPrimaryFlowRole) ?? classifySemanticRole(node);
}

function getLayoutLane(
  role: SemanticRole,
  supportPlacement: LayoutCandidateConfig["supportPlacement"]
): LayoutLane {
  if (isPrimaryFlowRole(role)) {
    return "primary";
  }

  if (supportPlacement === "above") {
    return "upper-support";
  }

  if (supportPlacement === "below") {
    return "lower-support";
  }

  return role === "security" || role === "delivery" ? "upper-support" : "lower-support";
}

function fitParentAreaToChildren(
  parentId: string,
  nodeById: Map<string, DiagramNode>,
  protectedNodeIds: ReadonlySet<string>
): void {
  if (parentId === ROOT_PARENT_ID) {
    return;
  }

  const parent = nodeById.get(parentId);
  const children = [...nodeById.values()].filter(
    (node) =>
      node.metadata?.parentAreaNodeId === parentId &&
      !isSecurityGroupScopeNode(node)
  );

  if (!parent || !isAreaNode(parent) || children.length === 0) {
    return;
  }

  const childBounds = children.map((child) => getLayoutNodeBounds(child));
  const left = Math.min(...childBounds.map((bounds) => bounds.x)) - AREA_PADDING;
  const top = Math.min(...childBounds.map((bounds) => bounds.y)) - AREA_PADDING;
  const right = Math.max(...childBounds.map((bounds) => bounds.x + bounds.width)) + AREA_PADDING;
  const bottom = Math.max(...childBounds.map((bounds) => bounds.y + bounds.height)) + AREA_PADDING;
  const minimumSize = getAreaMinimumSize(parent);

  if (protectedNodeIds.has(parentId)) {
    nodeById.set(parentId, {
      ...parent,
      size: {
        width: Math.max(parent.size.width, right - parent.position.x, minimumSize.width),
        height: Math.max(parent.size.height, bottom - parent.position.y, minimumSize.height)
      }
    });
    return;
  }

  nodeById.set(parentId, {
    ...parent,
    position: { x: left, y: top },
    size: {
      width: Math.max(right - left, minimumSize.width),
      height: Math.max(bottom - top, minimumSize.height)
    }
  });
}

function getLayoutRank(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>,
  rankByNodeId: ReadonlyMap<string, number>,
  roleByNodeId: ReadonlyMap<string, SemanticRole>
): number {
  if (!isAreaNode(node)) {
    return rankByNodeId.get(node.id) ?? ROLE_RANK[classifySemanticRole(node)];
  }

  const descendantRanks = [...nodeById.values()]
    .filter(
      (candidate) =>
        hasAreaAncestor(candidate, node.id, nodeById) &&
        !isAreaNode(candidate) &&
        isPrimaryFlowRole(roleByNodeId.get(candidate.id))
    )
    .map((candidate) => rankByNodeId.get(candidate.id) ?? ROLE_RANK[classifySemanticRole(candidate)]);

  const ownRoleRank = ROLE_RANK[classifySemanticRole(node)];

  return descendantRanks.length > 0
    ? Math.max(Math.min(...descendantRanks), ownRoleRank)
    : ownRoleRank;
}

function getParentDepth(parentId: string, nodeById: ReadonlyMap<string, DiagramNode>): number {
  if (parentId === ROOT_PARENT_ID) {
    return -1;
  }

  let depth = 0;
  let currentId: string | undefined = parentId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    currentId = nodeById.get(currentId)?.metadata?.parentAreaNodeId;
    if (currentId) depth += 1;
  }

  return depth;
}

function canMoveSubtree(
  nodeId: string,
  nodeById: ReadonlyMap<string, DiagramNode>,
  protectedNodeIds: ReadonlySet<string>
): boolean {
  return ![...nodeById.values()].some(
    (node) => protectedNodeIds.has(node.id) && (node.id === nodeId || hasAreaAncestor(node, nodeId, nodeById))
  );
}

function moveSubtree(
  nodeId: string,
  delta: DiagramNode["position"],
  nodeById: Map<string, DiagramNode>
): void {
  if (delta.x === 0 && delta.y === 0) {
    return;
  }

  for (const node of [...nodeById.values()]) {
    if (node.id !== nodeId && !hasAreaAncestor(node, nodeId, nodeById)) {
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

function hasAreaAncestor(
  node: DiagramNode,
  ancestorAreaNodeId: string,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  let parentAreaNodeId = node.metadata?.parentAreaNodeId;
  const visited = new Set<string>();

  while (parentAreaNodeId && !visited.has(parentAreaNodeId)) {
    if (parentAreaNodeId === ancestorAreaNodeId) {
      return true;
    }

    visited.add(parentAreaNodeId);
    parentAreaNodeId = nodeById.get(parentAreaNodeId)?.metadata?.parentAreaNodeId;
  }

  return false;
}

function getAreaMinimumSize(node: DiagramNode): DiagramNode["size"] {
  return getAutomaticDiagramAreaMinimumSize(node);
}

function compareRepeatedNodes(left: DiagramNode, right: DiagramNode): number {
  const leftKey = createRepeatKey(left);
  const rightKey = createRepeatKey(right);

  return leftKey.localeCompare(rightKey) || left.id.localeCompare(right.id);
}

function createRepeatKey(node: DiagramNode): string {
  return `${node.parameters?.resourceType ?? node.type}:${node.label}`
    .toLowerCase()
    .replace(/(?:^|[\s_-])(?:az|zone)?[\s_-]?[a-z0-9]+$/u, "")
    .replace(/[\s_-]+/gu, " ")
    .trim();
}

function createPrimaryDistanceMap(
  nodes: readonly DiagramNode[],
  edges: readonly AutomaticDiagramLayoutEdge[],
  roleByNodeId: ReadonlyMap<string, SemanticRole>
): Map<string, number> {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const adjacentNodeIds = new Map(nodes.map((node) => [node.id, new Set<string>()]));

  for (const edge of edges) {
    if (
      !nodeIds.has(edge.sourceId) ||
      !nodeIds.has(edge.targetId) ||
      isContainmentLabel(edge.label)
    ) {
      continue;
    }

    adjacentNodeIds.get(edge.sourceId)?.add(edge.targetId);
    adjacentNodeIds.get(edge.targetId)?.add(edge.sourceId);
  }

  const distanceByNodeId = new Map<string, number>();
  const queue = nodes
    .filter((node) => isPrimaryFlowRole(roleByNodeId.get(node.id)))
    .map((node) => node.id)
    .sort();

  for (const nodeId of queue) {
    distanceByNodeId.set(nodeId, 0);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index];

    if (!nodeId) {
      continue;
    }

    const nextDistance = (distanceByNodeId.get(nodeId) ?? 0) + 1;
    const neighbors = [...(adjacentNodeIds.get(nodeId) ?? [])].sort();

    for (const neighborId of neighbors) {
      if (distanceByNodeId.has(neighborId)) {
        continue;
      }

      distanceByNodeId.set(neighborId, nextDistance);
      queue.push(neighborId);
    }
  }

  return distanceByNodeId;
}

function createFlowRanks(
  nodes: readonly DiagramNode[],
  edges: readonly AutomaticDiagramLayoutEdge[],
  roleByNodeId: ReadonlyMap<string, SemanticRole>
): Map<string, number> {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const rankByNodeId = new Map(
    nodes.map((node) => [node.id, ROLE_RANK[roleByNodeId.get(node.id) ?? "support"]])
  );
  const primaryEdges = edges
    .filter(
      (edge) =>
        nodeIds.has(edge.sourceId) &&
        nodeIds.has(edge.targetId) &&
        isPrimaryFlowRole(roleByNodeId.get(edge.sourceId)) &&
        isPrimaryFlowRole(roleByNodeId.get(edge.targetId))
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;

    for (const edge of primaryEdges) {
      const sourceRank = rankByNodeId.get(edge.sourceId) ?? 0;
      const targetRank = rankByNodeId.get(edge.targetId) ?? 0;
      const nextTargetRank = Math.max(targetRank, sourceRank + 1);

      if (nextTargetRank !== targetRank && nextTargetRank <= nodes.length + 4) {
        rankByNodeId.set(edge.targetId, nextTargetRank);
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  for (const node of nodes) {
    if (isPrimaryFlowRole(roleByNodeId.get(node.id))) {
      continue;
    }

    const connectedPrimaryRanks = edges.flatMap((edge) => {
      const connectedNodeId =
        edge.sourceId === node.id
          ? edge.targetId
          : edge.targetId === node.id
            ? edge.sourceId
            : undefined;

      return connectedNodeId && isPrimaryFlowRole(roleByNodeId.get(connectedNodeId))
        ? [rankByNodeId.get(connectedNodeId) ?? 0]
        : [];
    });

    if (connectedPrimaryRanks.length > 0) {
      rankByNodeId.set(node.id, Math.min(...connectedPrimaryRanks));
    }
  }

  return rankByNodeId;
}

function createPrimaryFlowPathMap(
  nodes: readonly DiagramNode[],
  edges: readonly AutomaticDiagramLayoutEdge[],
  roleByNodeId: ReadonlyMap<string, SemanticRole>,
  rankByNodeId: ReadonlyMap<string, number>
): Map<string, string> {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const incomingSourceIdsByTargetId = new Map<string, string[]>();

  for (const edge of edges) {
    if (
      !nodeIds.has(edge.sourceId) ||
      !nodeIds.has(edge.targetId) ||
      !isPrimaryFlowRole(roleByNodeId.get(edge.sourceId)) ||
      !isPrimaryFlowRole(roleByNodeId.get(edge.targetId)) ||
      (rankByNodeId.get(edge.sourceId) ?? 0) >= (rankByNodeId.get(edge.targetId) ?? 0)
    ) {
      continue;
    }

    const sourceIds = incomingSourceIdsByTargetId.get(edge.targetId) ?? [];
    sourceIds.push(edge.sourceId);
    incomingSourceIdsByTargetId.set(edge.targetId, sourceIds);
  }

  const pathByNodeId = new Map<string, string>();
  const resolvePath = (nodeId: string, visitingNodeIds: ReadonlySet<string>): string => {
    const cachedPath = pathByNodeId.get(nodeId);

    if (cachedPath) {
      return cachedPath;
    }
    if (visitingNodeIds.has(nodeId)) {
      return nodeId;
    }

    const nextVisitingNodeIds = new Set(visitingNodeIds).add(nodeId);
    const sourceIds = [...(incomingSourceIdsByTargetId.get(nodeId) ?? [])].sort();
    const path = sourceIds.length === 0
      ? nodeId
      : sourceIds
          .map((sourceId) => `${resolvePath(sourceId, nextVisitingNodeIds)}/${nodeId}`)
          .sort()[0] ?? nodeId;
    pathByNodeId.set(nodeId, path);
    return path;
  };

  for (const node of nodes) {
    if (isPrimaryFlowRole(roleByNodeId.get(node.id))) {
      resolvePath(node.id, new Set());
    }
  }

  return pathByNodeId;
}

function isPrimaryFlowRole(role: SemanticRole | undefined): boolean {
  return role === "actor" || role === "entry" || role === "network" || role === "compute" || role === "data" || role === "async";
}

function classifySemanticRole(node: DiagramNode): SemanticRole {
  return getAutomaticDiagramSemanticRole(node);
}
