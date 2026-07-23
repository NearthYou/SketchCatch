import type { BoardAutoOrganizeCandidate, DiagramJson, DiagramNode } from "@sketchcatch/types";
import { getResourceNodeVisualBounds } from "../diagram-editor/resource-node-visual-footprint";

const SAFE_REGRESSION_EXPLANATION = /^(?:Resource 겹침|같은 단계 영역 겹침|영역 경계 이탈|Resource를 지나는 연결선|영역 제목을 지나는 연결선|연결선 교차|반대 방향 연결선|지원 Resource의 주 흐름 침범)(?:이|가) \d+곳 늘었습니다\. 원본과 비교해 주세요\.$/u;

/** gg: 자동 정리 결과에서 사용자가 실제로 확인할 화면 변화만 쉬운 문장으로 만듭니다. */
export function createReverseEngineeringLayoutSummary(
  sourceDiagram: DiagramJson,
  candidate: BoardAutoOrganizeCandidate
): readonly string[] {
  const sourceOverlapCount = countResourceOverlaps(sourceDiagram);
  const organizedOverlapCount = countResourceOverlaps(candidate.diagram);
  const sourceOutsideSubnetIds = getResourcesOutsideSubnet(sourceDiagram);
  const organizedOutsideSubnetIds = getResourcesOutsideSubnet(candidate.diagram);
  const summary = [
    ...getSafeRegressionExplanations(candidate),
    summarizeCountChange({
      before: sourceOverlapCount,
      after: organizedOverlapCount,
      emptyMessage: "겹친 리소스가 없습니다.",
      improvedMessage: (count) => `리소스 겹침 ${count}곳을 정리했습니다.`,
      remainingMessage: (count) => `겹친 리소스 ${count}곳을 확인해 주세요.`,
      partialMessage: (improved, remaining) =>
        `리소스 겹침 ${improved}곳을 정리했고, ${remaining}곳은 확인이 필요합니다.`
    }),
    summarizeSubnetChange(
      sourceDiagram,
      candidate.diagram,
      sourceOutsideSubnetIds,
      organizedOutsideSubnetIds
    ),
    summarizeVisualDiff(candidate)
  ];

  return [...new Set(summary.filter((message): message is string => message !== null))].slice(0, 6);
}

/** gg: Compiler가 직접 계산한 악화 문장 중 고정된 사용자 안전 형식만 먼저 노출합니다. */
function getSafeRegressionExplanations(candidate: BoardAutoOrganizeCandidate): string[] {
  return candidate.explanations.filter((message) => SAFE_REGRESSION_EXPLANATION.test(message)).slice(0, 3);
}

type CountSummaryInput = {
  readonly after: number;
  readonly before: number;
  readonly emptyMessage: string;
  readonly improvedMessage: (count: number) => string;
  readonly partialMessage: (improved: number, remaining: number) => string;
  readonly remainingMessage: (count: number) => string;
};

/** gg: 전후 수치를 비교해 실제로 해결된 범위보다 과장하지 않습니다. */
function summarizeCountChange(input: CountSummaryInput): string {
  if (input.after === 0) {
    return input.before > 0 ? input.improvedMessage(input.before) : input.emptyMessage;
  }

  const improvement = Math.max(0, input.before - input.after);
  return improvement > 0
    ? input.partialMessage(improvement, input.after)
    : input.remainingMessage(input.after);
}

/** gg: Design 영역과 부모-자식 포함 관계는 겹침에서 빼고 Resource끼리의 충돌만 셉니다. */
function countResourceOverlaps(diagram: DiagramJson): number {
  const resources = diagram.nodes.filter((node) => node.kind === "resource");
  const nodeById = new Map(diagram.nodes.map((node) => [node.id, node]));
  const parentByChildId = createParentByChildId(diagram);
  let count = 0;

  for (let leftIndex = 0; leftIndex < resources.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < resources.length; rightIndex += 1) {
      const left = resources[leftIndex]!;
      const right = resources[rightIndex]!;

      if (
        isAncestor(left, right, nodeById, parentByChildId) ||
        isAncestor(right, left, nodeById, parentByChildId) ||
        !rectanglesOverlap(left, right)
      ) {
        continue;
      }

      count += 1;
    }
  }

  return count;
}

/** gg: Subnet 소속으로 기록된 Resource가 실제 화면 경계 안에 들어왔는지만 확인합니다. */
function getResourcesOutsideSubnet(diagram: DiagramJson): ReadonlySet<string> {
  const nodeById = new Map(diagram.nodes.map((node) => [node.id, node]));
  const parentByChildId = createParentByChildId(diagram);

  return new Set(diagram.nodes.flatMap((node) => {
    const parentId = parentByChildId.get(node.id);
    const parent = parentId ? nodeById.get(parentId) : undefined;

    return parent && isSubnet(parent) && !rectangleContains(parent, node) ? [node.id] : [];
  }));
}

/** gg: Resource 이동과 Area 크기 조정을 구분해 실제로 하지 않은 이동을 주장하지 않습니다. */
function summarizeSubnetChange(
  sourceDiagram: DiagramJson,
  candidateDiagram: DiagramJson,
  sourceOutsideIds: ReadonlySet<string>,
  candidateOutsideIds: ReadonlySet<string>
): string {
  if (candidateOutsideIds.size === 0) {
    if (sourceOutsideIds.size === 0) return "서브넷 밖 리소스가 없습니다.";
    const resolvedIds = [...sourceOutsideIds];
    return resolvedIds.every((id) => didNodeMove(sourceDiagram, candidateDiagram, id))
      ? `서브넷 밖 리소스 ${resolvedIds.length}개를 안으로 옮겼습니다.`
      : `서브넷 경계를 조정해 리소스 ${resolvedIds.length}개를 안에 포함했습니다.`;
  }

  const improvement = Math.max(0, sourceOutsideIds.size - candidateOutsideIds.size);
  if (improvement === 0) {
    return `서브넷 밖 리소스 ${candidateOutsideIds.size}개를 확인해 주세요.`;
  }

  const resolvedIds = [...sourceOutsideIds].filter((id) => !candidateOutsideIds.has(id));
  return resolvedIds.every((id) => didNodeMove(sourceDiagram, candidateDiagram, id))
    ? `서브넷 밖 리소스 ${improvement}개를 옮겼고, ${candidateOutsideIds.size}개는 확인이 필요합니다.`
    : `서브넷 경계 밖 문제가 ${improvement}개 줄었고, ${candidateOutsideIds.size}개는 확인이 필요합니다.`;
}

function didNodeMove(source: DiagramJson, candidate: DiagramJson, nodeId: string): boolean {
  const before = source.nodes.find((node) => node.id === nodeId)?.position;
  const after = candidate.nodes.find((node) => node.id === nodeId)?.position;
  return Boolean(before && after && (before.x !== after.x || before.y !== after.y));
}

/** gg: RE 원본의 contains/hosts edge와 Board metadata를 같은 실제 포함관계로 읽습니다. */
function createParentByChildId(diagram: DiagramJson): ReadonlyMap<string, string> {
  const nodeIds = new Set(diagram.nodes.map((node) => node.id));
  const parentByChildId = new Map<string, string>();

  for (const node of diagram.nodes) {
    const parentId = node.metadata?.parentAreaNodeId;
    if (parentId && nodeIds.has(parentId)) {
      parentByChildId.set(node.id, parentId);
    }
  }

  for (const edge of diagram.edges) {
    const label = edge.label?.trim().toLowerCase();
    if (
      (label === "contains" || label === "hosts") &&
      nodeIds.has(edge.sourceNodeId) &&
      nodeIds.has(edge.targetNodeId) &&
      !parentByChildId.has(edge.targetNodeId)
    ) {
      parentByChildId.set(edge.targetNodeId, edge.sourceNodeId);
    }
  }

  return parentByChildId;
}

/** gg: Compiler가 바꾼 시각 요소를 개선으로 단정하지 않고 승인 전에 빠짐없이 알립니다. */
function summarizeVisualDiff(candidate: BoardAutoOrganizeCandidate): string | null {
  const parts = [
    formatVisualChange("리소스 위치", candidate.visualDiff.movedNodeIds.length),
    formatVisualChange("크기", candidate.visualDiff.resizedNodeIds.length),
    formatVisualChange(
      "표시 영역",
      candidate.visualDiff.addedFrameIds.length +
        candidate.visualDiff.changedFrameIds.length +
        candidate.visualDiff.removedFrameIds.length
    ),
    formatVisualChange("연결선 경로", candidate.visualDiff.reroutedEdgeIds.length)
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? `${parts.join(", ")}가 바뀌었습니다. 결과를 확인해 주세요.` : null;
}

function formatVisualChange(label: string, count: number): string | null {
  return count > 0 ? `${label} ${count}개` : null;
}

/** gg: 타입 이름의 대소문자나 Terraform 형식 차이와 무관하게 Subnet을 찾습니다. */
function isSubnet(node: DiagramNode): boolean {
  const type = node.type.trim().toLowerCase();
  return type === "subnet" || type === "aws_subnet" || type.endsWith("_subnet");
}

function rectanglesOverlap(left: DiagramNode, right: DiagramNode): boolean {
  const leftBounds = getResourceNodeVisualBounds(left);
  const rightBounds = getResourceNodeVisualBounds(right);
  return (
    leftBounds.x < rightBounds.x + rightBounds.width &&
    leftBounds.x + leftBounds.width > rightBounds.x &&
    leftBounds.y < rightBounds.y + rightBounds.height &&
    leftBounds.y + leftBounds.height > rightBounds.y
  );
}

function rectangleContains(parent: DiagramNode, child: DiagramNode): boolean {
  const parentBounds = getResourceNodeVisualBounds(parent);
  const childBounds = getResourceNodeVisualBounds(child);
  return (
    childBounds.x >= parentBounds.x &&
    childBounds.y >= parentBounds.y &&
    childBounds.x + childBounds.width <= parentBounds.x + parentBounds.width &&
    childBounds.y + childBounds.height <= parentBounds.y + parentBounds.height
  );
}

function isAncestor(
  candidateAncestor: DiagramNode,
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>,
  parentByChildId: ReadonlyMap<string, string>
): boolean {
  const visited = new Set<string>();
  let parentId = parentByChildId.get(node.id);

  while (parentId && !visited.has(parentId)) {
    if (parentId === candidateAncestor.id) {
      return true;
    }

    visited.add(parentId);
    parentId = nodeById.has(parentId) ? parentByChildId.get(parentId) : undefined;
  }

  return false;
}
