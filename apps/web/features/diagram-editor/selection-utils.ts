import type { DiagramEdge, DiagramNode } from "../../../../packages/types/src";
import { isAreaNode } from "./area-nodes";

// 노드 선택 중에는 엣지 툴바가 섞여 뜨지 않게 단일 엣지만 허용한다.
export function getSingleSelectedEdgeForToolbar(
  edges: readonly DiagramEdge[],
  selectedNodeIds: readonly string[],
  selectedEdgeIds: readonly string[]
): DiagramEdge | null {
  if (selectedNodeIds.length > 0 || selectedEdgeIds.length !== 1) {
    return null;
  }

  return edges.find((edge) => edge.id === selectedEdgeIds[0]) ?? null;
}

// VPC/Subnet 같은 영역 노드는 일반 리소스 다중 선택에서 분리한다.
export function normalizeSelectedNodeIds(
  nodes: readonly DiagramNode[],
  selectedNodeIds: readonly string[]
): string[] {
  if (selectedNodeIds.length <= 1) {
    return [...selectedNodeIds];
  }

  const areaNodeIds = new Set(nodes.filter(isAreaNode).map((node) => node.id));
  const resourceNodeIds = selectedNodeIds.filter((nodeId) => !areaNodeIds.has(nodeId));

  return resourceNodeIds.length > 0 ? resourceNodeIds : [...selectedNodeIds];
}

export function canStartAreaBlankDrag(areaNodeId: string, selectedNodeIds: readonly string[]): boolean {
  return selectedNodeIds.length === 1 && selectedNodeIds[0] === areaNodeId;
}

export function stabilizeSelectedIds(
  currentIds: string[],
  nextIds: readonly string[]
): string[] {
  if (currentIds.length === nextIds.length) {
    const currentIdSet = new Set(currentIds);

    if (nextIds.every((nextId) => currentIdSet.has(nextId))) {
      return currentIds;
    }
  }

  return [...nextIds];
}
