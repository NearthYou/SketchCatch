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
  return [createAutomaticCandidate(result.architectureJson)];
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
