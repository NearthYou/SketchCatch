import type {
  AiArchitectureDraftResult,
  ArchitectureGuardrailWarning,
  ArchitectureScenario,
  CreateArchitectureDraftRequest
} from "@sketchcatch/types";
import type { ScenarioResolution } from "./aiArchitectureScenarioResolution.js";

// 용도 결정 결과와 guardrail 경고를 최종 Architecture Draft metadata에 붙입니다.
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

// 운영 조건이 현재 MVP 초안과 충돌할 때 사용자에게 먼저 보여줄 경고를 만듭니다.
function createOperatingConditionWarnings(
  request: CreateArchitectureDraftRequest,
  selectedScenario: ArchitectureScenario
): ArchitectureGuardrailWarning[] {
  if (request.budgetLevel === "low" && selectedScenario === "backend_with_db") {
    return [
      {
        code: "low_budget_rds_cost",
        message: "낮은 예산을 선택했지만 RDS는 월 비용이 생길 수 있습니다. 배포 전 비용 점검을 꼭 확인해야 합니다."
      }
    ];
  }

  return [];
}

// 사용자가 고른 예산/트래픽/보안 조건을 초안의 가정 문장으로 남깁니다.
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

// 선택된 용도와 guardrail 경고를 사용자가 읽을 설명 문장으로 바꿉니다.
function createGuardrailExplanations(
  request: CreateArchitectureDraftRequest,
  resolution: ScenarioResolution,
  guardrailWarnings: readonly ArchitectureGuardrailWarning[]
): string[] {
  const explanations = [`최종 선택된 용도는 ${getScenarioLabel(resolution.selectedScenario)}입니다.`];

  if (request.trafficLevel === "normal") {
    explanations.push("트래픽이 보통이면 ALB나 Auto Scaling을 검토할 수 있지만, 이번 MVP에서는 자동 추가하지 않습니다.");
  }

  if (request.securityPriority === "high") {
    explanations.push("보안 우선순위가 높아 공개 접근을 줄이는 기본 config만 반영했습니다. 실제 보안 적합성은 보장하지 않습니다.");
  }

  return [...explanations, ...guardrailWarnings.map((warning) => warning.message)];
}

// 내부 scenario 값을 화면에 보여줄 한국어 용도 이름으로 바꿉니다.
function getScenarioLabel(scenario: ArchitectureScenario): string {
  switch (scenario) {
    case "static_site":
      return "정적 웹사이트";
    case "api_server":
      return "API 서버";
    case "backend_with_db":
      return "DB 포함 백엔드";
  }
}
