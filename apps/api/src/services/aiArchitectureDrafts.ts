import type {
  AiArchitectureDraftResult,
  AiBillingMode,
  AiProviderMetadata,
  ArchitectureDraftClarification,
  ArchitectureJson,
  CreateArchitectureDraftRequest,
  CreateArchitectureDraftResponse,
  LlmExplanation,
  LlmExplanationFallbackReason,
  ResourceType
} from "@sketchcatch/types";
import { applyGuardrailMetadata } from "./aiArchitectureDraftMetadata.js";
import { planPracticeArchitecture } from "./aiArchitectureRequirementDraftBuilder.js";
import { applyOperatingConditionConfig } from "./aiArchitectureOperatingConditions.js";
import { resolveArchitectureResourceQuantities } from "./aiArchitectureResourceQuantities.js";
import { resolveArchitectureRequirement } from "./aiArchitectureRequirementResolution.js";
import { createArchitectureDraftFallbackExplanation } from "./aiLlmExplanationFallbacks.js";
import {
  createAmazonQBusinessTextProviderFromEnv,
  resolveAiProviderRegions,
  type AiCreditPolicy,
  type AiTextProvider
} from "./aiLlmExplanation.js";
import {
  createNormalizedAiCacheKey,
  estimateAiUsage,
  maskSecretsForAi
} from "./aiProviderSafety.js";

const ARCHITECTURE_DRAFT_TARGET = "architecture_draft";

const SUPPORTED_RESOURCE_TYPES = [
  "VPC",
  "SUBNET",
  "INTERNET_GATEWAY",
  "ROUTE_TABLE",
  "ROUTE_TABLE_ASSOCIATION",
  "EC2",
  "RDS",
  "S3",
  "SECURITY_GROUP",
  "CLOUDFRONT",
  "ROUTE53_RECORD",
  "WAF_WEB_ACL",
  "LOAD_BALANCER",
  "LOAD_BALANCER_LISTENER",
  "LAMBDA",
  "AMI",
  "IAM_ROLE",
  "IAM_POLICY",
  "IAM_INSTANCE_PROFILE",
  "KMS_KEY",
  "DB_SUBNET_GROUP",
  "SECRETS_MANAGER_SECRET",
  "VPC_ENDPOINT",
  "CLOUDWATCH_LOG_GROUP",
  "CLOUDWATCH_METRIC_ALARM",
  "API_GATEWAY_REST_API",
  "LAMBDA_PERMISSION",
  "UNKNOWN"
] satisfies ResourceType[];

const SUPPORTED_RESOURCE_TYPE_SET = new Set<ResourceType>(SUPPORTED_RESOURCE_TYPES);

type RequiredArchitectureQuestion = {
  readonly id: string;
  readonly question: string;
  readonly suggestions: string[];
  readonly isAnswered: (prompt: string) => boolean;
};

type AmazonQArchitectureDraftPreview = {
  readonly status: "preview";
  readonly title: string;
  readonly architectureJson: ArchitectureJson;
  readonly assumptions?: readonly string[] | undefined;
  readonly explanations?: readonly string[] | undefined;
  readonly summary?: string | undefined;
  readonly highlights?: readonly string[] | undefined;
  readonly nextActions?: readonly string[] | undefined;
};

type AmazonQArchitectureDraftClarification = {
  readonly status: "needs_clarification";
  readonly question: string;
  readonly suggestions?: readonly string[] | undefined;
};

type AmazonQArchitectureDraftResponse =
  | AmazonQArchitectureDraftPreview
  | AmazonQArchitectureDraftClarification;

export type CreateArchitectureDraftResponseFactory = (
  request: CreateArchitectureDraftRequest
) => Promise<CreateArchitectureDraftResponse> | CreateArchitectureDraftResponse;

export type CreateAmazonQArchitectureDraftResponseOptions = {
  readonly provider?: AiTextProvider | undefined;
  readonly creditPolicy?: AiCreditPolicy | undefined;
};

// 자연어 요청을 보드가 열 수 있는 ArchitectureJson 초안으로 바꾸는 1차 진입점입니다.
export function createArchitectureDraft(input: string | CreateArchitectureDraftRequest): AiArchitectureDraftResult {
  const request = normalizeArchitectureDraftRequest(input);
  const resolution = resolveArchitectureRequirement(request);
  const resourceQuantities = resolveArchitectureResourceQuantities(request.prompt);
  const draft = planPracticeArchitecture(resolution, resourceQuantities);
  const configuredDraft = applyOperatingConditionConfig(draft, resolution.operatingProfile);

  return applyGuardrailMetadata(configuredDraft, request, resolution);
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

export function createConfiguredAmazonQArchitectureDraftResponse(): CreateArchitectureDraftResponseFactory {
  const regions = resolveAiProviderRegions(process.env);
  const provider =
    process.env.NODE_ENV === "test"
      ? undefined
      : createAmazonQBusinessTextProviderFromEnv({
          region: regions.amazonQRegion
        });

  return (request) =>
    createAmazonQArchitectureDraftResponse(request, {
      provider,
      creditPolicy: readAiCreditPolicyFromEnv()
    });
}

export async function createAmazonQArchitectureDraftResponse(
  input: string | CreateArchitectureDraftRequest,
  options: CreateAmazonQArchitectureDraftResponseOptions = {}
): Promise<CreateArchitectureDraftResponse> {
  const request = normalizeArchitectureDraftRequest(input);
  const creditPolicy = options.creditPolicy ?? readAiCreditPolicyFromEnv();
  const provider = options.provider;

  if (creditPolicy.billingMode !== "aws_credit_only" || !creditPolicy.amazonQ) {
    return createFallbackArchitectureDraftResponse(request, "credit_not_confirmed", creditPolicy.billingMode);
  }

  if (provider === undefined) {
    return createFallbackArchitectureDraftResponse(request, "provider_not_configured", creditPolicy.billingMode);
  }

  const missingQuestion = findMissingRequiredQuestion(request.prompt);

  if (missingQuestion !== null) {
    return createArchitectureDraftClarification(missingQuestion, request, provider, creditPolicy.billingMode);
  }

  const payload = maskSecretsForAi({
    prompt: request.prompt,
    supportedResourceTypes: SUPPORTED_RESOURCE_TYPES
  });

  try {
    const response = await provider.generate({
      target: ARCHITECTURE_DRAFT_TARGET,
      instructions: createAmazonQArchitectureDraftInstructions(),
      prompt: createAmazonQArchitectureDraftPrompt(request.prompt),
      payload
    });
    const parsedResponse = parseAmazonQArchitectureDraftResponse(response.text);
    const providerMetadata = createAiProviderMetadata({
      provider,
      billingMode: creditPolicy.billingMode,
      payload,
      outputCharacters: response.outputCharacters ?? response.text.length
    });

    if (parsedResponse.status === "needs_clarification") {
      return {
        status: "needs_clarification",
        question: parsedResponse.question,
        suggestions: [...(parsedResponse.suggestions ?? [])],
        providerMetadata
      };
    }

    return createAmazonQDraftResult(parsedResponse, providerMetadata);
  } catch {
    return createFallbackArchitectureDraftResponse(request, "provider_error", creditPolicy.billingMode);
  }
}

// 문자열 입력과 요청 객체를 자연어 prompt 전용 계약으로 맞춥니다.
function normalizeArchitectureDraftRequest(input: string | CreateArchitectureDraftRequest): CreateArchitectureDraftRequest {
  if (typeof input !== "string") {
    return input;
  }

  return {
    prompt: input
  };
}

function createAmazonQDraftResult(
  response: AmazonQArchitectureDraftPreview,
  providerMetadata: AiProviderMetadata
): AiArchitectureDraftResult {
  const highlights = [...(response.highlights ?? response.explanations ?? [])].slice(0, 5);
  const nextActions = [...(response.nextActions ?? [])].slice(0, 5);
  const llmExplanation: LlmExplanation = {
    target: ARCHITECTURE_DRAFT_TARGET,
    summary: response.summary ?? `${response.title} Architecture Draft를 생성했습니다.`,
    highlights,
    nextActions,
    fallbackUsed: false,
    providerMetadata
  };

  return {
    architectureJson: response.architectureJson,
    title: response.title,
    metadata: {
      source: "amazon_q",
      confidence: "medium",
      assumptions: [...(response.assumptions ?? [])],
      explanations: [...(response.explanations ?? [])]
    },
    llmExplanation
  };
}

function createFallbackArchitectureDraftResponse(
  request: CreateArchitectureDraftRequest,
  fallbackReason: LlmExplanationFallbackReason,
  billingMode: AiBillingMode
): AiArchitectureDraftResult {
  const draft = createArchitectureDraft(request);
  const llmExplanation = createArchitectureDraftFallbackExplanation(draft, fallbackReason);

  return {
    ...draft,
    llmExplanation: {
      ...llmExplanation,
      providerMetadata: createFallbackProviderMetadata(request, billingMode)
    }
  };
}

const REQUIRED_ARCHITECTURE_QUESTIONS: readonly RequiredArchitectureQuestion[] = [
  {
    id: "website_type",
    question: "어떤 종류의 웹사이트인가요?",
    suggestions: [
      "정적 사이트 (블로그, 포트폴리오, 회사 소개)",
      "동적 웹 애플리케이션 (쇼핑몰, SNS, 게시판)",
      "SPA (Single Page Application)"
    ],
    isAnswered: (prompt) =>
      /(정적|블로그|포트폴리오|회사\s*소개|dynamic|동적|쇼핑몰|sns|게시판|spa|single\s*page|react|vue|angular)/i.test(
        prompt
      )
  },
  {
    id: "traffic",
    question: "예상 트래픽 규모는?",
    suggestions: [
      "일일 방문자 수 (100명 미만 / 1,000명 / 10,000명 이상)",
      "동시 접속자 수 예상치"
    ],
    isAnswered: (prompt) => /(트래픽|방문자|동시\s*접속|daily|visitor|concurrent|100명|1,000|1000|10,000|10000)/i.test(prompt)
  },
  {
    id: "database",
    question: "데이터베이스가 필요한가요? 필요하다면 어떤 데이터를 저장하나요?",
    suggestions: [
      "필요 없음 (정적 콘텐츠만)",
      "필요함 → 어떤 데이터를 저장하나요?"
    ],
    isAnswered: (prompt) => /(데이터베이스|database|\bdb\b|rds|postgres|mysql|dynamodb|저장|필요\s*없음|필요\s*없다)/i.test(prompt)
  },
  {
    id: "frontend",
    question: "프론트엔드 기술은?",
    suggestions: [
      "HTML/CSS/JS만",
      "React/Vue/Angular 등 프레임워크",
      "서버사이드 렌더링 필요 여부"
    ],
    isAnswered: (prompt) => /(프론트|frontend|html|css|javascript|\bjs\b|react|vue|angular|next\.?js|ssr|서버사이드)/i.test(prompt)
  },
  {
    id: "backend",
    question: "백엔드가 필요한가요? 필요하다면 Node.js, Python, Java 같은 선호 언어가 있나요?",
    suggestions: [
      "필요 없음",
      "필요함 → Node.js/Python/Java 등 어떤 언어?"
    ],
    isAnswered: (prompt) => /(백엔드|backend|api|node|python|java|spring|서버|lambda|serverless)/i.test(prompt)
  },
  {
    id: "region",
    question: "주요 사용자 지역은 어디인가요?",
    suggestions: ["한국만", "아시아 전체", "글로벌"],
    isAnswered: (prompt) => /(한국|서울|아시아|글로벌|global|korea|asia|worldwide|전\s*세계)/i.test(prompt)
  },
  {
    id: "budget",
    question: "월 예산 범위는 어느 정도인가요?",
    suggestions: ["월 10만원 미만", "월 10-50만원", "월 50만원 이상"],
    isAnswered: (prompt) => /(예산|비용|월\s*\d|만원|budget|cost|krw|usd|10만|50만)/i.test(prompt)
  },
  {
    id: "ssl",
    question: "SSL 인증서 필요한가요? (HTTPS)",
    suggestions: ["필요", "필요 없음", "모르겠음"],
    isAnswered: (prompt) => /(ssl|https|인증서|도메인|domain)/i.test(prompt)
  },
  {
    id: "file_upload",
    question: "파일 업로드 기능이 있나요? (이미지, 문서 등)",
    suggestions: ["있음", "없음", "모르겠음"],
    isAnswered: (prompt) => /(파일|이미지|문서|사진|업로드|upload|image|document|file)/i.test(prompt)
  },
  {
    id: "realtime",
    question: "실시간 기능이 필요한가요? (채팅, 알림 등)",
    suggestions: ["필요", "필요 없음", "모르겠음"],
    isAnswered: (prompt) => /(실시간|채팅|알림|realtime|real-time|chat|notification|websocket)/i.test(prompt)
  },
  {
    id: "management_preference",
    question: "관리 복잡도 선호도는?",
    suggestions: [
      "완전 관리형 (서버리스)",
      "직접 서버 관리"
    ],
    isAnswered: (prompt) => /(관리형|서버리스|serverless|직접\s*서버|서버\s*관리|운영\s*관리|managed|비용\s*우선)/i.test(prompt)
  }
];

function findMissingRequiredQuestion(prompt: string): RequiredArchitectureQuestion | null {
  return REQUIRED_ARCHITECTURE_QUESTIONS.find((question) => !question.isAnswered(prompt)) ?? null;
}

function createArchitectureDraftClarification(
  question: RequiredArchitectureQuestion,
  request: CreateArchitectureDraftRequest,
  provider: AiTextProvider,
  billingMode: AiBillingMode
): ArchitectureDraftClarification {
  return {
    status: "needs_clarification",
    question: question.question,
    suggestions: question.suggestions,
    providerMetadata: createAiProviderMetadata({
      provider,
      billingMode,
      payload: {
        prompt: request.prompt,
        missingQuestionId: question.id
      }
    })
  };
}

function createAmazonQArchitectureDraftInstructions(): string {
  return [
    "You are Amazon Q assisting SketchCatch, an IaC operations service.",
    "Return JSON only. Do not wrap the response in markdown.",
    "Recommend a cost- and security-conscious Practice Architecture from the user's requirements.",
    "SketchCatch is provider-neutral, AWS-first for the MVP, and Terraform-first.",
    "Do not perform deployment, apply, update, delete, or destroy actions.",
    "All architecture changes must remain user-accepted previews.",
    `Use only these ResourceNode.type values: ${SUPPORTED_RESOURCE_TYPES.join(", ")}.`,
    "If required information is missing, return a needs_clarification response with exactly one question.",
    "Do not include secrets, account IDs, credentials, ARNs, or private tokens.",
    "The preview JSON shape is:",
    '{"status":"preview","title":"string","architectureJson":{"nodes":[{"id":"string","type":"S3","label":"string","positionX":0,"positionY":0,"config":{}}],"edges":[{"id":"string","sourceId":"string","targetId":"string","label":"string"}]},"assumptions":["string"],"explanations":["string"],"summary":"string","highlights":["string"],"nextActions":["string"]}',
    "The clarification JSON shape is:",
    '{"status":"needs_clarification","question":"string","suggestions":["string"]}'
  ].join("\n");
}

function createAmazonQArchitectureDraftPrompt(prompt: string): string {
  return [
    createAmazonQArchitectureDraftInstructions(),
    "User requirement prompt:",
    prompt
  ].join("\n\n");
}

function parseAmazonQArchitectureDraftResponse(text: string): AmazonQArchitectureDraftResponse {
  const parsed = JSON.parse(extractJsonObject(text)) as unknown;

  if (!isObject(parsed) || typeof parsed.status !== "string") {
    throw new Error("Amazon Q architecture draft response must include a status");
  }

  if (parsed.status === "needs_clarification") {
    if (typeof parsed.question !== "string" || parsed.question.trim().length === 0) {
      throw new Error("Amazon Q clarification response must include a question");
    }

    return {
      status: "needs_clarification",
      question: parsed.question.trim(),
      suggestions: readStringArray(parsed.suggestions)
    };
  }

  if (parsed.status !== "preview") {
    throw new Error("Amazon Q architecture draft response status is unsupported");
  }

  const architectureJson = parseArchitectureJson(parsed.architectureJson);
  assertEdgesReferenceExistingNodes(architectureJson);

  return {
    status: "preview",
    title: typeof parsed.title === "string" && parsed.title.trim().length > 0 ? parsed.title.trim() : "Amazon Q Architecture Draft",
    architectureJson,
    assumptions: readStringArray(parsed.assumptions),
    explanations: readStringArray(parsed.explanations),
    summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
    highlights: readStringArray(parsed.highlights),
    nextActions: readStringArray(parsed.nextActions)
  };
}

function parseArchitectureJson(value: unknown): ArchitectureJson {
  if (!isObject(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new Error("Amazon Q preview must include architectureJson nodes and edges");
  }

  return {
    nodes: value.nodes.map((node) => {
      if (!isObject(node) || typeof node.id !== "string" || !isSupportedResourceType(node.type)) {
        throw new Error("Amazon Q preview includes an unsupported node");
      }

      return {
        id: node.id,
        type: node.type,
        ...(typeof node.label === "string" && node.label.trim().length > 0 ? { label: node.label } : {}),
        positionX: typeof node.positionX === "number" ? node.positionX : 0,
        positionY: typeof node.positionY === "number" ? node.positionY : 0,
        config: isObject(node.config) ? node.config : {}
      };
    }),
    edges: value.edges.map((edge) => {
      if (
        !isObject(edge) ||
        typeof edge.id !== "string" ||
        typeof edge.sourceId !== "string" ||
        typeof edge.targetId !== "string"
      ) {
        throw new Error("Amazon Q preview includes an invalid edge");
      }

      return {
        id: edge.id,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        ...(typeof edge.label === "string" && edge.label.trim().length > 0 ? { label: edge.label } : {})
      };
    })
  };
}

function assertEdgesReferenceExistingNodes(architectureJson: ArchitectureJson): void {
  const nodeIds = new Set(architectureJson.nodes.map((node) => node.id));
  const hasInvalidEdge = architectureJson.edges.some(
    (edge) => !nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)
  );

  if (hasInvalidEdge) {
    throw new Error("Amazon Q preview includes an edge that references a missing node");
  }
}

function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Amazon Q did not return a JSON object");
  }

  return text.slice(start, end + 1);
}

function isSupportedResourceType(value: unknown): value is ResourceType {
  return typeof value === "string" && SUPPORTED_RESOURCE_TYPE_SET.has(value as ResourceType);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createAiProviderMetadata(input: {
  readonly provider: AiTextProvider;
  readonly billingMode: AiBillingMode;
  readonly payload: unknown;
  readonly outputCharacters?: number | undefined;
}): AiProviderMetadata {
  const payload = maskSecretsForAi(input.payload);

  return {
    provider: input.provider.provider,
    service: input.provider.service,
    model: input.provider.model,
    routeTarget: ARCHITECTURE_DRAFT_TARGET,
    cacheHit: false,
    cacheKey: createNormalizedAiCacheKey({
      provider: input.provider.provider,
      model: input.provider.model,
      routeTarget: ARCHITECTURE_DRAFT_TARGET,
      payload
    }),
    estimatedUsage: estimateAiUsage(payload, input.outputCharacters),
    billingMode: input.billingMode,
    generatedAt: new Date().toISOString()
  };
}

function createFallbackProviderMetadata(
  request: CreateArchitectureDraftRequest,
  billingMode: AiBillingMode
): AiProviderMetadata {
  const payload = maskSecretsForAi(request);

  return {
    provider: "fallback",
    service: "rule_fallback",
    routeTarget: ARCHITECTURE_DRAFT_TARGET,
    cacheHit: false,
    cacheKey: createNormalizedAiCacheKey({
      provider: "fallback",
      routeTarget: ARCHITECTURE_DRAFT_TARGET,
      payload
    }),
    estimatedUsage: estimateAiUsage(payload),
    billingMode,
    generatedAt: new Date().toISOString()
  };
}

function readAiCreditPolicyFromEnv(): AiCreditPolicy {
  return {
    bedrock: process.env.BEDROCK_CREDIT_CONFIRMED === "true",
    amazonQ: process.env.AMAZON_Q_CREDIT_CONFIRMED === "true",
    transcribe: process.env.TRANSCRIBE_CREDIT_CONFIRMED === "true",
    billingMode: readBillingMode()
  };
}

function readBillingMode(): AiBillingMode {
  switch (process.env.AI_BILLING_MODE) {
    case "aws_credit_only":
      return "aws_credit_only";
    case "standard":
      return "standard";
    case "disabled":
      return "disabled";
    default:
      return "disabled";
  }
}
