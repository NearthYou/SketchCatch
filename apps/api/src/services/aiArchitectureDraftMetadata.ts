import type {
  AiArchitectureDraftResult,
  ArchitectureGuardrailWarning,
  ArchitectureScenario,
  CreateArchitectureDraftRequest
} from "@sketchcatch/types";
import type { ScenarioResolution } from "./aiArchitectureScenarioResolution.js";


export function applyGuardrailMetadata(
  draft: AiArchitectureDraftResult,
  request: CreateArchitectureDraftRequest,
  resolution: ScenarioResolution
): AiArchitectureDraftResult {
  const guardrailWarnings = [
    ...resolution.guardrailWarnings,
    ...createOperatingConditionWarnings(request, resolution.selectedScenario)
  ];

  return {
    ...draft,
    metadata: {
      ...draft.metadata,
      selectedScenario: resolution.selectedScenario,
      scenarioScores: resolution.scenarioScores,
      guardrailWarnings,
      assumptions: [...draft.metadata.assumptions, ...createGuardrailAssumptions(request)],
      explanations: [...draft.metadata.explanations, ...createGuardrailExplanations(request, resolution, guardrailWarnings)]
    }
  };
}

function createOperatingConditionWarnings(
  request: CreateArchitectureDraftRequest,
  selectedScenario: ArchitectureScenario
): ArchitectureGuardrailWarning[] {
  const warnings: ArchitectureGuardrailWarning[] = [];

  if (request.budgetLevel === "low" && selectedScenario === "backend_with_db") {
    warnings.push({
      code: "low_budget_rds_cost",
      message: "낮은 예산을 선택했지만 RDS가 포함되어 비용이 발생할 수 있습니다. 배포 전에 비용 추정을 확인해야 합니다."
    });
  }

  if (request.securityPriority === "high") {
    warnings.push({
      code: "guardrail_adjusted_config",
      message: "보안 우선 조건에 맞춰 지원 가능한 리소스 config만 안전한 기본값으로 조정했습니다."
    });
  }

  return warnings;
}

function createGuardrailAssumptions(request: CreateArchitectureDraftRequest): string[] {
  const assumptions: string[] = [];

  if (request.budgetLevel === "low") {
    assumptions.push("낮은 예산을 우선해 작은 Practice Resource 기준으로 초안을 만들었습니다.");
  }

  if (request.trafficLevel === "small") {
    assumptions.push("작은 트래픽을 기준으로 단순한 구조부터 시작합니다.");
  }

  if (request.securityPriority === "high") {
    assumptions.push("보안 우선순위가 높으므로 배포 전 Security Finding을 반드시 확인해야 합니다.");
  }

  return assumptions;
}

function createGuardrailExplanations(
  request: CreateArchitectureDraftRequest,
  resolution: ScenarioResolution,
  guardrailWarnings: readonly ArchitectureGuardrailWarning[]
): string[] {
  const explanations = [`최종 초안 유형은 ${getScenarioLabel(resolution.selectedScenario)}입니다.`];

  if (request.trafficLevel === "normal") {
    explanations.push("트래픽이 보통 이상이면 ALB나 Auto Scaling을 검토할 수 있지만, 이번 MVP 초안에는 자동 추가하지 않습니다.");
  }

  if (request.securityPriority === "high") {
    explanations.push("보안 우선순위가 높아 공개 접근을 줄이는 기본 config만 반영했습니다. 실제 보안 적합성을 보장하지는 않습니다.");
  }

  return [...explanations, ...guardrailWarnings.map((warning) => warning.message)];
}

function getScenarioLabel(scenario: ArchitectureScenario): string {
  switch (scenario) {
    case "static_site":
      return "정적 웹사이트";
    case "api_server":
      return "API 서버";
    case "backend_with_db":
      return "DB 포함 백엔드";
    case "server_storage":
      return "서버와 스토리지";
  }
}
