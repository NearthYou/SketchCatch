import type { DiagramNode } from "../../../../packages/types/src";
import type { ParameterCatalog } from "../parameter-input/catalog";
import { expandParentAreaNodesForEnteredChild } from "./area-node-expansion";
import {
  applyAreaNodeMovement,
  applyAreaNodeParentAssignments,
  getDirectlyMovedNodeIdsFromPositionMap
} from "./area-node-movement";
import { applyContainingReferenceDropTargets } from "./reference-drop-targets";
import { refitSecurityGroupScopesForTargetChanges } from "./security-group-scope";

type DraggedNodesInput = {
  readonly currentNodes: readonly DiagramNode[];
  readonly directlyMovedNodeIds: ReadonlySet<string>;
  readonly positionByNodeId: ReadonlyMap<string, DiagramNode["position"]>;
  readonly snapshotNodes: readonly DiagramNode[];
};

type FinalizeDraggedNodesInput = DraggedNodesInput & {
  readonly anchorNodeId: string;
  readonly autoExpandAreasEnabled?: boolean;
  readonly catalog: ParameterCatalog;
  readonly snapGridSize: number;
};

export type FinalizedDraggedNodes = {
  readonly directlyMovedNodeIds: Set<string>;
  readonly movedNodeIds: Set<string>;
  readonly nodes: DiagramNode[];
};

export function snapPositionToDiagramGrid(
  position: DiagramNode["position"],
  gridSize: number
): DiagramNode["position"] {
  return {
    x: snapValueToGrid(position.x, gridSize),
    y: snapValueToGrid(position.y, gridSize)
  };
}

export function getDraggedPreviewNodes({
  currentNodes,
  directlyMovedNodeIds,
  positionByNodeId,
  snapshotNodes
}: DraggedNodesInput): DiagramNode[] {
  const movedNodeIds = getDirectlyMovedNodeIds(snapshotNodes, positionByNodeId, directlyMovedNodeIds);

  return applyAreaNodeMovement(
    snapshotNodes,
    currentNodes.map((node) => {
      const position = movedNodeIds.has(node.id) ? positionByNodeId.get(node.id) : undefined;

      return position ? { ...node, position: { ...position } } : node;
    }),
    movedNodeIds
  );
}

/** 최종 drop에서 grid, containment, reference, SG visual scope를 한 번에 확정합니다. */
export function finalizeDraggedNodes({
  anchorNodeId,
  autoExpandAreasEnabled = true,
  catalog,
  currentNodes,
  directlyMovedNodeIds,
  positionByNodeId,
  snapGridSize,
  snapshotNodes
}: FinalizeDraggedNodesInput): FinalizedDraggedNodes {
  const movedNodeIds = getDirectlyMovedNodeIds(snapshotNodes, positionByNodeId, directlyMovedNodeIds);
  const snapshotNodeById = new Map(snapshotNodes.map((node) => [node.id, node]));
  const anchorSnapshotNode = snapshotNodeById.get(anchorNodeId);
  const anchorFreePosition = positionByNodeId.get(anchorNodeId) ?? anchorSnapshotNode?.position;
  const snappedAnchorPosition =
    anchorFreePosition ? snapPositionToDiagramGrid(anchorFreePosition, snapGridSize) : undefined;
  const snappedAnchorDelta =
    anchorSnapshotNode && snappedAnchorPosition
      ? {
          x: snappedAnchorPosition.x - anchorSnapshotNode.position.x,
          y: snappedAnchorPosition.y - anchorSnapshotNode.position.y
        }
      : { x: 0, y: 0 };
  const positionedNodes = currentNodes.map((node) => {
    if (!movedNodeIds.has(node.id)) {
      return node;
    }

    const snapshotNode = snapshotNodeById.get(node.id);
    const fallbackPosition = positionByNodeId.get(node.id) ?? node.position;
    const position = snapshotNode
      ? {
          x: snapshotNode.position.x + snappedAnchorDelta.x,
          y: snapshotNode.position.y + snappedAnchorDelta.y
        }
      : snapPositionToDiagramGrid(fallbackPosition, snapGridSize);

    return {
      ...node,
      position
    };
  });
  const nodesWithMovedAreaChildren = applyAreaNodeMovement(snapshotNodes, positionedNodes, movedNodeIds);
  const nodesWithAssignedParents = applyAreaNodeParentAssignments(nodesWithMovedAreaChildren, movedNodeIds);
  const enteredChildNodeIds = getEnteredChildNodeIds(
    snapshotNodes,
    nodesWithAssignedParents,
    movedNodeIds
  );
  const nodesWithExpandedParents = autoExpandAreasEnabled
    ? enteredChildNodeIds.reduce(
        (nodes, childNodeId) => expandParentAreaNodesForEnteredChild(nodes, childNodeId),
        nodesWithAssignedParents
      )
    : nodesWithAssignedParents;
  const preReferenceMovedNodeIds = getMovedNodeIdsFromNodes(snapshotNodes, nodesWithExpandedParents);
  const nodesWithReferences = applyContainingReferenceDropTargets(
    nodesWithExpandedParents,
    preReferenceMovedNodeIds,
    catalog
  );
  const finalizedNodes = refitSecurityGroupScopesForTargetChanges({
    changedNodeIds: preReferenceMovedNodeIds,
    currentNodes: nodesWithReferences,
    preserveScopeNodeIds: preReferenceMovedNodeIds,
    previousNodes: snapshotNodes
  });
  const allMovedNodeIds = getMovedNodeIdsFromNodes(snapshotNodes, finalizedNodes);

  return {
    directlyMovedNodeIds: movedNodeIds,
    movedNodeIds: allMovedNodeIds,
    nodes: finalizedNodes
  };
}

function getEnteredChildNodeIds(
  previousNodes: readonly DiagramNode[],
  currentNodes: readonly DiagramNode[],
  movedNodeIds: ReadonlySet<string>
): string[] {
  const previousNodeById = new Map(previousNodes.map((node) => [node.id, node]));

  return currentNodes
    .filter((node) => {
      if (!movedNodeIds.has(node.id)) {
        return false;
      }

      const parentAreaNodeId = node.metadata?.parentAreaNodeId;
      const previousParentAreaNodeId = previousNodeById.get(node.id)?.metadata?.parentAreaNodeId;

      return Boolean(parentAreaNodeId && parentAreaNodeId !== previousParentAreaNodeId);
    })
    .map((node) => node.id);
}

export function getMovedNodeIdsFromNodes(
  previousNodes: readonly DiagramNode[],
  currentNodes: readonly DiagramNode[]
): Set<string> {
  const movedNodeIds = new Set<string>();
  const previousPositionByNodeId = new Map(previousNodes.map((node) => [node.id, node.position]));

  for (const node of currentNodes) {
    const previousPosition = previousPositionByNodeId.get(node.id);

    if (previousPosition && isDifferentPosition(previousPosition, node.position)) {
      movedNodeIds.add(node.id);
    }
  }

  return movedNodeIds;
}

function getDirectlyMovedNodeIds(
  snapshotNodes: readonly DiagramNode[],
  positionByNodeId: ReadonlyMap<string, DiagramNode["position"]>,
  directlyMovedNodeIds: ReadonlySet<string>
): Set<string> {
  return getDirectlyMovedNodeIdsFromPositionMap(
    snapshotNodes,
    positionByNodeId,
    directlyMovedNodeIds.size > 0 ? directlyMovedNodeIds : undefined
  );
}

function snapValueToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

function isDifferentPosition(left: DiagramNode["position"], right: DiagramNode["position"]) {
  return left.x !== right.x || left.y !== right.y;
}
