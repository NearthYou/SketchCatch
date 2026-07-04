import type {
  ArchitectureDraftPattern,
  ArchitectureDraftOperatingProfile,
  ArchitectureGuardrailWarning,
  ArchitectureRequirementFact,
  CreateArchitectureDraftRequest
} from "@sketchcatch/types";

export type ArchitectureRequirementResolution = {
  readonly selectedDraftPattern: ArchitectureDraftPattern;
  readonly requirementFacts: ArchitectureRequirementFact[];
  readonly operatingProfile: ArchitectureDraftOperatingProfile;
  readonly guardrailWarnings: ArchitectureGuardrailWarning[];
};

export class AmbiguousArchitecturePromptError extends Error {
  readonly statusCode = 400;

  constructor(
    message = "자연어 요구사항에서 명확한 아키텍처 단서를 찾지 못해 초안을 생성하지 않았습니다. 예: 소개용 랜딩 웹사이트가 필요해, 파일 업로드 페이지가 필요해, 로그인 있는 작은 웹서비스가 필요해"
  ) {
    super(
      message
    );
  }
}

type UnsupportedRequirementRule = {
  readonly label: string;
  readonly keywords: readonly string[];
  readonly substitution?: {
    readonly label: string;
    readonly facts?: readonly ArchitectureRequirementFact[];
  };
};

const GENERIC_WEBSITE_KEYWORDS = ["웹사이트", "홈페이지", "웹서비스", "사이트"] as const;

const CONCRETE_WEBSITE_KEYWORDS = [
  "static",
  "frontend",
  "react",
  "next",
  "next.js",
  "s3",
  "cloudfront",
  "cdn",
  "storage",
  "bucket",
  "정적",
  "프론트엔드",
  "리액트",
  "랜딩",
  "소개",
  "포트폴리오",
  "회사",
  "문의",
  "예약",
  "신청",
  "게시판",
  "마이페이지",
  "로그인",
  "회원",
  "계정",
  "사용자 정보",
  "파일",
  "이미지",
  "업로드",
  "서버",
  "백엔드",
  "api",
  "db",
  "database",
  "데이터베이스",
  "디비",
  "스토리지",
  "버킷"
] as const;

const GENERIC_WEBSITE_DERIVED_FACTS: ReadonlySet<ArchitectureRequirementFact> = new Set([
  "web_frontend",
  "static_delivery",
  "object_storage",
  "iam_permissions"
]);

type RequirementFactKeywordRule = {
  readonly fact: ArchitectureRequirementFact;
  readonly keywords: readonly string[];
};

const REQUIREMENT_FACT_KEYWORD_RULES: readonly RequirementFactKeywordRule[] = [
  {
    fact: "web_frontend",
    keywords: [
      "static",
      "frontend",
      "react",
      "next",
      "next.js",
      "정적",
      "웹사이트",
      "홈페이지",
      "사이트",
      "웹서비스",
      "웹 서비스",
      "프론트엔드",
      "리액트",
      "랜딩",
      "소개",
      "포트폴리오",
      "회사"
    ]
  },
  {
    fact: "static_delivery",
    keywords: ["cloudfront", "cdn", "정적", "랜딩", "전 세계", "전세계", "빠르게"]
  },
  {
    fact: "server_runtime",
    keywords: [
      "api",
      "server",
      "ec2",
      "express",
      "spring",
      "fastapi",
      "nestjs",
      "node",
      "서버",
      "백엔드",
      "애플리케이션",
      "앱",
      "처리",
      "문의",
      "예약",
      "신청",
      "접수",
      "관리",
      "alb",
      "load balancer",
      "로드밸런서"
    ]
  },
  {
    fact: "database",
    keywords: [
      "db",
      "database",
      "rds",
      "postgres",
      "postgresql",
      "mysql",
      "mariadb",
      "데이터베이스",
      "디비",
      "데베",
      "게시글",
      "회원 정보",
      "사용자 정보",
      "문의",
      "문의 내용",
      "예약",
      "예약 내역",
      "신청",
      "신청 내역",
      "접수",
      "상태",
      "주문",
      "결제 내역"
    ]
  },
  {
    fact: "object_storage",
    keywords: ["s3", "storage", "bucket", "object storage", "스토리지", "버킷", "파일", "이미지", "업로드"]
  },
  {
    fact: "file_upload",
    keywords: ["upload", "업로드", "올려야", "올리는", "파일", "이미지"]
  },
  {
    fact: "auth_or_user_data",
    keywords: [
      "로그인",
      "회원",
      "계정",
      "사용자 정보",
      "개인정보",
      "마이페이지",
      "사용자별",
      "예약",
      "예약 내역",
      "신청",
      "신청 내역"
    ]
  },
  {
    fact: "serverless_runtime",
    keywords: ["lambda", "serverless", "람다", "서버리스", "함수"]
  }
];

const UNSUPPORTED_REQUIREMENT_RULES: readonly UnsupportedRequirementRule[] = [
  {
    label: "EKS/Kubernetes",
    keywords: ["eks", "kubernetes", "쿠버네티스", "k8s"],
    substitution: {
      label: "단일 EC2 API 서버",
      facts: ["server_runtime", "network_boundary", "iam_permissions", "observability"]
    }
  },
  {
    label: "ECS/Fargate",
    keywords: ["ecs", "fargate"],
    substitution: {
      label: "단일 EC2 API 서버",
      facts: ["server_runtime", "network_boundary", "iam_permissions", "observability"]
    }
  },
  {
    label: "DynamoDB/NoSQL",
    keywords: ["dynamodb", "dynamo db", "nosql", "다이나모db", "다이나모디비"],
    substitution: {
      label: "RDS 데이터베이스",
      facts: ["server_runtime", "database", "network_boundary", "iam_permissions", "observability", "encryption"]
    }
  },
  {
    label: "ElastiCache/Redis",
    keywords: ["elasticache", "redis", "레디스"]
  },
  {
    label: "메시징/워크플로 서비스",
    keywords: ["sqs", "sns", "eventbridge", "step functions", "stepfunctions", "스텝펑션", "메시지 큐", "이벤트브리지"]
  },
  {
    label: "Auto Scaling",
    keywords: ["auto scaling", "autoscaling", "오토스케일링"],
    substitution: {
      label: "단일 EC2 서버",
      facts: ["server_runtime", "network_boundary", "iam_permissions", "observability"]
    }
  },
  {
    label: "멀티 리전",
    keywords: ["multi region", "multi-region", "멀티 리전", "다중 리전", "active-active"],
    substitution: {
      label: "단일 리전 초안"
    }
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

export function resolveArchitectureRequirement(
  request: CreateArchitectureDraftRequest
): ArchitectureRequirementResolution {
  const unsupportedRequirementMatches = findUnsupportedRequirementMatches(request.prompt);
  const requirementFacts = createRequirementFacts(request.prompt, unsupportedRequirementMatches);
  const hasPromptSignal = requirementFacts.length > 0;
  const unsupportedWarnings = createUnsupportedRequirementWarnings(unsupportedRequirementMatches);

  if (isGenericWebsitePromptWithoutConcreteArchitecture(request.prompt, requirementFacts)) {
    throw new AmbiguousArchitecturePromptError(
      "웹사이트라고만 하면 화면만 보여주는 사이트인지, 방문자가 파일을 올리는 서비스인지, 로그인이나 데이터 저장이 필요한 서비스인지 먼저 확인해야 합니다."
    );
  }

  if (hasPromptSignal) {
    return {
      selectedDraftPattern: selectDraftPattern(requirementFacts),
      requirementFacts,
      operatingProfile: createOperatingProfile(request.prompt, requirementFacts),
      guardrailWarnings: [
        ...unsupportedWarnings,
        ...createPartialGenerationWarnings(unsupportedWarnings, hasPromptSignal)
      ]
    };
  }

  throw new AmbiguousArchitecturePromptError();
}

function selectDraftPattern(requirementFacts: readonly ArchitectureRequirementFact[]): ArchitectureDraftPattern {
  const factSet = new Set(requirementFacts);

  if (factSet.has("serverless_runtime")) {
    return "serverless_function";
  }

  if (factSet.has("database")) {
    return "backend_with_db";
  }

  if (factSet.has("server_runtime") && factSet.has("object_storage")) {
    return "server_storage";
  }

  if (factSet.has("server_runtime")) {
    return "api_server";
  }

  if (factSet.has("web_frontend") || factSet.has("static_delivery")) {
    return "static_site";
  }

  return "api_server";
}

function isGenericWebsitePromptWithoutConcreteArchitecture(
  prompt: string,
  requirementFacts: readonly ArchitectureRequirementFact[]
): boolean {
  const normalizedPrompt = normalizePrompt(prompt);
  const factSet = new Set(requirementFacts);
  const hasGenericWebsiteKeyword = GENERIC_WEBSITE_KEYWORDS.some((keyword) =>
    normalizedPrompt.includes(keyword)
  );
  const hasConcreteWebsiteKeyword = CONCRETE_WEBSITE_KEYWORDS.some((keyword) =>
    normalizedPrompt.includes(keyword.toLowerCase())
  );

  return (
    hasGenericWebsiteKeyword &&
    factSet.has("web_frontend") &&
    Array.from(factSet).every((fact) => GENERIC_WEBSITE_DERIVED_FACTS.has(fact)) &&
    !hasConcreteWebsiteKeyword
  );
}

function createRequirementFacts(
  prompt: string,
  unsupportedRequirementMatches: readonly UnsupportedRequirementRule[]
): ArchitectureRequirementFact[] {
  const normalizedPrompt = normalizePrompt(prompt);
  const facts = new Set<ArchitectureRequirementFact>();

  for (const rule of REQUIREMENT_FACT_KEYWORD_RULES) {
    if (rule.keywords.some((keyword) => normalizedPrompt.includes(keyword.toLowerCase()))) {
      facts.add(rule.fact);
    }
  }

  for (const rule of unsupportedRequirementMatches) {
    for (const fact of rule.substitution?.facts ?? []) {
      facts.add(fact);
    }
  }

  addDerivedRequirementFacts(facts);

  if (prefersNoDatabase(normalizedPrompt)) {
    facts.delete("database");
    facts.delete("auth_or_user_data");
    facts.delete("encryption");
  }

  return sortRequirementFacts(facts);
}

function addDerivedRequirementFacts(facts: Set<ArchitectureRequirementFact>): void {
  if (facts.has("auth_or_user_data")) {
    facts.add("database");
    facts.add("server_runtime");
    facts.add("encryption");
  }

  if (facts.has("file_upload")) {
    facts.add("object_storage");
    facts.add("server_runtime");
  }

  if (facts.has("database")) {
    facts.add("server_runtime");
    facts.add("network_boundary");
    facts.add("encryption");
  }

  if (facts.has("server_runtime")) {
    facts.add("network_boundary");
    facts.add("iam_permissions");
    facts.add("observability");
  }

  if (facts.has("serverless_runtime")) {
    facts.add("iam_permissions");
    facts.add("observability");
  }

  if (facts.has("web_frontend")) {
    facts.add("static_delivery");
    facts.add("object_storage");
  }

  if (facts.has("object_storage")) {
    facts.add("iam_permissions");
  }
}

function sortRequirementFacts(facts: ReadonlySet<ArchitectureRequirementFact>): ArchitectureRequirementFact[] {
  const factOrder: readonly ArchitectureRequirementFact[] = [
    "web_frontend",
    "static_delivery",
    "server_runtime",
    "serverless_runtime",
    "database",
    "object_storage",
    "file_upload",
    "auth_or_user_data",
    "network_boundary",
    "iam_permissions",
    "observability",
    "encryption"
  ];

  return factOrder.filter((fact) => facts.has(fact));
}

function createOperatingProfile(
  prompt: string,
  requirementFacts: readonly ArchitectureRequirementFact[]
): ArchitectureDraftOperatingProfile {
  const normalizedPrompt = normalizePrompt(prompt);
  const factSet = new Set(requirementFacts);
  const lowBudgetKeywords = ["저렴", "낮은 예산", "비용 낮", "low budget", "연습용", "소수", "처음엔", "최소", "간단", "작게"];
  const growthKeywords = ["방문자 증가", "홍보", "공개 서비스", "트래픽", "growth", "여러 사람", "많은 사용자"];
  const highSecurityKeywords = ["보호", "보안", "개인정보", "로그인", "회원", "계정", "private", "암호화"];

  return {
    budgetLevel: lowBudgetKeywords.some((keyword) => normalizedPrompt.includes(keyword)) ? "low" : "normal",
    trafficLevel: growthKeywords.some((keyword) => normalizedPrompt.includes(keyword.toLowerCase()))
      ? "normal"
      : "small",
    securityPriority:
      factSet.has("auth_or_user_data") ||
      factSet.has("database") ||
      highSecurityKeywords.some((keyword) => normalizedPrompt.includes(keyword.toLowerCase()))
        ? "high"
        : "basic"
  };
}

function prefersNoDatabase(normalizedPrompt: string): boolean {
  return (
    normalizedPrompt.includes("db 없는") ||
    normalizedPrompt.includes("db 없이") ||
    normalizedPrompt.includes("db없이") ||
    normalizedPrompt.includes("db 빼") ||
    normalizedPrompt.includes("db 제외") ||
    normalizedPrompt.includes("database 없는") ||
    normalizedPrompt.includes("database 없이") ||
    normalizedPrompt.includes("데이터베이스 없는") ||
    normalizedPrompt.includes("데이터베이스 없이")
  );
}

function findUnsupportedRequirementMatches(prompt: string): UnsupportedRequirementRule[] {
  const normalizedPrompt = normalizePrompt(prompt);

  return UNSUPPORTED_REQUIREMENT_RULES.filter((rule) =>
    rule.keywords.some((keyword) => normalizedPrompt.includes(keyword.toLowerCase()))
  );
}

function createUnsupportedRequirementWarnings(
  unsupportedRequirementMatches: readonly UnsupportedRequirementRule[]
): ArchitectureGuardrailWarning[] {
  if (unsupportedRequirementMatches.length === 0) {
    return [];
  }

  const substitutedRequirements = unsupportedRequirementMatches.filter((rule) => rule.substitution !== undefined);
  const omittedRequirements = unsupportedRequirementMatches.filter((rule) => rule.substitution === undefined);
  const warnings: ArchitectureGuardrailWarning[] = [];

  if (substitutedRequirements.length > 0) {
    const requestedText = substitutedRequirements.map((rule) => rule.label).join(", ");
    const substitutionText = Array.from(
      new Set(substitutedRequirements.map((rule) => rule.substitution?.label).filter(isDefined))
    ).join(", ");

    warnings.push({
      code: "unsupported_requirement_substituted",
      message: `현재 자동 생성 범위 밖의 요구사항(${requestedText})은 지원 가능한 ${substitutionText}로 대체했습니다. 보드에는 지원되는 리소스만 생성됩니다.`
    });
  }

  if (omittedRequirements.length > 0) {
    const omittedText = omittedRequirements.map((rule) => rule.label).join(", ");

    warnings.push({
      code: "unsupported_resource_omitted",
      message: `현재 자동 생성 범위 밖의 요구사항(${omittedText})은 초안에서 제외했습니다. 지원되는 리소스만 보드에 그립니다.`
    });
  }

  return warnings;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
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
      message: "요구사항 중 지원 가능한 부분만 초안으로 생성했습니다. 대체되거나 제외된 항목은 보드 하단 경고를 확인해 주세요."
    }
  ];
}

function normalizePrompt(prompt: string): string {
  return prompt.normalize("NFKC").toLowerCase();
}
