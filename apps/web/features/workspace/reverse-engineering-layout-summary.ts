import type { BoardAutoOrganizeCandidate, DiagramJson, DiagramNode } from "@sketchcatch/types";

/** gg: 자동 정리 결과에서 사용자가 실제로 확인할 화면 변화만 쉬운 문장으로 만듭니다. */
export function createReverseEngineeringLayoutSummary(
  sourceDiagram: DiagramJson,
  candidate: BoardAutoOrganizeCandidate
): readonly string[] {
  const sourceOverlapCount = countResourceOverlaps(sourceDiagram);
  const organizedOverlapCount = countResourceOverlaps(candidate.diagram);
  const sourceOutsideSubnetCount = countResourcesOutsideSubnet(sourceDiagram);
  const organizedOutsideSubnetCount = countResourcesOutsideSubnet(candidate.diagram);
  const summary = [
    summarizeCountChange({
      before: sourceOverlapCount,
      after: organizedOverlapCount,
      emptyMessage: "겹친 리소스가 없습니다.",
      improvedMessage: (count) => `리소스 겹침 ${count}곳을 정리했습니다.`,
      remainingMessage: (count) => `겹친 리소스 ${count}곳을 확인해 주세요.`,
      partialMessage: (improved, remaining) =>
        `리소스 겹침 ${improved}곳을 정리했고, ${remaining}곳은 확인이 필요합니다.`
    }),
    candidate.visualDiff.reroutedEdgeIds.length > 0
      ? `연결선 ${candidate.visualDiff.reroutedEdgeIds.length}개를 보기 쉽게 정리했습니다.`
      : null,
    summarizeCountChange({
      before: sourceOutsideSubnetCount,
      after: organizedOutsideSubnetCount,
      emptyMessage: "서브넷 밖 리소스가 없습니다.",
      improvedMessage: (count) => `서브넷 밖 리소스 ${count}개를 안으로 옮겼습니다.`,
      remainingMessage: (count) => `서브넷 밖 리소스 ${count}개를 확인해 주세요.`,
      partialMessage: (improved, remaining) =>
        `서브넷 밖 리소스 ${improved}개를 옮겼고, ${remaining}개는 확인이 필요합니다.`
    })
  ];

  return summary.filter((message): message is string => message !== null).slice(0, 3);
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
  let count = 0;

  for (let leftIndex = 0; leftIndex < resources.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < resources.length; rightIndex += 1) {
      const left = resources[leftIndex]!;
      const right = resources[rightIndex]!;

      if (
        isAncestor(left, right, nodeById) ||
        isAncestor(right, left, nodeById) ||
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
function countResourcesOutsideSubnet(diagram: DiagramJson): number {
  const nodeById = new Map(diagram.nodes.map((node) => [node.id, node]));

  return diagram.nodes.filter((node) => {
    const parentId = node.metadata?.parentAreaNodeId;
    const parent = parentId ? nodeById.get(parentId) : undefined;

    return parent && isSubnet(parent) && !rectangleContains(parent, node);
  }).length;
}

/** gg: 타입 이름의 대소문자나 Terraform 형식 차이와 무관하게 Subnet을 찾습니다. */
function isSubnet(node: DiagramNode): boolean {
  const type = node.type.trim().toLowerCase();
  return type === "subnet" || type === "aws_subnet" || type.endsWith("_subnet");
}

function rectanglesOverlap(left: DiagramNode, right: DiagramNode): boolean {
  return (
    left.position.x < right.position.x + right.size.width &&
    left.position.x + left.size.width > right.position.x &&
    left.position.y < right.position.y + right.size.height &&
    left.position.y + left.size.height > right.position.y
  );
}

function rectangleContains(parent: DiagramNode, child: DiagramNode): boolean {
  return (
    child.position.x >= parent.position.x &&
    child.position.y >= parent.position.y &&
    child.position.x + child.size.width <= parent.position.x + parent.size.width &&
    child.position.y + child.size.height <= parent.position.y + parent.size.height
  );
}

function isAncestor(
  candidateAncestor: DiagramNode,
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  const visited = new Set<string>();
  let parentId = node.metadata?.parentAreaNodeId;

  while (parentId && !visited.has(parentId)) {
    if (parentId === candidateAncestor.id) {
      return true;
    }

    visited.add(parentId);
    parentId = nodeById.get(parentId)?.metadata?.parentAreaNodeId;
  }

  return false;
}
