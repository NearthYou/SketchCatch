import type {
  AiPreDeploymentAnalysisResult,
  AiTerraformErrorExplanationResult,
  AiTerraformPreviewExplanationResult,
  ArchitecturePatchPreview,
  DesignSimulationResult
} from "@sketchcatch/types";
import type { LlmExplanationInput } from "./aiLlmExplanationTypes.js";

type DesignSimulationSummaryPayload = {
  readonly target: "design_simulation";
  readonly summary: string;
  readonly requestFlow: readonly string[];
  readonly bottlenecks: readonly string[];
  readonly failureScenarios: readonly string[];
  readonly costPressure: readonly string[];
  readonly recommendations: readonly string[];
};

type ArchitectureDraftSummaryPayload = {
  readonly target: "architecture_draft";
  readonly requirementPromptText: string | null;
  readonly title: string;
  readonly source: string;
  readonly confidence: string;
  readonly selectedDraftPattern: string | null;
  readonly nodeTypes: readonly string[];
  readonly edgeCount: number;
  readonly assumptions: readonly string[];
  readonly explanations: readonly string[];
  readonly guardrailWarnings: readonly string[];
};

type PreDeploymentCheckSummaryPayload = {
  readonly target: "pre_deployment_check";
  readonly summary: string;
  readonly findings: readonly string[];
  readonly checklist: readonly string[];
  readonly suggestions: readonly string[];
};

type TerraformErrorExplanationSummaryPayload = {
  readonly target: "terraform_error_explanation";
  readonly stage: string;
  readonly category: string;
  readonly severity: string;
  readonly rawMessage: string;
  readonly summary: string;
  readonly likelyCause: string;
  readonly nextActions: readonly string[];
  readonly diagnosticExplanation: AiTerraformErrorExplanationResult["diagnosticExplanation"] | null;
  readonly relatedResourceId: string | null;
  readonly terraformCodeContext: string | null;
};

type TerraformPreviewExplanationSummaryPayload = {
  readonly target: "terraform_preview_explanation";
  readonly summary: string;
  readonly findings: readonly string[];
  readonly checklist: readonly string[];
  readonly wellArchitectedGuidance: readonly string[];
  readonly consensusRecommendation: string;
};

type ArchitecturePatchPreviewSummaryPayload = {
  readonly target: "architecture_patch_preview";
  readonly requestedAction: string;
  readonly resourceType: string | null;
  readonly targetResourceId: string | null;
  readonly changes: readonly string[];
  readonly requiresUserAcceptance: true;
};

// schema는 Structured Outputs에 맡기고, prompt에는 설명 기준과 금지 기준만 남깁니다.
export function createSystemInstructions(): string {
  return [
    "AI 분석 결과를 쉬운 한국어로 보강하세요.",
    "어려운 클라우드 용어는 필요할 때만 쓰고 짧게 설명하세요.",
    "배포 가능, 비용 없음, 보안 안전을 보장하지 마세요.",
    "summary, highlights, nextActions는 사용자가 다음 행동을 고르기 쉽게 작성하세요."
  ].join("\n");
}

// target별 rule 결과에서 OpenAI에 넘길 최소 summary payload만 만듭니다.
export function createSummaryPayload(
  input: LlmExplanationInput
):
  | ArchitectureDraftSummaryPayload
  | PreDeploymentCheckSummaryPayload
  | DesignSimulationSummaryPayload
  | TerraformErrorExplanationSummaryPayload
  | TerraformPreviewExplanationSummaryPayload
  | ArchitecturePatchPreviewSummaryPayload {
  switch (input.target) {
    case "architecture_draft":
      return createArchitectureDraftSummaryPayload(input);
    case "design_simulation":
      return createDesignSimulationSummaryPayload(input.result);
    case "pre_deployment_check":
      return createPreDeploymentCheckSummaryPayload(input.result);
    case "terraform_error_explanation":
      return createTerraformErrorExplanationSummaryPayload(input);
    case "terraform_preview_explanation":
      return createTerraformPreviewExplanationSummaryPayload(input.result);
    case "architecture_patch_preview":
      return createArchitecturePatchPreviewSummaryPayload(input.result);
  }
}

// Architecture Draft는 초안 구조와 metadata만 넘기고 Board 전체 상태는 보내지 않습니다.
function createArchitectureDraftSummaryPayload(
  input: Extract<LlmExplanationInput, { readonly target: "architecture_draft" }>
): ArchitectureDraftSummaryPayload {
  const result = input.result;

  return {
    target: "architecture_draft",
    requirementPromptText: input.requirementPromptText ?? null,
    title: result.title,
    source: result.metadata.source,
    confidence: result.metadata.confidence,
    selectedDraftPattern: result.metadata.selectedDraftPattern ?? null,
    nodeTypes: result.architectureJson.nodes.map((node) => node.type),
    edgeCount: result.architectureJson.edges.length,
    assumptions: result.metadata.assumptions,
    explanations: result.metadata.explanations,
    guardrailWarnings: result.metadata.guardrailWarnings?.map((warning) => warning.message) ?? []
  };
}

// LLM 설명에 필요한 Resource 흐름과 위험 요약만 남겨 payload를 작게 유지합니다.
function createDesignSimulationSummaryPayload(result: DesignSimulationResult): DesignSimulationSummaryPayload {
  return {
    target: "design_simulation",
    summary: result.summary,
    requestFlow: result.requestFlow.map((step) => step.description),
    bottlenecks: result.bottlenecks.map((bottleneck) => bottleneck.title),
    failureScenarios: result.failureScenarios.map((scenario) => scenario.title),
    costPressure: result.costPressure,
    recommendations: result.recommendations
  };
}

// Pre-Deployment Check는 finding, checklist, suggestion 제목만 OpenAI 설명 근거로 넘깁니다.
function createPreDeploymentCheckSummaryPayload(result: AiPreDeploymentAnalysisResult): PreDeploymentCheckSummaryPayload {
  return {
    target: "pre_deployment_check",
    summary: result.summary,
    findings: result.findings.map((finding) => `${finding.severity} ${finding.category}: ${finding.title}`),
    checklist: result.checklist.map((item) => `${item.status}: ${item.label}`),
    suggestions: result.suggestions.map((suggestion) => `${suggestion.title}: ${suggestion.explanation}`)
  };
}

// Terraform 오류 설명은 원본 전체 대신 rule이 정리한 stage, 원인, 다음 행동만 전달합니다.
function createTerraformErrorExplanationSummaryPayload(
  input: Extract<LlmExplanationInput, { readonly target: "terraform_error_explanation" }>
): TerraformErrorExplanationSummaryPayload {
  const result = input.result;

  return {
    target: "terraform_error_explanation",
    stage: result.stage,
    category: result.category,
    severity: result.severity,
    rawMessage: result.rawMessage,
    summary: result.summary,
    likelyCause: result.likelyCause,
    nextActions: result.nextActions,
    diagnosticExplanation: result.diagnosticExplanation ?? null,
    relatedResourceId: result.relatedResourceId ?? null,
    terraformCodeContext: input.terraformCodeContext?.trim() ? input.terraformCodeContext : null
  };
}

function createTerraformPreviewExplanationSummaryPayload(
  result: AiTerraformPreviewExplanationResult
): TerraformPreviewExplanationSummaryPayload {
  return {
    target: "terraform_preview_explanation",
    summary: result.summary,
    findings: result.findings.map((finding) => `${finding.severity} ${finding.category}: ${finding.title}`),
    checklist: result.checklist.map((item) => `${item.status}: ${item.label}`),
    wellArchitectedGuidance: result.wellArchitectedGuidance.map(
      (guidance) => `${guidance.title}: ${guidance.observation} / ${guidance.recommendation}`
    ),
    consensusRecommendation: result.consensusRecommendation
  };
}

function createArchitecturePatchPreviewSummaryPayload(
  result: ArchitecturePatchPreview
): ArchitecturePatchPreviewSummaryPayload {
  return {
    target: "architecture_patch_preview",
    requestedAction: result.intent.requestedAction,
    resourceType: result.intent.resourceType ?? null,
    targetResourceId: result.intent.targetResourceId ?? null,
    changes: result.changes.map((change) => `${change.action}: ${change.summary}`),
    requiresUserAcceptance: true
  };
}
