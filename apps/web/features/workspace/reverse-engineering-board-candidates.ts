import type {
  ArchitectureJson,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";

export type ReverseEngineeringBoardCandidate = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly architectureJson: ArchitectureJson;
  readonly resourceCount: number;
  readonly nodeCount: number;
  readonly edgeCount: number;
};

export function createReverseEngineeringBoardCandidates(
  result: ReverseEngineeringScanResult
): readonly ReverseEngineeringBoardCandidate[] {
  const automaticCandidate = createAutomaticCandidate(result.architectureJson);
  const ambiguousTargetIds = findAmbiguousContainmentTargetIds(result.architectureJson);

  if (ambiguousTargetIds.size === 0) {
    return [automaticCandidate];
  }

  return [
    automaticCandidate,
    createConservativeCandidate(result.architectureJson, ambiguousTargetIds)
  ];
}

// 사용자가 고른 구조 해석을 미리보기와 적용에 쓰되, 발견한 Resource 목록은 그대로 유지합니다.
export function createReverseEngineeringCandidateResult(
  result: ReverseEngineeringScanResult,
  candidate: ReverseEngineeringBoardCandidate
): ReverseEngineeringScanResult {
  return {
    ...result,
    architectureJson: candidate.architectureJson,
    reverseEngineeringDraft: {
      ...result.reverseEngineeringDraft,
      architectureJson: candidate.architectureJson
    }
  };
}

function createAutomaticCandidate(architectureJson: ArchitectureJson): ReverseEngineeringBoardCandidate {
  return createCandidate({
    architectureJson,
    description: "읽어온 Resource와 관계를 기준으로 자동 정리한 구조입니다.",
    id: "candidate-structure-auto",
    title: "자동 감지된 구조"
  });
}

// 여러 부모가 같은 Resource를 포함한다고 읽힌 경우, 애매한 포함선만 뺀 비교 후보를 만듭니다.
function createConservativeCandidate(
  architectureJson: ArchitectureJson,
  ambiguousTargetIds: ReadonlySet<string>
): ReverseEngineeringBoardCandidate {
  return createCandidate({
    architectureJson: {
      ...architectureJson,
      edges: architectureJson.edges.filter(
        (edge) => !isContainmentEdge(edge) || !ambiguousTargetIds.has(edge.targetId)
      )
    },
    description: "부모를 확정할 수 없는 Resource는 컨테이너 밖에 두고 나머지 관계만 표시합니다.",
    id: "candidate-structure-conservative",
    title: "확실한 관계만 표시"
  });
}

// 서로 다른 부모에서 들어오는 contains 선이 둘 이상인 Resource만 모호하다고 판단합니다.
function findAmbiguousContainmentTargetIds(architectureJson: ArchitectureJson): ReadonlySet<string> {
  const parentIdsByTargetId = new Map<string, Set<string>>();

  for (const edge of architectureJson.edges) {
    if (!isContainmentEdge(edge)) {
      continue;
    }

    const parentIds = parentIdsByTargetId.get(edge.targetId) ?? new Set<string>();
    parentIds.add(edge.sourceId);
    parentIdsByTargetId.set(edge.targetId, parentIds);
  }

  return new Set(
    [...parentIdsByTargetId.entries()]
      .filter(([, parentIds]) => parentIds.size > 1)
      .map(([targetId]) => targetId)
  );
}

// Architecture 관계 라벨 중 컨테이너 포함 관계만 후보 비교 대상으로 사용합니다.
function isContainmentEdge(edge: ArchitectureJson["edges"][number]): boolean {
  return (edge.label ?? "").trim().toLowerCase() === "contains";
}

type CreateCandidateInput = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly architectureJson: ArchitectureJson;
};

// 후보 카드에서 바로 보여줄 개수 정보를 ArchitectureJson 기준으로 계산합니다.
function createCandidate(input: CreateCandidateInput): ReverseEngineeringBoardCandidate {
  return {
    id: input.id,
    title: input.title,
    description: input.description,
    architectureJson: input.architectureJson,
    resourceCount: input.architectureJson.nodes.length,
    nodeCount: input.architectureJson.nodes.length,
    edgeCount: input.architectureJson.edges.length
  };
}
