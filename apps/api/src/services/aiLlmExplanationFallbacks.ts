import type {
  AiArchitectureDraftResult,
  AiPreDeploymentAnalysisResult,
  AiTerraformErrorExplanationResult,
  AiTerraformPreviewExplanationResult,
  ArchitecturePatchPreview,
  DesignSimulationResult,
  LlmExplanation,
  LlmExplanationFallbackReason
} from "@sketchcatch/types";

// LLM이 없어도 Architecture Draft를 왜 만들었는지 metadata 기반 설명을 보여줍니다.
export function createArchitectureDraftFallbackExplanation(
  result: AiArchitectureDraftResult,
  fallbackReason: LlmExplanationFallbackReason
): LlmExplanation {
  return {
    target: "architecture_draft",
    summary: `${result.title} Architecture Draft를 만들었습니다.`,
    highlights: createArchitectureDraftHighlights(result),
    nextActions: createArchitectureDraftNextActions(result),
    fallbackUsed: true,
    fallbackReason
  };
}

// LLM을 부를 수 없을 때도 Design Simulation의 rule 결과만으로 사용자 설명을 유지합니다.
export function createDesignSimulationFallbackExplanation(
  result: DesignSimulationResult,
  fallbackReason: LlmExplanationFallbackReason
): LlmExplanation {
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
export function createPreDeploymentCheckFallbackExplanation(
  result: AiPreDeploymentAnalysisResult,
  fallbackReason: LlmExplanationFallbackReason
): LlmExplanation {
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
export function createTerraformErrorExplanationFallbackExplanation(
  result: AiTerraformErrorExplanationResult,
  fallbackReason: LlmExplanationFallbackReason
): LlmExplanation {
  return {
    target: "terraform_error_explanation",
    summary: result.summary,
    highlights: createTerraformErrorExplanationHighlights(result),
    nextActions: result.nextActions.slice(0, 5),
    fallbackUsed: true,
    fallbackReason
  };
}

export function createTerraformPreviewFallbackExplanation(
  result: AiTerraformPreviewExplanationResult,
  fallbackReason: LlmExplanationFallbackReason
): LlmExplanation {
  const findingSummary =
    result.findings.length > 0
      ? result.findings.map((finding) => finding.title).slice(0, 2).join(", ")
      : "현재 rule 기반 finding은 없습니다.";
  const wellArchitectedHighlights = [
    `운영 우수성 원칙: IaC Preview가 감지한 ${result.detectedResources.length}개 리소스와 체크리스트를 기준으로 변경 추적과 검증 절차를 확인하세요.`,
    `보안 원칙: ${findingSummary} 공개 접근, 권한 범위, 암호화 설정을 배포 전 다시 확인하세요.`,
    "신뢰성 원칙: 단일 리소스나 단일 역할 지점이 있는지 확인하고 필요하면 다중 AZ/복구 경로를 보강하세요.",
    "성능 효율성 원칙: 현재 Terraform 코드의 리소스 크기와 네트워크 경로가 예상 워크로드에 맞는지 검토하세요.",
    "비용 최적화 원칙: 상시 실행 리소스에 과한 용량 설정이 있는지 확인하고 practice 목적에 맞게 줄이세요.",
    "지속 가능성 원칙: 필요한 리소스만 생성하고 유휴 리소스 cleanup 경로를 유지하세요."
  ];

  return {
    target: "terraform_preview_explanation",
    summary: result.summary,
    highlights: wellArchitectedHighlights,
    nextActions:
      result.findings.length > 0
        ? result.findings.map((finding) => finding.recommendation).slice(0, 5)
        : ["IaC Preview와 Architecture Board가 같은 의도인지 확인한 뒤 다음 단계로 진행하세요."],
    wellArchitectedConclusion:
      "Overall evaluation: Review the preview code against all six Well-Architected pillars before accepting the IaC change.",
    fallbackUsed: true,
    fallbackReason
  };
}

export function createArchitecturePatchPreviewFallbackExplanation(
  result: ArchitecturePatchPreview,
  fallbackReason: LlmExplanationFallbackReason
): LlmExplanation {
  return {
    target: "architecture_patch_preview",
    summary: "Architecture Patch Preview를 만들었습니다. 아직 Architecture Board에는 적용되지 않았습니다.",
    highlights: result.changes.map((change) => change.summary).slice(0, 5),
    nextActions: [
      "diff preview를 검토하세요.",
      "원하는 변경일 때만 적용 버튼으로 User-Accepted Change를 기록하세요."
    ],
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

// 초안 metadata에서 선택 이유와 guardrail warning을 먼저 보여줄 highlight로 바꿉니다.
function createArchitectureDraftHighlights(result: AiArchitectureDraftResult): string[] {
  const guardrailWarnings = result.metadata.guardrailWarnings?.map((warning) => warning.message) ?? [];
  const highlights = [
    ...result.metadata.explanations,
    ...guardrailWarnings,
    ...result.metadata.assumptions
  ].filter(isNonEmptyString);

  if (highlights.length === 0) {
    return ["Architecture Board에서 열 수 있는 초안이 준비됐습니다."];
  }

  return highlights.slice(0, 5);
}

// 초안은 자동 적용하지 않고 사용자가 Board에서 확인할 행동만 제안합니다.
function createArchitectureDraftNextActions(result: AiArchitectureDraftResult): string[] {
  const actions = [
    "Architecture Board에서 Resource와 연결을 확인하세요.",
    result.metadata.guardrailWarnings !== undefined && result.metadata.guardrailWarnings.length > 0
      ? "warning 항목을 먼저 읽고 운영 조건과 맞는지 확인하세요."
      : undefined,
    "IaC Preview와 Pre-Deployment Check를 이어서 실행하세요."
  ].filter(isNonEmptyString);

  return actions.slice(0, 5);
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
