import type { DiagramJson } from "@sketchcatch/types";

/** 저장된 Board는 사용자 이름, 위치, ID를 고치지 않고 그대로 복원합니다. */
export function restoreSavedDiagram(
  savedDiagram: DiagramJson | null | undefined,
  fallbackDiagram: DiagramJson
): DiagramJson {
  return savedDiagram ?? fallbackDiagram;
}
