import type { ArchitectureJson, ReverseEngineeringScanResult } from "@sketchcatch/types";

export type ReverseEngineeringBoardCandidate = {
  readonly id: string;
  readonly architectureJson: ArchitectureJson;
};

export function createReverseEngineeringBoardCandidates(
  result: ReverseEngineeringScanResult
): readonly ReverseEngineeringBoardCandidate[] {
  return [createOriginalCandidate(result.architectureJson)];
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

// 원본 구조 후보에는 화면용 설명 없이 식별자와 원본 데이터만 둡니다.
function createOriginalCandidate(
  architectureJson: ArchitectureJson
): ReverseEngineeringBoardCandidate {
  return {
    id: "candidate-structure-auto",
    architectureJson
  };
}
