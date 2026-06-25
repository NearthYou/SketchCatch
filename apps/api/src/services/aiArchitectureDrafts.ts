import type {
  AiArchitectureDraftResult,
  ArchitectureGuardrailWarning,
  ArchitectureJson,
  ArchitectureScenario,
  ArchitectureScenarioScore,
  CreateArchitectureDraftRequest
} from "@sketchcatch/types";

// 자연어 요청을 보드가 열 수 있는 ArchitectureJson 초안으로 바꾸는 1차 진입점입니다.
export function createArchitectureDraft(input: string | CreateArchitectureDraftRequest): AiArchitectureDraftResult {
  const request = normalizeArchitectureDraftRequest(input);
  const resolution = resolveScenario(request);
  const draft = createDraftByScenario(resolution.selectedScenario);

  return applyGuardrailMetadata(draft, request, resolution);
}

// GitHub 링크 요청도 결국 가벼운 텍스트 근거를 모아 자연어 초안 생성 흐름을 재사용합니다.
export function createArchitectureDraftFromRepositoryEvidence(
  repositoryUrl: string,
  evidence: readonly string[]
): AiArchitectureDraftResult {
  const evidenceText = evidence.join("\n").toLowerCase();
  const draft = createArchitectureDraft(evidenceText || repositoryUrl);

  return {
    ...draft,
    metadata: {
      ...draft.metadata,
      source: "github",
      assumptions: [
        ...draft.metadata.assumptions,
        "Source Repository의 README와 package metadata만 근거로 Architecture Draft를 추론했습니다."
      ]
    }
  };
}

function normalizeArchitectureDraftRequest(input: string | CreateArchitectureDraftRequest): CreateArchitectureDraftRequest {
  if (typeof input !== "string") {
    return input;
  }

  // GitHub 초안 생성처럼 문자열만 넘기는 기존 흐름도 같은 기본 선택값을 쓰게 맞춥니다.
  return {
    prompt: input,
    scenarioHint: "auto",
    budgetLevel: "normal",
    trafficLevel: "normal",
    securityPriority: "basic"
  };
}

type ScenarioResolution = {
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

function createDraftByScenario(scenario: ArchitectureScenario): AiArchitectureDraftResult {
  switch (scenario) {
    case "static_site":
      return createStaticWebsiteDraft();
    case "api_server":
      return createApiServerDraft();
    case "backend_with_db":
      return createDatabaseBackendDraft();
  }
}

function resolveScenario(request: CreateArchitectureDraftRequest): ScenarioResolution {
  const scenarioScores = scorePromptScenarios(request.prompt);
  const guardrailWarnings = createUnsupportedRequirementWarnings(request.prompt, scenarioScores);

  if (request.scenarioHint !== "auto") {
    const promptScenario = selectScenarioFromScores(scenarioScores);

    // 사용자가 버튼으로 고른 값은 자연어보다 강한 입력입니다.
    if (hasPromptScenarioSignal(scenarioScores) && promptScenario !== request.scenarioHint) {
      guardrailWarnings.push({
        code: "scenario_conflict",
        message: "입력 문장과 선택한 용도가 다릅니다. 선택한 용도를 우선해서 초안을 만들었습니다."
      });
    }

    return {
      selectedScenario: request.scenarioHint,
      scenarioScores,
      guardrailWarnings
    };
  }

  return {
    selectedScenario: selectScenarioFromScores(scenarioScores),
    scenarioScores,
    guardrailWarnings
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

function createUnsupportedRequirementWarnings(
  prompt: string,
  scenarioScores: readonly ArchitectureScenarioScore[]
): ArchitectureGuardrailWarning[] {
  const normalizedPrompt = prompt.toLowerCase();
  const hasUnsupportedKeyword = UNSUPPORTED_REQUIREMENT_KEYWORDS.some((keyword) => normalizedPrompt.includes(keyword));

  // 데모 흐름은 끊지 않되, 지원하지 않는 요구사항을 지원한다고 말하지 않기 위한 warning입니다.
  if (hasUnsupportedKeyword || !hasPromptScenarioSignal(scenarioScores)) {
    return [
      {
        code: "unsupported_requirement",
        message:
          "입력에 MVP 자동 초안 범위를 벗어난 요구사항이 있습니다. 이번 초안은 기본 Practice Architecture로 시작하며, 자세한 부분은 보드에서 직접 수정해야 합니다."
      }
    ];
  }

  return [];
}

function applyGuardrailMetadata(
  draft: AiArchitectureDraftResult,
  request: CreateArchitectureDraftRequest,
  resolution: ScenarioResolution
): AiArchitectureDraftResult {
  return {
    ...draft,
    metadata: {
      ...draft.metadata,
      selectedScenario: resolution.selectedScenario,
      scenarioScores: resolution.scenarioScores,
      guardrailWarnings: resolution.guardrailWarnings,
      assumptions: [...draft.metadata.assumptions, ...createGuardrailAssumptions(request)],
      explanations: [...draft.metadata.explanations, ...createGuardrailExplanations(resolution)]
    }
  };
}

function createGuardrailAssumptions(request: CreateArchitectureDraftRequest): string[] {
  const assumptions: string[] = [];

  // 지금 운영 조건은 설명 문장으로만 남깁니다. 실제 리소스 개수/연결 변경은 다음 작업 범위입니다.
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

function createGuardrailExplanations(resolution: ScenarioResolution): string[] {
  return [
    `최종 선택된 용도는 ${getScenarioLabel(resolution.selectedScenario)}입니다.`,
    ...resolution.guardrailWarnings.map((warning) => warning.message)
  ];
}

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

// 애매한 요청은 정적 웹사이트 기본 구조로 떨어지게 만든 fallback 초안입니다.
function createStaticWebsiteDraft(): AiArchitectureDraftResult {
  const architectureJson: ArchitectureJson = {
    nodes: [
      {
        id: "s3-site",
        type: "S3",
        label: "Static Website Bucket",
        positionX: 160,
        positionY: 220,
        config: {
          bucketPurpose: "static_website_origin"
        }
      },
      {
        id: "cloudfront-site",
        type: "CLOUDFRONT",
        label: "CloudFront CDN",
        positionX: 420,
        positionY: 220,
        config: {
          originResourceId: "s3-site"
        }
      }
    ],
    edges: [
      {
        id: "cloudfront-to-s3",
        sourceId: "cloudfront-site",
        targetId: "s3-site",
        label: "origin"
      }
    ]
  };

  return {
    title: "정적 웹사이트 Practice Architecture",
    architectureJson,
    metadata: {
      source: "template_fallback",
      confidence: "medium",
      assumptions: ["정적 파일은 S3에 저장하고 CloudFront가 CDN 역할을 한다고 가정합니다."],
      explanations: ["외부 LLM 없이도 고정 템플릿으로 Architecture Board가 열 수 있는 초안을 반환합니다."]
    }
  };
}

// API 서버 요청이 들어왔을 때 쓰는 고정 초안입니다. EC2 중심 구조를 만듭니다.
function createApiServerDraft(): AiArchitectureDraftResult {
  return {
    title: "API 서버 Practice Architecture",
    architectureJson: {
      nodes: [
        createVpcNode(),
        createSubnetNode("subnet-public", "Public Subnet", 280, 140),
        createSecurityGroupNode("sg-api", "API Security Group", 280, 300),
        {
          id: "ec2-api",
          type: "EC2",
          label: "API Server",
          positionX: 500,
          positionY: 220,
          config: {
            instanceType: "t3.micro",
            subnetId: "subnet-public",
            securityGroupIds: ["sg-api"]
          }
        }
      ],
      edges: [
        createEdge("vpc-to-subnet-public", "vpc-main", "subnet-public", "contains"),
        createEdge("subnet-public-to-ec2-api", "subnet-public", "ec2-api", "hosts"),
        createEdge("sg-api-to-ec2-api", "sg-api", "ec2-api", "allows traffic")
      ]
    },
    metadata: {
      source: "template_fallback",
      confidence: "medium",
      assumptions: ["단일 EC2가 API 요청을 처리하는 연습용 구조로 가정합니다."],
      explanations: ["VPC, Subnet, Security Group, EC2를 포함해 IaC Preview 생성기가 해석하기 쉬운 초안을 반환합니다."]
    }
  };
}

// DB 포함 백엔드 요청이 들어왔을 때 쓰는 고정 초안입니다. EC2와 RDS를 같이 둡니다.
function createDatabaseBackendDraft(): AiArchitectureDraftResult {
  return {
    title: "DB 포함 백엔드 Practice Architecture",
    architectureJson: {
      nodes: [
        createVpcNode(),
        createSubnetNode("subnet-app", "App Subnet", 280, 140),
        createSubnetNode("subnet-db", "DB Subnet", 280, 340),
        createSecurityGroupNode("sg-app", "App Security Group", 500, 140),
        createSecurityGroupNode("sg-db", "DB Security Group", 500, 340),
        {
          id: "ec2-backend",
          type: "EC2",
          label: "Backend Server",
          positionX: 720,
          positionY: 140,
          config: {
            instanceType: "t3.micro",
            subnetId: "subnet-app",
            securityGroupIds: ["sg-app"]
          }
        },
        {
          id: "rds-primary",
          type: "RDS",
          label: "Backend Database",
          positionX: 720,
          positionY: 340,
          config: {
            engine: "postgres",
            instanceClass: "db.t4g.micro",
            subnetId: "subnet-db",
            securityGroupIds: ["sg-db"]
          }
        }
      ],
      edges: [
        createEdge("vpc-to-subnet-app", "vpc-main", "subnet-app", "contains"),
        createEdge("vpc-to-subnet-db", "vpc-main", "subnet-db", "contains"),
        createEdge("subnet-app-to-ec2-backend", "subnet-app", "ec2-backend", "hosts"),
        createEdge("subnet-db-to-rds-primary", "subnet-db", "rds-primary", "hosts"),
        createEdge("backend-to-database", "ec2-backend", "rds-primary", "reads/writes")
      ]
    },
    metadata: {
      source: "template_fallback",
      confidence: "medium",
      assumptions: ["백엔드 서버가 RDS PostgreSQL에 연결하는 연습용 구조로 가정합니다."],
      explanations: ["App Resource와 DB Resource를 분리해 비용과 보안 Check Finding을 붙이기 쉬운 초안을 반환합니다."]
    }
  };
}

function createVpcNode(): ArchitectureJson["nodes"][number] {
  return {
    id: "vpc-main",
    type: "VPC",
    label: "Main VPC",
    positionX: 80,
    positionY: 220,
    config: {
      cidrBlock: "10.0.0.0/16"
    }
  };
}

function createSubnetNode(
  id: string,
  label: string,
  positionX: number,
  positionY: number
): ArchitectureJson["nodes"][number] {
  return {
    id,
    type: "SUBNET",
    label,
    positionX,
    positionY,
    config: {
      cidrBlock: "10.0.1.0/24",
      vpcId: "vpc-main"
    }
  };
}

function createSecurityGroupNode(
  id: string,
  label: string,
  positionX: number,
  positionY: number
): ArchitectureJson["nodes"][number] {
  return {
    id,
    type: "SECURITY_GROUP",
    label,
    positionX,
    positionY,
    config: {
      vpcId: "vpc-main"
    }
  };
}

function createEdge(
  id: string,
  sourceId: string,
  targetId: string,
  label: string
): ArchitectureJson["edges"][number] {
  return {
    id,
    sourceId,
    targetId,
    label
  };
}
