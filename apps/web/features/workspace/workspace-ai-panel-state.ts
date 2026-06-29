import type { ArchitectureJson, DiagramJson } from "@sketchcatch/types";
import { convertDiagramJsonToArchitectureJson } from "./workspace-ai-diagram-adapter";

export type WorkspaceAiBoardSnapshot = {
  readonly architectureJson: ArchitectureJson;
  readonly fingerprint: string;
  readonly hasResources: boolean;
};

// 현재 Architecture Board를 AI 분석 API 입력과 변경 감지 값으로 함께 묶습니다.
export function createWorkspaceAiBoardSnapshot(diagramJson: DiagramJson): WorkspaceAiBoardSnapshot {
  const architectureJson = convertDiagramJsonToArchitectureJson(diagramJson);

  return {
    architectureJson,
    fingerprint: createWorkspaceAiArchitectureFingerprint(architectureJson),
    hasResources: architectureJson.nodes.length > 0
  };
}

// 분석 결과가 만들어진 뒤 보드가 바뀌었는지 오른쪽 AI 패널에서 판단합니다.
export function isWorkspaceAiResultStale(
  resultFingerprint: string | null,
  currentFingerprint: string
): boolean {
  return resultFingerprint !== null && resultFingerprint !== currentFingerprint;
}

// AI 결과 만료 판단은 화면 이동/확대가 아니라 실제 분석 API 입력만 기준으로 합니다.
function createWorkspaceAiArchitectureFingerprint(architectureJson: ArchitectureJson): string {
  return JSON.stringify(architectureJson);
}
