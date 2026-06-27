import type {
  AiPreDeploymentAnalysisResult,
  AiTerraformErrorExplanationResult,
  DesignSimulationResult,
  LlmEnhancement,
  LlmEnhancementFallbackReason
} from "@sketchcatch/types";

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

// LLM 없이도 Pre-Deployment Check의 finding과 checklist를 쉬운 요약으로 보여줍니다.
export function createPreDeploymentCheckFallbackEnhancement(
  result: AiPreDeploymentAnalysisResult,
  fallbackReason: LlmEnhancementFallbackReason
): LlmEnhancement {
  return {
    target: "pre_deployment_check",
    summary: result.summary,
    highlights: createPreDeploymentCheckHighlights(result),
    nextActions: createPreDeploymentCheckNextActions(result),
    fallbackUsed: true,
    fallbackReason
  };
}

// Terraform 오류 설명은 rule이 찾은 원인과 다음 행동을 그대로 LLM fallback 설명으로 씁니다.
export function createTerraformErrorExplanationFallbackEnhancement(
  result: AiTerraformErrorExplanationResult,
  fallbackReason: LlmEnhancementFallbackReason
): LlmEnhancement {
  return {
    target: "terraform_error_explanation",
    summary: result.summary,
    highlights: createTerraformErrorExplanationHighlights(result),
    nextActions: result.nextActions.slice(0, 5),
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

// finding과 checklist 중 사용자가 먼저 볼 항목만 추려 fallback highlight로 만듭니다.
function createPreDeploymentCheckHighlights(result: AiPreDeploymentAnalysisResult): string[] {
  const checklistIssues = result.checklist
    .filter((item) => item.status !== "pass")
    .map((item) => item.label);
  const highlights = [
    ...result.findings.map((finding) => finding.title),
    ...checklistIssues
  ].filter(isNonEmptyString);

  if (highlights.length === 0) {
    return ["현재 rule 기반 Pre-Deployment Check에서 막는 항목은 없습니다."];
  }

  return highlights.slice(0, 5);
}

// ArchitectureSuggestion이 있으면 그 설명을 다음 행동으로 쓰고, 없으면 재점검 행동을 제안합니다.
function createPreDeploymentCheckNextActions(result: AiPreDeploymentAnalysisResult): string[] {
  const nextActions = result.suggestions
    .map((suggestion) => suggestion.explanation)
    .filter(isNonEmptyString)
    .slice(0, 5);

  if (nextActions.length > 0) {
    return nextActions;
  }

  return ["Architecture Board 설정을 확인한 뒤 Pre-Deployment Check를 다시 실행하세요."];
}

// stage, category, 원인, 관련 Resource만 남겨 원본 오류보다 짧은 highlight를 만듭니다.
function createTerraformErrorExplanationHighlights(result: AiTerraformErrorExplanationResult): string[] {
  const highlights = [
    `${result.stage} 단계의 ${result.category} 오류입니다.`,
    result.likelyCause,
    result.relatedResourceId === undefined ? undefined : `관련 Resource: ${result.relatedResourceId}`
  ].filter(isNonEmptyString);

  return highlights.slice(0, 5);
}
