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

type PromptScenarioKeywordRule = {
  readonly scenario: ArchitectureScenario;
  readonly keywords: readonly string[];
  readonly reason: string;
};

type UnsupportedRequirementRule = {
  readonly label: string;
  readonly keywords: readonly string[];
};

const PROMPT_SCENARIO_KEYWORD_RULES: readonly PromptScenarioKeywordRule[] = [
  {
    scenario: "backend_with_db",
    keywords: ["db", "database", "rds", "postgres", "postgresql", "mysql", "mariadb", "데이터베이스", "디비"],
    reason: "데이터베이스가 필요한 요구사항"
  },
  {
    scenario: "server_storage",
    keywords: ["s3", "storage", "bucket", "object storage", "스토리지", "버킷", "파일", "이미지", "업로드"],
    reason: "서버와 스토리지를 함께 쓰는 요구사항"
  },
  {
    scenario: "api_server",
    keywords: ["api", "server", "ec2", "express", "spring", "fastapi", "nestjs", "서버", "백엔드", "애플리케이션"],
    reason: "API 서버 요구사항"
  },
  {
    scenario: "static_site",
    keywords: ["static", "frontend", "react", "next", "next.js", "cloudfront", "정적", "웹사이트", "프론트엔드", "리액트"],
    reason: "정적 웹사이트 요구사항"
  }
];

const PROMPT_SCENARIO_PRIORITY: readonly ArchitectureScenario[] = [
  "backend_with_db",
  "server_storage",
  "api_server",
  "static_site"
];

const UNSUPPORTED_REQUIREMENT_RULES: readonly UnsupportedRequirementRule[] = [
  {
    label: "EKS/Kubernetes",
    keywords: ["eks", "kubernetes", "쿠버네티스", "k8s"]
  },
  {
    label: "멀티 리전",
    keywords: ["multi region", "multi-region", "멀티 리전", "다중 리전", "active-active"]
  },
  {
    label: "CI/CD 자동 구성",
    keywords: ["ci/cd", "cicd", "github actions", "gitlab ci", "배포 파이프라인"]
  },
  {
    label: "실시간 비용/보안 보장",
    keywords: ["실시간 비용", "정확한 비용", "비용 예측 보장", "보안 적합성 보장", "컴플라이언스 보장"]
  },
  {
    label: "조직 내부 시스템 연동",
    keywords: ["사내 시스템", "내부 결재", "jira 연동", "slack 연동"]
  }
];

export function resolveScenario(request: CreateArchitectureDraftRequest): ScenarioResolution {
  const scenarioScores = scorePromptScenarios(request.prompt);
  const promptScenario = selectScenarioFromScores(scenarioScores);
  const hasPromptSignal = hasPromptScenarioSignal(scenarioScores);
  const unsupportedWarnings = createUnsupportedRequirementWarnings(request.prompt, hasPromptSignal);

  if (hasPromptSignal) {
    return {
      selectedScenario: promptScenario,
      scenarioScores,
      guardrailWarnings: [
        ...unsupportedWarnings,
        ...createPromptOverrideWarnings(request.scenarioHint, promptScenario),
        ...createPartialGenerationWarnings(unsupportedWarnings, hasPromptSignal)
      ]
    };
  }

  if (request.scenarioHint !== "auto") {
    return {
      selectedScenario: request.scenarioHint,
      scenarioScores,
      guardrailWarnings: unsupportedWarnings
    };
  }

  return {
    selectedScenario: "api_server",
    scenarioScores,
    guardrailWarnings: [
      ...unsupportedWarnings,
      {
        code: "ambiguous_prompt_fallback",
        message: "요구사항에서 명확한 아키텍처 단서를 찾지 못해 기본 API 서버 초안으로 시작합니다."
      }
    ]
  };
}

function scorePromptScenarios(prompt: string): ArchitectureScenarioScore[] {
  const normalizedPrompt = normalizePrompt(prompt);

  return PROMPT_SCENARIO_KEYWORD_RULES.map((rule) => {
    const matchedKeywords = rule.keywords.filter((keyword) => normalizedPrompt.includes(keyword.toLowerCase()));

    return {
      scenario: rule.scenario,
      score: matchedKeywords.length,
      reasons: matchedKeywords.map((keyword) => `${rule.reason}: "${keyword}"`)
    };
  });
}

function selectScenarioFromScores(scenarioScores: readonly ArchitectureScenarioScore[]): ArchitectureScenario {
  const backendScore = findPromptScenarioScore(scenarioScores, "backend_with_db");
  const apiScore = findPromptScenarioScore(scenarioScores, "api_server");
  const serverStorageScore = findPromptScenarioScore(scenarioScores, "server_storage");
  const staticSiteScore = findPromptScenarioScore(scenarioScores, "static_site");

  if (backendScore > 0 && apiScore > 0) {
    return "backend_with_db";
  }

  if (serverStorageScore > 0 && apiScore > 0) {
    return "server_storage";
  }

  if (staticSiteScore > 0 && serverStorageScore > 0 && staticSiteScore >= serverStorageScore) {
    return "static_site";
  }

  const highestScore = Math.max(...scenarioScores.map((scenarioScore) => scenarioScore.score));

  if (highestScore === 0) {
    return "api_server";
  }

  return (
    PROMPT_SCENARIO_PRIORITY.find((scenario) => findPromptScenarioScore(scenarioScores, scenario) === highestScore) ??
    "api_server"
  );
}

function findPromptScenarioScore(
  scenarioScores: readonly ArchitectureScenarioScore[],
  scenario: ArchitectureScenario
): number {
  return scenarioScores.find((scenarioScore) => scenarioScore.scenario === scenario)?.score ?? 0;
}

function hasPromptScenarioSignal(scenarioScores: readonly ArchitectureScenarioScore[]): boolean {
  return scenarioScores.some((scenarioScore) => scenarioScore.score > 0);
}

function createPromptOverrideWarnings(
  scenarioHint: CreateArchitectureDraftRequest["scenarioHint"],
  promptScenario: ArchitectureScenario
): ArchitectureGuardrailWarning[] {
  if (scenarioHint === "auto" || scenarioHint === promptScenario) {
    return [];
  }

  return [
    {
      code: "selection_overridden_by_prompt",
      message: "자연어 요구사항이 선택한 옵션보다 구체적이어서 프롬프트 기준으로 초안을 생성했습니다."
    }
  ];
}

function createUnsupportedRequirementWarnings(
  prompt: string,
  hasPromptSignal: boolean
): ArchitectureGuardrailWarning[] {
  const normalizedPrompt = normalizePrompt(prompt);
  const unsupportedLabels = UNSUPPORTED_REQUIREMENT_RULES
    .filter((rule) => rule.keywords.some((keyword) => normalizedPrompt.includes(keyword.toLowerCase())))
    .map((rule) => rule.label);

  if (unsupportedLabels.length === 0) {
    return [];
  }

  const omittedText = unsupportedLabels.join(", ");
  const warnings: ArchitectureGuardrailWarning[] = [
    {
      code: "unsupported_resource_omitted",
      message: `현재 자동 생성 범위 밖의 요구사항(${omittedText})은 초안에서 제외했습니다. 지원되는 리소스만 보드에 그립니다.`
    }
  ];

  if (!hasPromptSignal) {
    warnings.push({
      code: "unsupported_requirement",
      message: "지원 범위 밖의 요구사항만 감지되어 기본 API 서버 초안으로 시작합니다."
    });
  }

  return warnings;
}

function createPartialGenerationWarnings(
  unsupportedWarnings: readonly ArchitectureGuardrailWarning[],
  hasPromptSignal: boolean
): ArchitectureGuardrailWarning[] {
  if (!hasPromptSignal || unsupportedWarnings.length === 0) {
    return [];
  }

  return [
    {
      code: "partial_generation",
      message: "요구사항 중 지원 가능한 부분만 초안으로 생성했습니다. 제외된 항목은 보드 하단 경고를 확인해 주세요."
    }
  ];
}

function normalizePrompt(prompt: string): string {
  return prompt.normalize("NFKC").toLowerCase();
}
