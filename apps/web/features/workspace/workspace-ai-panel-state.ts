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
    fingerprint: createWorkspaceAiBoardFingerprint(diagramJson),
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

// 사용자가 승인한 AI 미리보기가 현재 Board 기준일 때만 실제 적용 함수를 호출합니다.
export function applyWorkspaceAiBoardPreview({
  applyDiagram,
  baseFingerprint,
  currentDiagram,
  previewDiagram
}: {
  readonly applyDiagram: (diagram: DiagramJson) => void;
  readonly baseFingerprint: string;
  readonly currentDiagram: DiagramJson;
  readonly previewDiagram: DiagramJson;
}): "applied" | "stale" {
  const currentFingerprint = createWorkspaceAiBoardSnapshot(currentDiagram).fingerprint;
  if (isWorkspaceAiResultStale(baseFingerprint, currentFingerprint)) return "stale";

  applyDiagram(previewDiagram);
  return "applied";
}

// AI 적용은 viewport를 제외한 Board 전체가 요청 당시와 같을 때만 허용합니다.
function createWorkspaceAiBoardFingerprint(diagramJson: DiagramJson): string {
  return JSON.stringify({ nodes: diagramJson.nodes, edges: diagramJson.edges });
}
