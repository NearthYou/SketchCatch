import type {
  ArchitectureGuardrailWarning,
  ArchitectureScenario,
  ArchitectureScenarioScore,
  CreateArchitectureDraftRequest
} from "@sketchcatch/types";

export type ScenarioResolution = {
  readonly selectedScenario: ArchitectureScenario;
  readonly scenarioScores: ArchitectureScenarioScore[];
  readonly guardrailWarnings: ArchitectureGuardrailWarning[];
};

type ScenarioKeywordRule = {
  readonly scenario: ArchitectureScenario;
  readonly keywords: readonly string[];
  readonly reason: string;
};

const SCENARIO_KEYWORD_RULES: readonly ScenarioKeywordRule[] = [
  {
    scenario: "backend_with_db",
    keywords: ["db", "database", "데이터베이스", "rds", "postgres", "mysql", "백엔드"],
    reason: "DB가 필요한 백엔드 단서"
  },
  {
    scenario: "api_server",
    keywords: ["api", "서버", "server", "ec2", "express", "spring"],
    reason: "API 서버 단서"
  },
  {
    scenario: "static_site",
    keywords: ["정적", "static", "웹사이트", "프론트", "frontend", "react", "next"],
    reason: "정적 웹사이트 단서"
  }
];

const SCENARIO_PRIORITY: readonly ArchitectureScenario[] = ["backend_with_db", "api_server", "static_site"];

const UNSUPPORTED_REQUIREMENT_KEYWORDS = [
  "멀티 리전",
  "multi region",
  "multi-region",
  "eks",
  "kubernetes",
  "쿠버네티스",
  "금융권",
  "의료",
  "대규모",
  "ci/cd",
  "cicd",
  "실제 비용",
  "비용 정확",
  "실제 보안",
  "보안 적합",
  "회사 내부 시스템"
] as const;

export function resolveScenario(request: CreateArchitectureDraftRequest): ScenarioResolution {
  const scenarioScores = scorePromptScenarios(request.prompt);
  const unsupportedWarnings = createUnsupportedRequirementWarnings(request.prompt, scenarioScores);

  if (request.scenarioHint !== "auto") {
    const promptScenario = selectScenarioFromScores(scenarioScores);
    const conflictWarnings = createScenarioConflictWarnings(request.scenarioHint, promptScenario, scenarioScores);

    return {
      selectedScenario: request.scenarioHint,
      scenarioScores,
      guardrailWarnings: [...unsupportedWarnings, ...conflictWarnings]
    };
  }

  return {
    selectedScenario: selectScenarioFromScores(scenarioScores),
    scenarioScores,
    guardrailWarnings: unsupportedWarnings
  };
}

// LLM이 마음대로 추론하지 않게, MVP에서는 정해진 단어 점수로만 용도를 고릅니다.
function scorePromptScenarios(prompt: string): ArchitectureScenarioScore[] {
  const normalizedPrompt = prompt.toLowerCase();

  return SCENARIO_KEYWORD_RULES.map((rule) => {
    const matchedKeywords = rule.keywords.filter((keyword) => normalizedPrompt.includes(keyword));

    return {
      scenario: rule.scenario,
      score: matchedKeywords.length,
      reasons: matchedKeywords.map((keyword) => `${rule.reason}: "${keyword}"`)
    };
  });
}

function selectScenarioFromScores(scenarioScores: readonly ArchitectureScenarioScore[]): ArchitectureScenario {
  const backendScore = findScenarioScore(scenarioScores, "backend_with_db");
  const apiScore = findScenarioScore(scenarioScores, "api_server");

  if (backendScore > 0 && apiScore > 0) {
    return "backend_with_db";
  }

  const highestScore = Math.max(...scenarioScores.map((scenarioScore) => scenarioScore.score));

  if (highestScore === 0) {
    return "static_site";
  }

  return SCENARIO_PRIORITY.find((scenario) => findScenarioScore(scenarioScores, scenario) === highestScore) ?? "static_site";
}

function findScenarioScore(
  scenarioScores: readonly ArchitectureScenarioScore[],
  scenario: ArchitectureScenario
): number {
  return scenarioScores.find((scenarioScore) => scenarioScore.scenario === scenario)?.score ?? 0;
}

function hasPromptScenarioSignal(scenarioScores: readonly ArchitectureScenarioScore[]): boolean {
  return scenarioScores.some((scenarioScore) => scenarioScore.score > 0);
}

function createScenarioConflictWarnings(
  selectedScenario: ArchitectureScenario,
  promptScenario: ArchitectureScenario,
  scenarioScores: readonly ArchitectureScenarioScore[]
): ArchitectureGuardrailWarning[] {
  // 사용자가 버튼으로 고른 값은 자연어보다 강한 입력입니다.
  if (!hasPromptScenarioSignal(scenarioScores) || promptScenario === selectedScenario) {
    return [];
  }

  return [
    {
      code: "scenario_conflict",
      message: "입력 문장과 선택한 용도가 다릅니다. 선택한 용도를 우선해서 초안을 만들었습니다."
    }
  ];
}

function createUnsupportedRequirementWarnings(
  prompt: string,
  scenarioScores: readonly ArchitectureScenarioScore[]
): ArchitectureGuardrailWarning[] {
  const normalizedPrompt = prompt.toLowerCase();
  const hasUnsupportedKeyword = UNSUPPORTED_REQUIREMENT_KEYWORDS.some((keyword) => normalizedPrompt.includes(keyword));

  // 데모 흐름은 끊지 않되, 지원하지 않는 요구사항을 지원한다고 말하지 않기 위한 warning입니다.
  if (!hasUnsupportedKeyword && hasPromptScenarioSignal(scenarioScores)) {
    return [];
  }

  return [
    {
      code: "unsupported_requirement",
      message:
        "입력에 MVP 자동 초안 범위를 벗어난 요구사항이 있습니다. 이번 초안은 기본 Practice Architecture로 시작하며, 자세한 부분은 보드에서 직접 수정해야 합니다."
    }
  ];
}
