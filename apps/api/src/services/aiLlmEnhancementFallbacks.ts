import type { DesignSimulationResult, LlmEnhancement, LlmEnhancementFallbackReason } from "@sketchcatch/types";

// LLM을 부를 수 없을 때도 Design Simulation의 rule 결과만으로 사용자 설명을 유지합니다.
export function createDesignSimulationFallbackEnhancement(
  result: DesignSimulationResult,
  fallbackReason: LlmEnhancementFallbackReason
): LlmEnhancement {
  return {
    target: "design_simulation",
    summary: result.summary,
    highlights: createDesignSimulationHighlights(result),
    nextActions: createDesignSimulationNextActions(result),
    fallbackUsed: true,
    fallbackReason
  };
}

// 병목, 장애, 비용 압박 중 이미 계산된 항목만 골라 fallback highlight로 바꿉니다.
function createDesignSimulationHighlights(result: DesignSimulationResult): string[] {
  const highlights = [
    result.requestFlow.length > 0
      ? `요청 흐름 ${result.requestFlow.length}개를 확인했습니다.`
      : "연결된 요청 흐름이 아직 없습니다.",
    result.bottlenecks[0]?.title,
    result.failureScenarios[0]?.title,
    result.costPressure[0]
  ].filter(isNonEmptyString);

  return highlights.slice(0, 5);
}

// 추천 문장이 없을 때도 사용자가 다음에 확인할 최소 행동을 보여줍니다.
function createDesignSimulationNextActions(result: DesignSimulationResult): string[] {
  if (result.recommendations.length > 0) {
    return result.recommendations.slice(0, 5);
  }

  return ["Resource 연결과 단일 장애 지점을 확인한 뒤 Design Simulation을 다시 실행하세요."];
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
