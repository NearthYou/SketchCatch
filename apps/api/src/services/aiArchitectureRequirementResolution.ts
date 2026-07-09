import type {
  ArchitectureCapability,
  ArchitectureDraftPattern,
  ArchitectureDraftOperatingProfile,
  ArchitectureGuardrailWarning,
  ArchitectureIntent,
  ArchitectureRequirementFact,
  ArchitectureServicePurpose,
  CreateArchitectureDraftRequest,
  ResourceType
} from "@sketchcatch/types";
import { resourceDefinitions } from "@sketchcatch/types/resource-definitions";

export type ArchitectureRequirementResolution = {
  readonly selectedDraftPattern: ArchitectureDraftPattern;
  readonly intent: ArchitectureIntent;
  readonly servicePurpose: ArchitectureServicePurpose;
  readonly capabilities: ArchitectureCapability[];
  readonly requirementFacts: ArchitectureRequirementFact[];
  readonly explicitResourceDefinitions: ExplicitResourceDefinition[];
  readonly explicitResourceTypes: ResourceType[];
  readonly operatingProfile: ArchitectureDraftOperatingProfile;
  readonly guardrailWarnings: ArchitectureGuardrailWarning[];
};

export type ExplicitResourceDefinition = {
  readonly id: string;
  readonly resourceType: ResourceType;
  readonly terraformBlockType: "resource" | "data";
  readonly terraformResourceType: string;
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

export function interpretRequirement(
  prompt: string,
  unsupportedRequirementMatches: readonly UnsupportedRequirementRule[] = findUnsupportedRequirementMatches(prompt)
): ArchitectureIntent {
  const requirementFacts = createRequirementFacts(prompt, unsupportedRequirementMatches);
  const servicePurpose = inferServicePurpose(prompt, requirementFacts);
  const capabilities = inferCapabilities(servicePurpose, requirementFacts);
  const operatingProfile = createOperatingProfile(prompt, requirementFacts);
  const normalizedPrompt = normalizePrompt(prompt);

  return {
    servicePurpose,
    capabilities,
    constraints: {
      budget: operatingProfile.budgetLevel,
      traffic: operatingProfile.trafficLevel === "normal" ? "growth" : "small",
      security: operatingProfile.securityPriority === "high" ? "sensitive" : "basic",
      computePreference: inferComputePreference(normalizedPrompt, requirementFacts)
    },
    confidence: calculateIntentConfidence({
      capabilities,
      hasUnsupportedRequirements: unsupportedRequirementMatches.length > 0,
      requirementFacts,
      servicePurpose
    }),
    missingQuestions: createMissingIntentQuestions(servicePurpose, requirementFacts)
  };
}

export function resolveArchitectureRequirement(
  request: CreateArchitectureDraftRequest
): ArchitectureRequirementResolution {
  const unsupportedRequirementMatches = findUnsupportedRequirementMatches(request.prompt);
  const intent = interpretRequirement(request.prompt, unsupportedRequirementMatches);
  const requirementFacts = createRequirementFacts(request.prompt, unsupportedRequirementMatches);
  const explicitResourceDefinitions = findExplicitResourceDefinitions(request.prompt);
  const explicitResourceTypes = getExplicitResourceTypes(explicitResourceDefinitions);
  const hasPromptSignal = requirementFacts.length > 0 || explicitResourceTypes.length > 0;
  const unsupportedWarnings = createUnsupportedRequirementWarnings(unsupportedRequirementMatches);
  const servicePurpose = intent.servicePurpose;
  const capabilities = intent.capabilities;

  if (isGenericWebsitePromptWithoutConcreteArchitecture(request.prompt, requirementFacts)) {
    throw new AmbiguousArchitecturePromptError(
      "웹사이트라고만 하면 화면만 보여주는 사이트인지, 방문자가 파일을 올리는 서비스인지, 로그인이나 데이터 저장이 필요한 서비스인지 먼저 확인해야 합니다."
    );
  }

  if (hasPromptSignal) {
    return {
      selectedDraftPattern: selectDraftPattern(requirementFacts),
      intent,
      servicePurpose,
      capabilities,
      explicitResourceDefinitions,
      requirementFacts,
      explicitResourceTypes,
      operatingProfile: createOperatingProfile(request.prompt, requirementFacts),
      guardrailWarnings: [
        ...unsupportedWarnings,
        ...createPartialGenerationWarnings(unsupportedWarnings, hasPromptSignal)
      ]
    };
  }

  if (isClearlyUnrelatedPrompt(request.prompt)) {
    throw new AmbiguousArchitecturePromptError(
      "SketchCatch는 IaC 아키텍처와 인프라 구성 요청만 다룹니다. 레시피처럼 관련 없는 요청은 초안을 생성하지 않았습니다."
    );
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
  const hasGenericWebsiteKeyword =
    includesAny(normalizedPrompt, GENERIC_WEBSITE_KEYWORDS) ||
    includesAny(normalizedPrompt, ["웹사이트", "웹서비스", "사이트"]);
  const hasConcreteWebsiteKeyword =
    includesAny(normalizedPrompt, CONCRETE_WEBSITE_KEYWORDS) ||
    includesAny(normalizedPrompt, [
      "api",
      "s3",
      "db",
      "로그인",
      "회원",
      "계정",
      "데이터베이스",
      "배포",
      "호스팅",
      "정적",
      "업로드",
      "파일"
    ]);

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

  addKoreanRequirementFacts(normalizedPrompt, facts);
  addPurposeRequirementFacts(normalizedPrompt, facts);

  for (const rule of unsupportedRequirementMatches) {
    for (const fact of rule.substitution?.facts ?? []) {
      facts.add(fact);
    }
  }

  if (prefersNoEc2Compute(normalizedPrompt) && (facts.has("server_runtime") || includesAny(normalizedPrompt, ["api", "서버"]))) {
    facts.add("serverless_runtime");
  }

  addDerivedRequirementFacts(facts);
  applyExplicitRequirementConstraints(normalizedPrompt, facts);

  if (prefersNoServerRuntime(normalizedPrompt)) {
    facts.delete("server_runtime");
    facts.delete("serverless_runtime");
    facts.delete("observability");

    if (!facts.has("database")) {
      facts.delete("network_boundary");
    }
  }

  if (prefersNoDatabase(normalizedPrompt)) {
    facts.delete("database");
    facts.delete("auth_or_user_data");
    facts.delete("encryption");

    if (!facts.has("server_runtime") && !facts.has("serverless_runtime")) {
      facts.delete("network_boundary");
    }
  }

  return sortRequirementFacts(facts);
}

function addKoreanRequirementFacts(
  normalizedPrompt: string,
  facts: Set<ArchitectureRequirementFact>
): void {
  if (includesAny(normalizedPrompt, ["웹사이트", "웹서비스", "사이트", "프론트엔드", "화면"])) {
    facts.add("web_frontend");
  }

  if (includesAny(normalizedPrompt, ["배포", "호스팅", "정적", "cdn"])) {
    facts.add("static_delivery");
  }

  if (includesAny(normalizedPrompt, ["api", "서버", "백엔드", "처리"])) {
    facts.add("server_runtime");
  }

  if (includesAny(normalizedPrompt, ["데이터베이스", "디비", "db", "rds"])) {
    facts.add("database");
  }

  if (includesAny(normalizedPrompt, ["s3", "스토리지", "버킷", "파일", "이미지", "업로드"])) {
    facts.add("object_storage");
  }

  if (includesAny(normalizedPrompt, ["업로드", "파일 올리", "파일을 받", "이미지 올리"])) {
    facts.add("file_upload");
  }

  if (includesAny(normalizedPrompt, ["로그인", "회원", "계정", "개인정보"])) {
    facts.add("auth_or_user_data");
  }

  if (includesAny(normalizedPrompt, ["lambda", "람다", "serverless", "서버리스"])) {
    facts.add("serverless_runtime");
  }
}

function addPurposeRequirementFacts(
  normalizedPrompt: string,
  facts: Set<ArchitectureRequirementFact>
): void {
  const promptPurpose = inferPromptServicePurpose(normalizedPrompt);

  if (promptPurpose === "landing_page") {
    facts.add("web_frontend");
    facts.add("static_delivery");
  }

  if (promptPurpose === "file_upload_service") {
    facts.add("web_frontend");
    facts.add("server_runtime");
    facts.add("object_storage");
    facts.add("file_upload");
  }

  if (promptPurpose === "auth_web_service") {
    facts.add("web_frontend");
    facts.add("server_runtime");
    facts.add("database");
    facts.add("auth_or_user_data");
  }

  if (promptPurpose === "reservation_service") {
    facts.add("web_frontend");
    facts.add("server_runtime");
    facts.add("database");
    facts.add("auth_or_user_data");
  }

  if (promptPurpose === "content_board") {
    facts.add("web_frontend");
    facts.add("server_runtime");
    facts.add("database");
  }
}

function inferServicePurpose(
  prompt: string,
  requirementFacts: readonly ArchitectureRequirementFact[]
): ArchitectureServicePurpose {
  const normalizedPrompt = normalizePrompt(prompt);
  const promptPurpose = inferPromptServicePurpose(normalizedPrompt);
  const factSet = new Set(requirementFacts);

  if (promptPurpose !== undefined) {
    return promptPurpose;
  }

  if (factSet.has("file_upload")) {
    return "file_upload_service";
  }

  if (factSet.has("database") && factSet.has("object_storage") && !factSet.has("server_runtime")) {
    return "data_storage";
  }

  if (factSet.has("server_runtime") || factSet.has("serverless_runtime")) {
    return "api_backend";
  }

  if (factSet.has("web_frontend") || factSet.has("static_delivery")) {
    return "landing_page";
  }

  return "unknown";
}

function inferPromptServicePurpose(normalizedPrompt: string): ArchitectureServicePurpose | undefined {
  if (includesAny(normalizedPrompt, ["예약", "신청", "접수", "상담", "booking", "reservation"])) {
    return "reservation_service";
  }

  if (
    includesAny(normalizedPrompt, ["게시판", "게시글", "댓글", "글쓰기"]) ||
    includesAnyEnglishToken(normalizedPrompt, ["post", "board", "forum", "community"])
  ) {
    return "content_board";
  }

  if (includesAny(normalizedPrompt, ["로그인", "회원", "계정", "마이페이지", "사용자 정보", "개인정보", "auth", "account"])) {
    return "auth_web_service";
  }

  if (includesAny(normalizedPrompt, ["업로드", "파일", "이미지", "upload", "file upload"])) {
    return "file_upload_service";
  }

  if (includesAny(normalizedPrompt, ["랜딩", "소개", "포트폴리오", "landing", "portfolio", "static site"])) {
    return "landing_page";
  }

  return undefined;
}

function inferCapabilities(
  servicePurpose: ArchitectureServicePurpose,
  requirementFacts: readonly ArchitectureRequirementFact[]
): ArchitectureCapability[] {
  const factSet = new Set(requirementFacts);
  const capabilities = new Set<ArchitectureCapability>();

  if (factSet.has("static_delivery")) {
    capabilities.add("static_delivery");
  }

  if (factSet.has("file_upload")) {
    capabilities.add("file_upload");
  }

  if (factSet.has("database")) {
    capabilities.add("relational_data");
  }

  if (factSet.has("object_storage")) {
    capabilities.add("media_storage");
  }

  if (factSet.has("server_runtime") || factSet.has("serverless_runtime")) {
    capabilities.add("public_api");
  }

  if (factSet.has("auth_or_user_data")) {
    capabilities.add("private_user_data");
  }

  if (servicePurpose === "auth_web_service") {
    capabilities.add("authentication");
    capabilities.add("private_user_data");
  }

  if (servicePurpose === "reservation_service") {
    capabilities.add("admin_workflow");
    capabilities.add("private_user_data");
    capabilities.add("relational_data");
  }

  if (servicePurpose === "content_board") {
    capabilities.add("public_api");
    capabilities.add("relational_data");
  }

  return sortCapabilities(capabilities);
}

function sortCapabilities(capabilities: ReadonlySet<ArchitectureCapability>): ArchitectureCapability[] {
  const capabilityOrder: readonly ArchitectureCapability[] = [
    "static_delivery",
    "file_upload",
    "authentication",
    "relational_data",
    "admin_workflow",
    "public_api",
    "private_user_data",
    "media_storage"
  ];

  return capabilityOrder.filter((capability) => capabilities.has(capability));
}

function inferComputePreference(
  normalizedPrompt: string,
  requirementFacts: readonly ArchitectureRequirementFact[]
): NonNullable<ArchitectureIntent["constraints"]["computePreference"]> {
  const factSet = new Set(requirementFacts);

  if (prefersNoEc2Compute(normalizedPrompt) || factSet.has("serverless_runtime")) {
    return "serverless";
  }

  if (includesAny(normalizedPrompt, ["ec2"]) || factSet.has("server_runtime")) {
    return "ec2";
  }

  return "unspecified";
}

function calculateIntentConfidence(input: {
  readonly capabilities: readonly ArchitectureCapability[];
  readonly hasUnsupportedRequirements: boolean;
  readonly requirementFacts: readonly ArchitectureRequirementFact[];
  readonly servicePurpose: ArchitectureServicePurpose;
}): number {
  let confidence = input.servicePurpose === "unknown" ? 0.25 : 0.65;

  if (input.requirementFacts.length >= 3) {
    confidence += 0.15;
  }

  if (input.capabilities.length >= 2) {
    confidence += 0.1;
  }

  if (input.hasUnsupportedRequirements) {
    confidence -= 0.15;
  }

  return Math.max(0, Math.min(1, Number(confidence.toFixed(2))));
}

function createMissingIntentQuestions(
  servicePurpose: ArchitectureServicePurpose,
  requirementFacts: readonly ArchitectureRequirementFact[]
): string[] {
  if (servicePurpose !== "unknown") {
    return [];
  }

  if (requirementFacts.length === 0) {
    return [
      "Is this a landing page, file upload service, login service, reservation workflow, content board, or API backend?"
    ];
  }

  return ["Which user workflow should this architecture support first?"];
}

function applyExplicitRequirementConstraints(
  normalizedPrompt: string,
  facts: Set<ArchitectureRequirementFact>
): void {
  if (prefersServerlessCompute(normalizedPrompt)) {
    facts.delete("server_runtime");

    if (!facts.has("database")) {
      facts.delete("network_boundary");
    }
  }

  if (prefersOnlyDataStorage(normalizedPrompt, facts)) {
    facts.delete("web_frontend");
    facts.delete("static_delivery");
    facts.delete("server_runtime");
    facts.delete("serverless_runtime");
    facts.delete("file_upload");
    facts.delete("auth_or_user_data");
    facts.delete("observability");
  }

  if (prefersOnlyServerAndObjectStorage(normalizedPrompt, facts)) {
    facts.delete("web_frontend");
    facts.delete("static_delivery");
    facts.delete("serverless_runtime");
    facts.delete("database");
    facts.delete("file_upload");
    facts.delete("auth_or_user_data");
    facts.delete("iam_permissions");
    facts.delete("observability");
    facts.delete("encryption");
  }
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

function includesAny(normalizedPrompt: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => normalizedPrompt.includes(keyword.toLowerCase()));
}

function includesAnyEnglishToken(normalizedPrompt: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => new RegExp(`\\b${escapeRegExp(keyword.toLowerCase())}\\b`, "u").test(normalizedPrompt));
}

function prefersNoEc2Compute(normalizedPrompt: string): boolean {
  return includesAny(normalizedPrompt, [
    "without ec2",
    "no ec2",
    "ec2 없는",
    "ec2 없이",
    "ec2 빼고",
    "ec2 제외",
    "ec2 말고"
  ]);
}

function prefersServerlessCompute(normalizedPrompt: string): boolean {
  return prefersNoEc2Compute(normalizedPrompt) || includesAny(normalizedPrompt, ["serverless", "서버리스", "lambda", "람다"]);
}

function prefersNoServerRuntime(normalizedPrompt: string): boolean {
  return (
    hasTermFollowedByNegation(normalizedPrompt, ["server", "backend", "서버", "백엔드", "애플리케이션"]) ||
    /\b(?:no|without)\s+(?:server|backend)\b/u.test(normalizedPrompt)
  );
}

function prefersOnlyDataStorage(
  normalizedPrompt: string,
  facts: ReadonlySet<ArchitectureRequirementFact>
): boolean {
  return (
    facts.has("database") &&
    facts.has("object_storage") &&
    hasOnlyScopeKeyword(normalizedPrompt) &&
    !includesAny(normalizedPrompt, ["서버", "api", "백엔드", "웹", "로그인", "회원", "계정", "업로드"])
  );
}

function prefersOnlyServerAndObjectStorage(
  normalizedPrompt: string,
  facts: ReadonlySet<ArchitectureRequirementFact>
): boolean {
  return (
    facts.has("server_runtime") &&
    facts.has("object_storage") &&
    hasOnlyScopeKeyword(normalizedPrompt) &&
    includesAny(normalizedPrompt, ["ec2", "서버", "인스턴스"]) &&
    includesAny(normalizedPrompt, ["s3", "버킷", "스토리지"]) &&
    !includesAny(normalizedPrompt, ["데이터베이스", "db", "rds", "로그인", "회원", "계정", "업로드"])
  );
}

function hasOnlyScopeKeyword(normalizedPrompt: string): boolean {
  return (
    /\b(?:only|just)\b/u.test(normalizedPrompt) ||
    /(?:^|\s)만(?:\s|$)/u.test(normalizedPrompt) ||
    normalizedPrompt.includes("만 있는") ||
    normalizedPrompt.includes("만있는")
  );
}

function prefersNoDatabase(normalizedPrompt: string): boolean {
  return (
    hasNegatedTerm(normalizedPrompt, ["db", "database", "rds", "데이터베이스", "디비", "데베"]) ||
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

function hasNegatedTerm(normalizedPrompt: string, terms: readonly string[]): boolean {
  const negationPattern =
    "필요\\s*없|필요없|필요하지\\s*않|안\\s*필요|불필요|없이|없는|빼|제외|말고|안\\s*써|안써|쓰지\\s*않|no|without|not\\s+needed|not\\s+need|does\\s+not\\s+need|don't\\s+need|dont\\s+need";

  return terms.some((term) => {
    const escapedTerm = escapeRegExp(term.toLowerCase());
    const nearbyNegation = new RegExp(
      `(?:${escapedTerm}.{0,24}(?:${negationPattern})|(?:${negationPattern}).{0,24}${escapedTerm})`,
      "u"
    );

    return nearbyNegation.test(normalizedPrompt);
  });
}

function hasTermFollowedByNegation(normalizedPrompt: string, terms: readonly string[]): boolean {
  const negationPattern =
    "필요\\s*없|필요없|필요하지\\s*않|안\\s*필요|불필요|없이|없는|빼|제외|말고|안\\s*써|안써|쓰지\\s*않|not\\s+needed|not\\s+need|does\\s+not\\s+need|don't\\s+need|dont\\s+need";

  return terms.some((term) => {
    const escapedTerm = escapeRegExp(term.toLowerCase());

    return new RegExp(`${escapedTerm}.{0,24}(?:${negationPattern})`, "u").test(normalizedPrompt);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isClearlyUnrelatedPrompt(prompt: string): boolean {
  const normalizedPrompt = normalizePrompt(prompt);

  return includesAny(normalizedPrompt, [
    "레시피",
    "요리",
    "찌개",
    "된장찌개",
    "김치찌개",
    "음식",
    "날씨",
    "운세"
  ]);
}

function findUnsupportedRequirementMatches(prompt: string): UnsupportedRequirementRule[] {
  const normalizedPrompt = normalizePrompt(prompt);
  const explicitResourceTypes = findExplicitResourceTypes(prompt);

  return UNSUPPORTED_REQUIREMENT_RULES.filter(
    (rule) =>
      rule.keywords.some((keyword) => normalizedPrompt.includes(keyword.toLowerCase())) &&
      !isCoveredBySupportedExplicitResource(rule, explicitResourceTypes)
  );
}

export function findExplicitResourceTypes(prompt: string): ResourceType[] {
  return getExplicitResourceTypes(findExplicitResourceDefinitions(prompt));
}

function findExplicitResourceDefinitions(prompt: string): ExplicitResourceDefinition[] {
  const normalizedPrompt = normalizePrompt(prompt);
  const definitions = new Map<string, ExplicitResourceDefinition>();

  for (const definition of resourceDefinitions) {
    if (definition.resourceType === "UNKNOWN") {
      continue;
    }

    if (
      createResourceAliases(definition).some(
        (alias) =>
          includesResourceAlias(normalizedPrompt, alias) &&
          !hasNegatedResourceAlias(normalizedPrompt, alias)
      )
    ) {
      definitions.set(definition.id, {
        id: definition.id,
        resourceType: definition.resourceType,
        terraformBlockType: definition.terraform.blockType,
        terraformResourceType: definition.terraform.resourceType
      });
    }
  }

  return Array.from(definitions.values());
}

function getExplicitResourceTypes(
  explicitResourceDefinitions: readonly ExplicitResourceDefinition[]
): ResourceType[] {
  return Array.from(new Set(explicitResourceDefinitions.map((definition) => definition.resourceType)));
}

function isCoveredBySupportedExplicitResource(
  rule: UnsupportedRequirementRule,
  explicitResourceTypes: readonly ResourceType[]
): boolean {
  const explicitResourceTypeSet = new Set(explicitResourceTypes);

  if (rule.label === "EKS/Kubernetes") {
    return explicitResourceTypeSet.has("EKS_CLUSTER");
  }

  if (rule.label === "ECS/Fargate") {
    return (
      explicitResourceTypeSet.has("ECS_CLUSTER") ||
      explicitResourceTypeSet.has("ECS_SERVICE") ||
      explicitResourceTypeSet.has("ECS_TASK_DEFINITION")
    );
  }

  if (rule.label === "DynamoDB/NoSQL") {
    return explicitResourceTypeSet.has("DYNAMODB_TABLE");
  }

  if (rule.label === "ElastiCache/Redis") {
    return explicitResourceTypeSet.has("ELASTICACHE_REDIS");
  }

  if (rule.label === "Auto Scaling") {
    return explicitResourceTypeSet.has("AUTO_SCALING_GROUP");
  }

  return [
    "SNS_TOPIC",
    "SQS_QUEUE",
    "EVENTBRIDGE_RULE",
    "EVENTBRIDGE_TARGET",
    "STEP_FUNCTIONS_STATE_MACHINE"
  ].some((resourceType) => explicitResourceTypeSet.has(resourceType as ResourceType));
}

function createResourceAliases(definition: (typeof resourceDefinitions)[number]): string[] {
  return [
    definition.resourceType,
    definition.resourceType.replaceAll("_", " "),
    definition.id.replace(/^aws-/, "").replaceAll("-", " "),
    definition.terraform.resourceType.replace(/^aws_/, "").replaceAll("_", " "),
    definition.terraform.resourceType,
    ...createResourceServiceAliases(definition)
  ].map((alias) => normalizePrompt(alias));
}

function createResourceServiceAliases(definition: (typeof resourceDefinitions)[number]): string[] {
  const aliases: string[] = [];
  const normalizedResourceType = definition.resourceType.toLowerCase();
  const normalizedId = definition.id.toLowerCase();
  const normalizedTerraformType = definition.terraform.resourceType.toLowerCase();

  for (const serviceAlias of SUPPORTED_RESOURCE_SERVICE_ALIASES) {
    if (
      normalizedResourceType.includes(serviceAlias.token) ||
      normalizedId.includes(serviceAlias.token) ||
      normalizedTerraformType.includes(serviceAlias.token)
    ) {
      aliases.push(serviceAlias.alias);
    }
  }

  if (normalizedId.includes("ecs") || normalizedTerraformType.includes("ecs")) {
    aliases.push("fargate");
  }

  return aliases;
}

const SUPPORTED_RESOURCE_SERVICE_ALIASES = [
  { token: "acm", alias: "acm" },
  { token: "api_gateway", alias: "api gateway" },
  { token: "apigateway", alias: "api gateway" },
  { token: "autoscaling", alias: "auto scaling" },
  { token: "cloudfront", alias: "cloudfront" },
  { token: "cloudtrail", alias: "cloudtrail" },
  { token: "cloudwatch", alias: "cloudwatch" },
  { token: "codebuild", alias: "codebuild" },
  { token: "codedeploy", alias: "codedeploy" },
  { token: "codepipeline", alias: "codepipeline" },
  { token: "codestar", alias: "codestar" },
  { token: "cognito", alias: "cognito" },
  { token: "config", alias: "aws config" },
  { token: "dynamodb", alias: "dynamodb" },
  { token: "ecr", alias: "ecr" },
  { token: "ecs", alias: "ecs" },
  { token: "efs", alias: "efs" },
  { token: "eks", alias: "eks" },
  { token: "elasticache", alias: "elasticache" },
  { token: "eventbridge", alias: "eventbridge" },
  { token: "guardduty", alias: "guardduty" },
  { token: "iam", alias: "iam" },
  { token: "kms", alias: "kms" },
  { token: "lambda", alias: "lambda" },
  { token: "rds", alias: "rds" },
  { token: "route53", alias: "route 53" },
  { token: "s3", alias: "s3" },
  { token: "scheduler", alias: "scheduler" },
  { token: "secretsmanager", alias: "secrets manager" },
  { token: "sfn", alias: "step functions" },
  { token: "shield", alias: "shield" },
  { token: "sns", alias: "sns" },
  { token: "sqs", alias: "sqs" },
  { token: "ssm", alias: "ssm" },
  { token: "vpc", alias: "vpc" },
  { token: "waf", alias: "waf" },
  { token: "xray", alias: "x-ray" }
] as const;

function includesResourceAlias(normalizedPrompt: string, alias: string): boolean {
  if (alias.length < 3) {
    return false;
  }

  if (/^[a-z0-9_ -]+$/u.test(alias)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(alias)}([^a-z0-9]|$)`, "u").test(normalizedPrompt);
  }

  return normalizedPrompt.includes(alias);
}

function hasNegatedResourceAlias(normalizedPrompt: string, alias: string): boolean {
  if (hasNegatedTerm(normalizedPrompt, [alias])) {
    return true;
  }

  const escapedAlias = escapeRegExp(alias);
  const nearbyNegationPattern =
    "(?:쓰지\\s*마|쓰지\\s*말|사용\\s*안|없이|없는|제외|빼고|말고|no|without|not\\s+using)";

  return new RegExp(
    `(?:${escapedAlias}.{0,24}${nearbyNegationPattern}|${nearbyNegationPattern}.{0,24}${escapedAlias})`,
    "iu"
  ).test(normalizedPrompt);
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

  return warnings.map((warning) => {
    if (warning.code === "unsupported_requirement_substituted") {
      return {
        ...warning,
        message: `현재 자동 생성 범위에서 직접 지원하지 않는 요구사항을 지원 가능한 구조로 바꾸었습니다. 변경 방식: ${substitutedRequirements.map(formatUnsupportedSubstitutionChange).join("; ")}. 보드에는 지원되는 리소스만 생성됩니다.`
      };
    }

    if (warning.code === "unsupported_resource_omitted") {
      return {
        ...warning,
        message: `현재 자동 생성 범위에서 직접 지원하지 않는 리소스는 초안에서 제외했습니다. 변경 방식: ${omittedRequirements.map(formatUnsupportedOmissionChange).join("; ")}. 지원되는 리소스만 보드에 그립니다.`
      };
    }

    return warning;
  });
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function formatUnsupportedSubstitutionChange(rule: UnsupportedRequirementRule): string {
  return `미지원 항목 ${rule.label} -> ${rule.substitution?.label ?? "지원 가능한 기본 구조"}로 대체`;
}

function formatUnsupportedOmissionChange(rule: UnsupportedRequirementRule): string {
  return `미지원 항목 ${rule.label} -> 현재 보드에서 제외`;
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
