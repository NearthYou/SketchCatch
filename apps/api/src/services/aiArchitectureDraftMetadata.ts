import type {
  AiArchitectureDraftResult,
  ArchitectureDraftPattern,
  ArchitectureGuardrailWarning,
  CreateArchitectureDraftRequest
} from "@sketchcatch/types";
import type { ArchitectureRequirementResolution } from "./aiArchitectureRequirementResolution.js";


export function applyGuardrailMetadata(
  draft: AiArchitectureDraftResult,
  _request: CreateArchitectureDraftRequest,
  resolution: ArchitectureRequirementResolution
): AiArchitectureDraftResult {
  const guardrailWarnings = [
    ...resolution.guardrailWarnings,
    ...createOperatingConditionWarnings(resolution)
  ];

  return {
    ...draft,
    metadata: {
      ...draft.metadata,
      selectedDraftPattern: resolution.selectedDraftPattern,
      requirementFacts: resolution.requirementFacts,
      operatingProfile: resolution.operatingProfile,
      guardrailWarnings,
      assumptions: [...draft.metadata.assumptions, ...createGuardrailAssumptions(resolution)],
      explanations: [...draft.metadata.explanations, ...createGuardrailExplanations(resolution, guardrailWarnings)]
    }
  };
}

function createOperatingConditionWarnings(
  resolution: ArchitectureRequirementResolution
): ArchitectureGuardrailWarning[] {
  const warnings: ArchitectureGuardrailWarning[] = [];

  if (resolution.operatingProfile.budgetLevel === "low" && resolution.requirementFacts.includes("database")) {
    warnings.push({
      code: "low_budget_rds_cost",
      message: "낮은 예산을 선택했지만 RDS가 포함되어 비용이 발생할 수 있습니다. 배포 전에 비용 추정을 확인해야 합니다."
    });
  }

  if (resolution.operatingProfile.securityPriority === "high") {
    warnings.push({
      code: "guardrail_adjusted_config",
      message: "보안 우선 조건에 맞춰 지원 가능한 리소스 config만 안전한 기본값으로 조정했습니다."
    });
  }

  return warnings;
}

function createGuardrailAssumptions(resolution: ArchitectureRequirementResolution): string[] {
  const assumptions: string[] = [];

  if (resolution.operatingProfile.budgetLevel === "low") {
    assumptions.push("낮은 예산을 우선해 작은 Practice Resource 기준으로 초안을 만들었습니다.");
  }

  if (resolution.operatingProfile.trafficLevel === "small") {
    assumptions.push("작은 트래픽을 기준으로 단순한 구조부터 시작합니다.");
  }

  if (resolution.operatingProfile.securityPriority === "high") {
    assumptions.push("보안 우선순위가 높으므로 배포 전 Security Finding을 반드시 확인해야 합니다.");
  }

  return assumptions;
}

function createGuardrailExplanations(
  resolution: ArchitectureRequirementResolution,
  guardrailWarnings: readonly ArchitectureGuardrailWarning[]
): string[] {
  const explanations = [
    `대표 초안 패턴은 ${getDraftPatternLabel(resolution.selectedDraftPattern)}이지만, 실제 리소스는 자연어 단서 조합으로 생성했습니다.`
  ];

  if (resolution.operatingProfile.trafficLevel === "normal") {
    explanations.push("트래픽이 보통 이상이면 ALB나 Auto Scaling을 검토할 수 있지만, 이번 MVP 초안에는 자동 추가하지 않습니다.");
  }

  if (resolution.operatingProfile.securityPriority === "high") {
    explanations.push("보안 우선순위가 높아 공개 접근을 줄이는 기본 config만 반영했습니다. 실제 보안 적합성을 보장하지는 않습니다.");
  }

  return [...explanations, ...guardrailWarnings.map((warning) => warning.message)];
}

function getDraftPatternLabel(pattern: ArchitectureDraftPattern): string {
  switch (pattern) {
    case "static_site":
      return "정적 웹사이트";
    case "api_server":
      return "API 서버";
    case "backend_with_db":
      return "DB 포함 백엔드";
    case "server_storage":
      return "서버와 스토리지";
    case "serverless_function":
      return "Lambda 함수";
  }
}
