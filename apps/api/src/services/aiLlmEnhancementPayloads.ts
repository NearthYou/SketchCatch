import type { AiPreDeploymentAnalysisResult, DesignSimulationResult } from "@sketchcatch/types";
import type { LlmEnhancementInput } from "./aiLlmEnhancementTypes.js";

type DesignSimulationSummaryPayload = {
  readonly target: "design_simulation";
  readonly summary: string;
  readonly requestFlow: readonly string[];
  readonly bottlenecks: readonly string[];
  readonly failureScenarios: readonly string[];
  readonly costPressure: readonly string[];
  readonly recommendations: readonly string[];
};

type PreDeploymentCheckSummaryPayload = {
  readonly target: "pre_deployment_check";
  readonly summary: string;
  readonly findings: readonly string[];
  readonly checklist: readonly string[];
  readonly suggestions: readonly string[];
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
export function createSummaryPayload(input: LlmEnhancementInput): PreDeploymentCheckSummaryPayload | DesignSimulationSummaryPayload {
  switch (input.target) {
    case "design_simulation":
      return createDesignSimulationSummaryPayload(input.result);
    case "pre_deployment_check":
      return createPreDeploymentCheckSummaryPayload(input.result);
  }
}

// LLM 보강에 필요한 Resource 흐름과 위험 요약만 남겨 payload를 작게 유지합니다.
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
