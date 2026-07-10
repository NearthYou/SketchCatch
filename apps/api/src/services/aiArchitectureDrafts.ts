import type {
  ApiErrorCode,
  AiArchitectureDraftResult,
  AiBillingMode,
  AiProviderMetadata,
  ArchitectureDraftProgressStage,
  ArchitectureDraftClarification,
  ArchitectureJson,
  CreateArchitectureDraftRequest,
  CreateArchitectureDraftResponse,
  LlmExplanation,
  LlmExplanationFallbackReason,
  ResourceType
} from "@sketchcatch/types";
import type { RuntimeCache } from "../runtime-cache/index.js";
import { applyGuardrailMetadata } from "./aiArchitectureDraftMetadata.js";
import {
  createNormalizedArchitectureIntentPlan,
  createOpenAiRequirementNormalizerProviderFromEnv,
  parseArchitectureIntentPlan,
  type ArchitectureIntentPlan
} from "./aiArchitectureRequirementNormalizer.js";
import {
  createArchitectureResourceDeploymentConfig,
  SUPPORTED_ARCHITECTURE_RESOURCE_CATALOG,
  SUPPORTED_ARCHITECTURE_RESOURCE_TYPES
} from "./aiArchitectureResourceCatalog.js";
import { planPracticeArchitecture } from "./aiArchitectureRequirementDraftBuilder.js";
import { applyOperatingConditionConfig } from "./aiArchitectureOperatingConditions.js";
import { resolveArchitectureResourceQuantities } from "./aiArchitectureResourceQuantities.js";
import { resolveArchitectureRequirement } from "./aiArchitectureRequirementResolution.js";
import { createArchitectureDraftFallbackExplanation } from "./aiLlmExplanationFallbacks.js";
import {
  createAmazonQArchitectureDraftProviderFromEnv,
  warmAmazonQArchitectureDraftProvider
} from "./aiArchitectureQBusiness.js";
import {
  createAwsArchitectureReferenceKnowledgePayload,
  createAwsArchitectureReferenceKnowledgePrompt
} from "./awsArchitectureReferenceKnowledge.js";
import { resolveAiProviderRegions, type AiCreditPolicy, type AiTextProvider } from "./aiLlmExplanation.js";
import {
  createNormalizedAiCacheKey,
  estimateAiUsage,
  maskSecretsForAi
} from "./aiProviderSafety.js";

const ARCHITECTURE_DRAFT_TARGET = "architecture_draft";

export class ArchitectureDraftGenerationError extends Error {
  readonly statusCode = 503;
  readonly errorCode: ApiErrorCode = "service_unavailable";
  readonly exposeMessage = true;

  constructor(cause: unknown) {
    super("Amazon Q 아키텍처 생성에 실패했습니다. 잠시 후 다시 시도해주세요.", { cause });
    this.name = "ArchitectureDraftGenerationError";
  }
}

const SUPPORTED_RESOURCE_TYPES = SUPPORTED_ARCHITECTURE_RESOURCE_TYPES;
const SUPPORTED_RESOURCE_CATALOG = SUPPORTED_ARCHITECTURE_RESOURCE_CATALOG;

const SUPPORTED_RESOURCE_TYPE_SET = new Set<ResourceType>(SUPPORTED_RESOURCE_TYPES);
const DEFAULT_PREVIEW_NODE_SIZE = { width: 124, height: 96 } as const;
const PREVIEW_LABEL_CHARACTER_WIDTH = 7;
const PREVIEW_LABEL_HORIZONTAL_PADDING = 32;
const PREVIEW_LABEL_MAX_WIDTH = 260;
const PREVIEW_LABEL_HEIGHT = 28;
const PREVIEW_VISUAL_BOUNDS_HORIZONTAL_MARGIN = 20;
const PREVIEW_VISUAL_BOUNDS_VERTICAL_MARGIN = 8;
const PREVIEW_NODE_LAYOUT_SIZES: Partial<Record<ResourceType, LayoutSize>> = {
  VPC: { width: 240, height: 160 },
  SUBNET: { width: 180, height: 120 },
  SECURITY_GROUP: { width: 180, height: 120 }
};
const PREVIEW_AREA_RESOURCE_TYPES = new Set<ResourceType>(["VPC", "SUBNET", "SECURITY_GROUP"]);
const PREVIEW_BOUNDARY_RESOURCE_TYPES = new Set<ResourceType>(["INTERNET_GATEWAY"]);
const PREVIEW_PARENT_EDGE_LABELS = new Set(["contains", "hosts"]);
const TERRAFORM_REFERENCE_ATTRIBUTE_SUFFIXES = ["id", "arn", "name", "execution_arn"] as const;
const RESOURCE_TYPE_TERRAFORM_NAMES: Partial<Record<ResourceType, string>> = {
  VPC: "aws_vpc",
  SUBNET: "aws_subnet",
  SECURITY_GROUP: "aws_security_group"
};
const SECURITY_GROUP_REFERENCE_KEYS = ["securityGroupIds", "vpcSecurityGroupIds", "securityGroupId"] as const;
type RequiredArchitectureQuestion = {
  readonly id: string;
  readonly question: string;
  readonly suggestions: string[];
  readonly isAnswered: (prompt: string) => boolean;
};

type LayoutSize = {
  readonly width: number;
  readonly height: number;
};

type LayoutRect = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

type AmazonQArchitectureDraftPreview = {
  readonly status: "preview";
  readonly title: string;
  readonly architectureJson: ArchitectureJson;
  readonly requirementCoverage?: readonly AmazonQRequirementCoverage[] | undefined;
  readonly assumptions?: readonly string[] | undefined;
  readonly explanations?: readonly string[] | undefined;
  readonly summary?: string | undefined;
  readonly highlights?: readonly string[] | undefined;
  readonly nextActions?: readonly string[] | undefined;
};

type AmazonQRequirementCoverage = {
  readonly answer: string;
  readonly status: string;
  readonly capability?: string | undefined;
  readonly nodes?: readonly string[] | undefined;
  readonly assumption?: string | undefined;
};

type ArchitectureAnswerProfile = {
  readonly traffic?: "small" | "medium" | "large" | "bursty" | undefined;
  readonly frontend?: "static" | "spa" | "ssr" | "mobile" | undefined;
  readonly backend?: "none" | "simple_api" | "complex" | "microservices" | undefined;
  readonly region?: "korea" | "apac" | "global" | "specific" | undefined;
  readonly upload?: "none" | "image" | "mixed" | "large" | undefined;
  readonly realtime?: "none" | "chat" | "notification" | "data_updates" | undefined;
  readonly management?: "fully_managed" | "semi_managed" | "self_managed" | "unknown" | undefined;
  readonly latency?: "one_second" | "three_seconds" | "five_seconds" | "none" | undefined;
  readonly availability?: "99.99" | "99.9" | "99" | "none" | undefined;
  readonly budget?: "low" | "normal" | "high" | "enterprise" | undefined;
};

type ArchitectureDecisionPattern = {
  readonly id: string;
  readonly when: string;
  readonly typicalNodeTypes: readonly ResourceType[];
  readonly tradeoffs: readonly string[];
};

type UnsupportedSubstitution = {
  readonly requestedService: string;
  readonly supportedRepresentation: string;
  readonly requiredExplanation: string;
};

type ArchitectureDecisionSpace = {
  readonly answerProfile: ArchitectureAnswerProfile;
  readonly hardConstraints: readonly string[];
  readonly preferredPatterns: readonly ArchitectureDecisionPattern[];
  readonly discouragedPatterns: readonly { readonly id: string; readonly reason: string }[];
  readonly evaluationCriteria: readonly string[];
  readonly unsupportedSubstitutions: readonly UnsupportedSubstitution[];
  readonly coverageRequirements: readonly string[];
};

type AmazonQArchitectureDraftClarification = {
  readonly status: "needs_clarification";
  readonly question: string;
  readonly suggestions?: readonly string[] | undefined;
};

type AmazonQArchitectureDraftPlan = {
  readonly status: "plan";
  readonly title: string;
  readonly plan: ArchitectureIntentPlan;
  readonly assumptions?: readonly string[] | undefined;
  readonly explanations?: readonly string[] | undefined;
};

type AmazonQArchitectureDraftResponse =
  | AmazonQArchitectureDraftPreview
  | AmazonQArchitectureDraftClarification
  | AmazonQArchitectureDraftPlan;

export type CreateArchitectureDraftResponseFactory = (
  request: CreateArchitectureDraftRequest,
  options?: {
    readonly onProgress?: ((stage: ArchitectureDraftProgressStage) => void) | undefined;
  }
) => Promise<CreateArchitectureDraftResponse> | CreateArchitectureDraftResponse;

export type CreateAmazonQArchitectureDraftResponseOptions = {
  readonly provider?: AiTextProvider | undefined;
  readonly requirementNormalizerProvider?: AiTextProvider | undefined;
  readonly creditPolicy?: AiCreditPolicy | undefined;
  readonly onProgress?: ((stage: ArchitectureDraftProgressStage) => void) | undefined;
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

export function createConfiguredAmazonQArchitectureDraftResponse(input: {
  readonly onWarmupError?: ((error: unknown) => void) | undefined;
  readonly runtimeCache?: RuntimeCache | undefined;
} = {}): CreateArchitectureDraftResponseFactory {
  const regions = resolveAiProviderRegions(process.env);
  const provider =
    process.env.NODE_ENV === "test"
      ? undefined
      : createAmazonQArchitectureDraftProviderFromEnv({
          region: regions.amazonQRegion,
          ...(input.runtimeCache === undefined ? {} : { runtimeCache: input.runtimeCache })
        });
  const requirementNormalizerProvider =
    process.env.NODE_ENV === "test" ? undefined : createOpenAiRequirementNormalizerProviderFromEnv();

  if (provider !== undefined) {
    void warmAmazonQArchitectureDraftProvider(provider).catch((error: unknown) => {
      input.onWarmupError?.(error);
    });
  }

  return (request, operationOptions) =>
    createAmazonQArchitectureDraftResponse(request, {
      provider,
      requirementNormalizerProvider,
      creditPolicy: readAiCreditPolicyFromEnv(),
      onProgress: operationOptions?.onProgress
    });
}

export async function createAmazonQArchitectureDraftResponse(
  input: string | CreateArchitectureDraftRequest,
  options: CreateAmazonQArchitectureDraftResponseOptions = {}
): Promise<CreateArchitectureDraftResponse> {
  const request = normalizeArchitectureDraftRequest(input);
  const creditPolicy = options.creditPolicy ?? readAiCreditPolicyFromEnv();
  const provider = options.provider;

  reportArchitectureDraftProgress(options.onProgress, "preparing_requirements");

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

  const conditionalQuestion = findConditionalArchitectureQuestion(request.prompt);

  if (conditionalQuestion !== null) {
    return createArchitectureDraftClarification(conditionalQuestion, request, provider, creditPolicy.billingMode);
  }

  reportArchitectureDraftProgress(options.onProgress, "normalizing_requirements");
  const architectureDecisionSpace = createArchitectureDecisionSpace(request.prompt);
  const providerNormalizedRequirement = await createNormalizedArchitectureIntentPlan({
    prompt: request.prompt,
    provider: options.requirementNormalizerProvider
  });
  const normalizedRequirement = mergeArchitectureIntentPlans(
    providerNormalizedRequirement,
    createDeterministicArchitectureIntentPlan(request.prompt)
  );
  const architectureBrief = createAmazonQArchitectureBrief(request.prompt);
  const referenceKnowledge = createAwsArchitectureReferenceKnowledgePayload();
  const payload = maskSecretsForAi({
    architectureBrief,
    architectureDecisionSpace,
    ...(normalizedRequirement === null ? {} : { normalizedRequirement }),
    prompt: request.prompt,
    referenceKnowledge,
    supportedResourceTypes: SUPPORTED_RESOURCE_TYPES,
    supportedResourceCatalog: SUPPORTED_RESOURCE_CATALOG
  });

  try {
    let activePayload = payload;
    let retryUsed = false;
    reportArchitectureDraftProgress(options.onProgress, "querying_amazon_q");
    let response = await provider.generate({
      target: ARCHITECTURE_DRAFT_TARGET,
      instructions: createAmazonQArchitectureDraftInstructions(),
      prompt: createAmazonQArchitectureDraftPrompt(request.prompt, architectureDecisionSpace, normalizedRequirement),
      payload: activePayload
    });
    reportArchitectureDraftProgress(options.onProgress, "validating_architecture");
    let parsedResponse = parseAmazonQArchitectureDraftResponse(response.text);

    if (parsedResponse.status === "preview") {
      const validationIssues = findAmazonQPreviewValidationIssues(request.prompt, parsedResponse, normalizedRequirement);

      if (validationIssues.length > 0) {
        retryUsed = true;
        activePayload = maskSecretsForAi({
          architectureBrief,
          architectureDecisionSpace,
          ...(normalizedRequirement === null ? {} : { normalizedRequirement }),
          prompt: request.prompt,
          referenceKnowledge,
          validationIssues,
          previousArchitectureJson: parsedResponse.architectureJson,
          supportedResourceTypes: SUPPORTED_RESOURCE_TYPES,
          supportedResourceCatalog: SUPPORTED_RESOURCE_CATALOG
        });
        reportArchitectureDraftProgress(options.onProgress, "querying_amazon_q");
        response = await provider.generate({
          target: ARCHITECTURE_DRAFT_TARGET,
          instructions: createAmazonQArchitectureDraftInstructions(),
          prompt: createAmazonQArchitectureDraftRepairPrompt(
            request.prompt,
            architectureDecisionSpace,
            normalizedRequirement,
            validationIssues,
            parsedResponse.architectureJson
          ),
          payload: activePayload
        });
        reportArchitectureDraftProgress(options.onProgress, "validating_architecture");
        parsedResponse = parseAmazonQArchitectureDraftResponse(response.text);

        const retryValidationIssues =
          parsedResponse.status === "preview"
            ? findAmazonQPreviewValidationIssues(request.prompt, parsedResponse, normalizedRequirement)
            : [];

        if (parsedResponse.status === "preview" && retryValidationIssues.length > 0) {
          throw new Error("Amazon Q architecture draft failed self-validation after retry");
        }
      }
    }

    let providerMetadata = createAiProviderMetadata({
      provider,
      billingMode: creditPolicy.billingMode,
      payload: activePayload,
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

    if (parsedResponse.status === "plan") {
      try {
        reportArchitectureDraftProgress(options.onProgress, "building_diagram");
        return createAmazonQPlanDraftResult(
          parsedResponse,
          request,
          normalizedRequirement,
          providerMetadata
        );
      } catch (error) {
        if (retryUsed) {
          throw error;
        }

        const validationIssues = [
          `Architecture plan materialization validation failed: ${readArchitectureDraftErrorMessage(error)}`
        ];
        const previousPlan = {
          title: parsedResponse.title,
          ...parsedResponse.plan
        };
        activePayload = maskSecretsForAi({
          architectureBrief,
          architectureDecisionSpace,
          ...(normalizedRequirement === null ? {} : { normalizedRequirement }),
          prompt: request.prompt,
          referenceKnowledge,
          validationIssues,
          previousPlan,
          supportedResourceTypes: SUPPORTED_RESOURCE_TYPES,
          supportedResourceCatalog: SUPPORTED_RESOURCE_CATALOG
        });
        reportArchitectureDraftProgress(options.onProgress, "querying_amazon_q");
        response = await provider.generate({
          target: ARCHITECTURE_DRAFT_TARGET,
          instructions: createAmazonQArchitectureDraftInstructions(),
          prompt: createAmazonQArchitecturePlanRepairPrompt(
            request.prompt,
            architectureDecisionSpace,
            normalizedRequirement,
            validationIssues,
            previousPlan
          ),
          payload: activePayload
        });
        reportArchitectureDraftProgress(options.onProgress, "validating_architecture");
        parsedResponse = parseAmazonQArchitectureDraftResponse(response.text);

        if (parsedResponse.status !== "plan") {
          throw new Error(
            "Amazon Q must return a corrected architecture plan after materialization validation fails",
            { cause: error }
          );
        }

        providerMetadata = createAiProviderMetadata({
          provider,
          billingMode: creditPolicy.billingMode,
          payload: activePayload,
          outputCharacters: response.outputCharacters ?? response.text.length
        });

        reportArchitectureDraftProgress(options.onProgress, "building_diagram");
        return createAmazonQPlanDraftResult(
          parsedResponse,
          request,
          normalizedRequirement,
          providerMetadata
        );
      }
    }

    reportArchitectureDraftProgress(options.onProgress, "building_diagram");
    return createAmazonQDraftResult(parsedResponse, providerMetadata);
  } catch (error) {
    throw new ArchitectureDraftGenerationError(error);
  }
}

function reportArchitectureDraftProgress(
  onProgress: ((stage: ArchitectureDraftProgressStage) => void) | undefined,
  stage: ArchitectureDraftProgressStage
): void {
  try {
    onProgress?.(stage);
  } catch {
    // Progress reporting is observational and must never interrupt Q generation.
  }
}

function readArchitectureDraftErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message.trim()
    : "Unknown deterministic validation error";
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
      "정적 사이트 (블로그, 포트폴리오, 회사 소개페이지)",
      "동적 웹 애플리케이션 (쇼핑몰, 게시판, 회원 시스템)",
      "SPA (Single Page Application) (React/Vue 등)",
      "API 서버 (모바일 앱 백엔드)"
    ],
    isAnswered: isWebsiteTypeAnswered
  },
  {
    id: "traffic",
    question: "예상 트래픽 규모는?",
    suggestions: [
      "소규모 (일 100명 미만, 동시 10명 미만)",
      "중간 규모 (일 1,000명, 동시 50명)",
      "대규모 (일 10,000명 이상, 동시 500명 이상)",
      "급변동 (평상시 적지만 이벤트 시 급증)"
    ],
    isAnswered: isTrafficAnswered
  },
  {
    id: "database",
    question: "데이터베이스가 필요한가요?",
    suggestions: [
      "필요 없음 (정적 콘텐츠만)",
      "간단한 데이터 (사용자 정보, 게시글 등 < 10GB)",
      "중간 규모 데이터 (10GB ~ 100GB)",
      "대용량 데이터 (100GB 이상, 복잡한 쿼리)"
    ],
    isAnswered: isDatabaseAnswered
  },
  {
    id: "frontend",
    question: "프론트엔드 기술은?",
    suggestions: [
      "HTML/CSS/JS만 (순수 웹)",
      "React/Vue/Angular (SPA 프레임워크)",
      "Next.js/Nuxt.js (SSR 필요)",
      "모바일 앱 (웹뷰 또는 네이티브)"
    ],
    isAnswered: isFrontendAnswered
  },
  {
    id: "backend",
    question: "백엔드가 필요한가요?",
    suggestions: [
      "필요 없음 (정적 사이트)",
      "간단한 API (Node.js, Python Flask 등)",
      "복잡한 비즈니스 로직 (Spring Boot, Django 등)",
      "마이크로서비스 (여러 서비스 분리)"
    ],
    isAnswered: isBackendAnswered
  },
  {
    id: "region",
    question: "주요 사용자 지역은?",
    suggestions: [
      "한국만 (서울 리전)",
      "아시아 태평양 (도쿄, 싱가포르 포함)",
      "글로벌 (미국, 유럽 포함)",
      "특정 지역 (중국, 일본 등)"
    ],
    isAnswered: isRegionAnswered
  },
  {
    id: "budget",
    question: "월 예산 범위는?",
    suggestions: [
      "10만원 미만 (최소 비용)",
      "10-50만원 (적당한 성능)",
      "50-200만원 (고성능)",
      "200만원 이상 (엔터프라이즈급)"
    ],
    isAnswered: isBudgetAnswered
  },
  {
    id: "ssl",
    question: "SSL 인증서(HTTPS)가 필요한가요?",
    suggestions: [
      "필수 (보안 중요)",
      "선택사항 (HTTP도 괜찮음)",
      "모르겠음 (추천해주세요)"
    ],
    isAnswered: isSslAnswered
  },
  {
    id: "file_upload",
    question: "파일 업로드 기능이 있나요? (이미지, 문서 등)",
    suggestions: [
      "없음 (텍스트만)",
      "이미지만 (프로필, 게시글 이미지)",
      "다양한 파일 (문서, 동영상 포함)",
      "대용량 파일 (100MB 이상)"
    ],
    isAnswered: isFileUploadAnswered
  },
  {
    id: "realtime",
    question: "실시간 기능이 필요한가요? (채팅, 알림 등)",
    suggestions: [
      "필요 없음",
      "실시간 채팅",
      "실시간 알림",
      "실시간 데이터 업데이트 (주식, 게임 등)"
    ],
    isAnswered: isRealtimeAnswered
  },
  {
    id: "management_preference",
    question: "관리 복잡도 선호도는?",
    suggestions: [
      "완전 관리형 (서버리스, 관리 최소화)",
      "반관리형 (일부 서버 관리)",
      "직접 관리 (서버 직접 운영)",
      "모르겠음 (추천해주세요)"
    ],
    isAnswered: isManagementPreferenceAnswered
  },
  {
    id: "page_loading_time",
    question: "페이지 로딩 시간 목표는?",
    suggestions: [
      "1초 이내 (매우 빠름)",
      "3초 이내 (적당함)",
      "5초 이내 (느려도 괜찮음)",
      "상관없음"
    ],
    isAnswered: isPageLoadingTimeAnswered
  },
  {
    id: "website_size",
    question: "전체 웹사이트 크기는?",
    suggestions: [
      "10MB 미만 (간단한 사이트)",
      "10MB-100MB (일반적인 사이트)",
      "100MB-1GB (이미지 많은 사이트)",
      "1GB 이상 (동영상 포함)"
    ],
    isAnswered: isWebsiteSizeAnswered
  },
  {
    id: "traffic_pattern",
    question: "트래픽 패턴은?",
    suggestions: [
      "일정함 (하루 종일 비슷)",
      "시간대별 차이 (낮에 많음)",
      "이벤트성 급증 (특정 시기에만)",
      "예측 불가"
    ],
    isAnswered: isTrafficPatternAnswered
  },
  {
    id: "downtime_tolerance",
    question: "서비스 중단 허용 시간은?",
    suggestions: [
      "절대 안됨 (99.99% 가용성)",
      "월 1시간 이내 (99.9% 가용성)",
      "월 8시간 이내 (99% 가용성)",
      "상관없음"
    ],
    isAnswered: isDowntimeToleranceAnswered
  }
];
function isWebsiteTypeAnswered(prompt: string): boolean {
  return (
    hasPromptTerm(prompt, ["static", "dynamic", "spa", "single page", "api server", "api 서버", "정적", "동적", "블로그", "포트폴리오", "회사", "소개", "쇼핑몰", "게시판", "회원", "?뺤쟻", "?숈쟻", "釉붾줈", "寃뚯떆", "?뚯썝"]) ||
    isMobileAppPrompt(prompt)
  );
}

function isMobileAppPrompt(prompt: string): boolean {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();

  return (
    /(?:mobile\s+app|app\s+store|play\s*store|google\s*play|모바일\s*앱|네이티브|웹뷰|플레이스토어|구글\s*플레이|앱\s*스토어)/iu.test(
      normalizedPrompt
    ) || hasStandaloneMobileAppCreationPrompt(normalizedPrompt)
  );
}

function hasStandaloneMobileAppCreationPrompt(normalizedPrompt: string): boolean {
  for (const match of normalizedPrompt.matchAll(/앱\s*하나/giu)) {
    const prefix = normalizedPrompt.slice(Math.max(0, match.index - 2), match.index).replace(/\s+/g, "");

    if (!prefix.endsWith("웹")) {
      return true;
    }
  }

  return false;
}

function isTrafficAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["traffic", "concurrent", "daily", "트래픽", "소규모", "중간 규모", "대규모", "급변동", "동시", "동접", "?몃옒", "?뚭퇋", "以묎컙", "?洹", "湲됰", "?숈떆", "?숈젒"]) || /\b(?:100|1,000|1000|10,000|10000|50|500)\b/iu.test(prompt);
}

function isDatabaseAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["database", " db", "rds", "postgres", "postgresql", "mysql", "dynamodb", "데이터베이스", "간단한 데이터", "중간 규모 데이터", "대용량 데이터", "정적 콘텐츠", "사용자 정보", "게시글", "?곗씠", "肄섑뀗", "寃뚯떆", "10gb", "100gb"]);
}

function isFrontendAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["frontend", "html", "css", "javascript", " js", "react", "vue", "angular", "next.js", "nuxt", "ssr", "프론트엔드", "순수 웹", "모바일", "웹뷰", "네이티브", "?꾨줎", "?쒖닔", "?밸럭"]);
}

function isBackendAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["backend", "api", "node.js", "nodejs", "python", "flask", "spring", "django", "microservice", "백엔드", "간단한 api", "복잡한 비즈니스", "마이크로서비스", "諛깆뿏", "媛꾨떒", "蹂듭옟", "留덉씠"]);
}

function isRegionAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["region", "korea", "seoul", "ap-northeast-2", "asia", "global", "worldwide", "us", "europe", "한국", "서울", "아시아", "태평양", "글로벌", "미국", "유럽", "중국", "일본", "?쒓뎅", "?쒖슱", "?꾩떆", "湲濡", "誘멸뎅", "?좊읇", "以묎뎅", "?쇰낯"]);
}

function isBudgetAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["budget", "cost", "krw", "usd", "monthly", "예산", "비용", "만원", "최소 비용", "적당한 성능", "고성능", "?덉궛", "鍮꾩슜", "留뚯썝", "理쒖냼", "怨좎꽦"]) || /\$\s*\d+|\b\d+\s*(?:usd|krw|monthly)\b/iu.test(prompt);
}

function isSslAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["ssl", "https", "http", "domain", "인증서", "보안", "선택사항", "?몄쬆", "蹂댁븞", "?좏깮"]);
}

function isFileUploadAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["file upload", "upload", "image", "document", "file", "100mb", "파일", "업로드", "이미지", "문서", "동영상", "텍스트만", "?뚯씪", "?낅줈", "?띿뒪?몃쭔", "?대?吏", "臾몄꽌", "?숈쁺"]);
}

function isRealtimeAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["realtime", "real-time", "chat", "notification", "websocket", "sse", "실시간", "채팅", "알림", "데이터 업데이트", "?ㅼ떆", "梨꾪똿", "?뚮┝", "?낅뜲"]);
}

function isManagementPreferenceAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["managed", "serverless", "management", "operations", "관리", "서버리스", "완전 관리형", "반관리형", "직접 관리", "愿由", "?쒕쾭由", "諛섍?由", "吏곸젒"]);
}

function isPageLoadingTimeAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["loading time", "loading", "로딩", "1초", "3초", "5초", "?섏씠吏", "濡쒕뵫", "1珥", "3珥", "5珥"]) || /\b[135]\s*seconds?\b/iu.test(prompt);
}

function isWebsiteSizeAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["10mb", "100mb", "1gb", "website size", "웹사이트 크기", "간단한 사이트", "일반적인 사이트", "이미지 많은", "동영상 포함", "?뱀궗?댄듃", "?ш린", "媛꾨떒", "?쇰컲", "?대?吏", "?숈쁺"]);
}

function isTrafficPatternAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["traffic pattern", "steady", "time of day", "event spike", "unpredictable", "트래픽 패턴", "일정함", "시간대별", "이벤트성", "예측 불가", "?몃옒", "?⑦꽩", "?쇱젙", "?쒓컙", "?대깽", "?덉륫"]);
}

function isDowntimeToleranceAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["downtime", "availability", "99.99", "99.9", "99%", "서비스 중단", "허용 시간", "절대 안됨", "가용성", "상관없음", "?쒕퉬", "以묐떒", "?덈?", "?곴??놁쓬"]);
}

function hasPromptTerm(prompt: string, terms: readonly string[]): boolean {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();

  return terms.some((term) => normalizedPrompt.includes(term.normalize("NFKC").toLowerCase()));
}

function findMissingRequiredQuestion(prompt: string): RequiredArchitectureQuestion | null {
  if (hasExplicitArchitectureBrief(prompt)) {
    return null;
  }

  return REQUIRED_ARCHITECTURE_QUESTIONS.find((question) => !isRequiredArchitectureQuestionAnswered(question, prompt)) ?? null;
}

function findConditionalArchitectureQuestion(prompt: string): RequiredArchitectureQuestion | null {
  if (hasExplicitArchitectureBrief(prompt)) {
    return null;
  }

  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();

  if (hasBudgetAvailabilityConflict(normalizedPrompt) && !hasBudgetAvailabilityResolution(normalizedPrompt)) {
    return {
      id: "budget_availability_tradeoff",
      question: "월 $100 예산과 99.99% 가용성은 충돌할 수 있습니다. 어떤 기준으로 설계할까요?",
      suggestions: [
        "월 $100 예산을 유지하고 99.9% 수준으로 완화",
        "99.99% 가용성을 우선하고 예산 초과 허용",
        "목표 아키텍처는 99.99%로 그리고 비용 초과 경고 표시"
      ],
      isAnswered: () => true
    };
  }

  if (requiresGlobalDeploymentScopeDecision(normalizedPrompt) && !hasGlobalDeploymentDecision(normalizedPrompt)) {
    return {
      id: "global_deployment_scope",
      question: "글로벌 사용자와 1초 로딩 목표를 어떤 범위로 설계할까요?",
      suggestions: [
        "CloudFront 글로벌 + API/RDS는 단일 리전",
        "다중 리전 API까지 포함",
        "MVP는 단일 리전, 추후 다중 리전 확장 경고 표시"
      ],
      isAnswered: () => true
    };
  }

  if (requiresRealtime(normalizedPrompt) && !hasRealtimeImplementationDecision(normalizedPrompt)) {
    return {
      id: "realtime_implementation",
      question: "실시간 알림은 어떤 방식으로 표현할까요?",
      suggestions: [
        "WebSocket 연결 경로",
        "SSE 단방향 알림 경로",
        "간단 폴링 방식과 비용 절감 경고"
      ],
      isAnswered: () => true
    };
  }

  return null;
}

function isRequiredArchitectureQuestionAnswered(question: RequiredArchitectureQuestion, prompt: string): boolean {
  if (question.isAnswered(prompt)) {
    return true;
  }

  if (question.id === "traffic_pattern") {
    return /(traffic\s*pattern|steady|time\s*of\s*day|event\s*spike|unpredictable)/i.test(prompt);
  }

  return false;
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

function createArchitectureDecisionSpace(prompt: string): ArchitectureDecisionSpace {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  const answerProfile = createArchitectureAnswerProfile(normalizedPrompt);

  return {
    answerProfile,
    hardConstraints: createArchitectureHardConstraints(answerProfile, normalizedPrompt),
    preferredPatterns: createPreferredArchitecturePatterns(answerProfile, normalizedPrompt),
    discouragedPatterns: createDiscouragedArchitecturePatterns(answerProfile),
    evaluationCriteria: createArchitectureEvaluationCriteria(answerProfile),
    unsupportedSubstitutions: createUnsupportedSubstitutions(answerProfile, normalizedPrompt),
    coverageRequirements: createArchitectureCoverageRequirements(answerProfile, normalizedPrompt)
  };
}

function createArchitectureAnswerProfile(normalizedPrompt: string): ArchitectureAnswerProfile {
  return {
    traffic: resolveTrafficProfile(normalizedPrompt),
    frontend: resolveFrontendProfile(normalizedPrompt),
    backend: resolveBackendProfile(normalizedPrompt),
    region: resolveRegionProfile(normalizedPrompt),
    upload: resolveUploadProfile(normalizedPrompt),
    realtime: resolveRealtimeProfile(normalizedPrompt),
    management: resolveManagementProfile(normalizedPrompt),
    latency: resolveLatencyProfile(normalizedPrompt),
    availability: resolveAvailabilityProfile(normalizedPrompt),
    budget: resolveBudgetProfile(normalizedPrompt)
  };
}

function createArchitectureHardConstraints(answerProfile: ArchitectureAnswerProfile, normalizedPrompt: string): string[] {
  const constraints: string[] = [];

  if (answerProfile.backend === "none") {
    constraints.push(
      "Backend not required: forbid backend-only EC2, LAMBDA, API_GATEWAY_REST_API, LOAD_BALANCER, and LOAD_BALANCER_LISTENER unless another explicit accepted answer creates an API requirement."
    );
  }

  if (requiresNoDatabase(normalizedPrompt)) {
    constraints.push("Database not required: forbid RDS, DB_SUBNET_GROUP, and database-specific labels/config.");
  }

  if (answerProfile.upload === "none") {
    constraints.push(
      "File upload not required: forbid upload/media/presigned/file-processing resources, labels, flows, and upload-specific IAM paths."
    );
  }

  if (answerProfile.realtime === "none") {
    constraints.push(
      "Realtime not required: forbid WebSocket, SSE, realtime notification, chat, push, SNS, SQS, EventBridge, and notification-path labels/coverage."
    );
  }

  if (answerProfile.region === "korea") {
    constraints.push("Korea-only scope: forbid multi-region API/RDS wording or topology; CloudFront may be used only for static or CDN acceleration assumptions.");
  }

  if (answerProfile.budget === "low" && answerProfile.availability === "99.99") {
    constraints.push("Low budget and 99.99% availability conflict: do not claim both are satisfied without explicit cost-warning coverage.");
  }

  return constraints;
}

function createPreferredArchitecturePatterns(
  answerProfile: ArchitectureAnswerProfile,
  normalizedPrompt: string
): ArchitectureDecisionPattern[] {
  const patterns: ArchitectureDecisionPattern[] = [];

  if (answerProfile.backend === "none" || answerProfile.frontend === "static") {
    patterns.push({
      id: "static_cdn_site",
      when: "Use for static or mostly static websites with no accepted backend/database requirement.",
      typicalNodeTypes: ["S3", "CLOUDFRONT", "ROUTE53_RECORD"],
      tradeoffs: ["Low operational burden and cost.", "Dynamic behavior needs a separate API pattern."]
    });
  }

  if (answerProfile.frontend === "spa" && answerProfile.backend === "simple_api") {
    patterns.push({
      id: "spa_with_serverless_api",
      when: "Use when SPA delivery needs a small managed API and low operational burden.",
      typicalNodeTypes: ["S3", "CLOUDFRONT", "API_GATEWAY_REST_API", "LAMBDA", "IAM_ROLE", "CLOUDWATCH_LOG_GROUP"],
      tradeoffs: ["Simple scaling and lower operations.", "Long-running or complex backend logic may need a different runtime pattern."]
    });
  }

  if (answerProfile.backend === "complex" || answerProfile.backend === "microservices") {
    patterns.push({
      id: "load_balanced_app_tier",
      when: "Use when backend logic, traffic, or availability makes an explicit app entry and runtime tier useful.",
      typicalNodeTypes: ["VPC", "SUBNET", "SECURITY_GROUP", "LOAD_BALANCER", "LOAD_BALANCER_LISTENER", "EC2", "CLOUDWATCH_LOG_GROUP"],
      tradeoffs: ["Clearer operational control and scaling path.", "Higher cost and operational burden than serverless/simple API patterns."]
    });
  }

  if (!requiresNoDatabase(normalizedPrompt) && answerProfile.backend !== "none") {
    patterns.push({
      id: "managed_relational_data",
      when: "Use when accepted answers require relational or durable application data.",
      typicalNodeTypes: ["RDS", "DB_SUBNET_GROUP", "KMS_KEY", "CLOUDWATCH_METRIC_ALARM"],
      tradeoffs: ["Managed persistence and backup posture.", "RDS and Multi-AZ can dominate low-budget designs."]
    });
  }

  if (answerProfile.region === "global" || answerProfile.latency === "one_second") {
    patterns.push({
      id: "global_static_delivery_single_region_api",
      when: "Use when users are global or latency-sensitive but API/database can remain in one region with a clear warning.",
      typicalNodeTypes: ["CLOUDFRONT", "ROUTE53_RECORD", "S3", "LOAD_BALANCER", "API_GATEWAY_REST_API"],
      tradeoffs: ["Fast static/media delivery.", "Single-region API/RDS latency must be disclosed for distant users."]
    });
  }

  if (answerProfile.availability === "99.99") {
    patterns.push({
      id: "high_availability_multi_az_target",
      when: "Use when the accepted availability target is 99.99% or no-downtime.",
      typicalNodeTypes: ["SUBNET", "LOAD_BALANCER", "LOAD_BALANCER_LISTENER", "EC2", "RDS", "DB_SUBNET_GROUP", "CLOUDWATCH_METRIC_ALARM"],
      tradeoffs: ["Better redundancy and failure isolation.", "May conflict with low budgets and needs explicit cost-warning coverage."]
    });
  }

  if (answerProfile.upload && answerProfile.upload !== "none") {
    patterns.push({
      id: "direct_media_upload",
      when: "Use when accepted answers include image, mixed, or large file upload.",
      typicalNodeTypes: ["S3", "IAM_ROLE", "IAM_POLICY", "KMS_KEY", "CLOUDFRONT"],
      tradeoffs: ["Avoids proxying large files through app compute.", "Requires clear object access, lifecycle, and validation assumptions."]
    });
  }

  if (answerProfile.realtime && answerProfile.realtime !== "none") {
    patterns.push({
      id: "supported_realtime_notification_path",
      when: "Use when accepted answers include chat, notifications, or data updates.",
      typicalNodeTypes: ["API_GATEWAY_REST_API", "LAMBDA", "EC2", "CLOUDWATCH_LOG_GROUP"],
      tradeoffs: ["Represents realtime capability with supported nodes.", "Dedicated WebSocket/SNS/SQS/EventBridge nodes require future ResourceType expansion."]
    });
  }

  if (patterns.length === 0) {
    patterns.push({
      id: "minimal_reviewable_architecture",
      when: "Use when requirements are complete but do not strongly select a specialized pattern.",
      typicalNodeTypes: ["S3", "CLOUDFRONT", "CLOUDWATCH_LOG_GROUP"],
      tradeoffs: ["Keeps the draft concise and reviewable.", "May need follow-up before Terraform/deployment handoff."]
    });
  }

  return patterns;
}

function createDiscouragedArchitecturePatterns(answerProfile: ArchitectureAnswerProfile): {
  readonly id: string;
  readonly reason: string;
}[] {
  const patterns: { readonly id: string; readonly reason: string }[] = [];

  if (answerProfile.budget === "low") {
    patterns.push({
      id: "enterprise_resilience_by_default",
      reason: "Low-budget answers should not silently add expensive HA/global patterns unless availability or latency explicitly requires them."
    });
  }

  if (answerProfile.management === "fully_managed") {
    patterns.push({
      id: "self_managed_ec2_first",
      reason: "Fully managed preference should lower the priority of manually operated EC2-first designs when a supported managed pattern can satisfy the same capability."
    });
  }

  if (answerProfile.region === "korea") {
    patterns.push({
      id: "multi_region_api_database",
      reason: "Korea-only scope makes multi-region API/database topology inappropriate unless the user changes the region requirement."
    });
  }

  if (answerProfile.upload === "none") {
    patterns.push({
      id: "media_upload_pipeline",
      reason: "The user selected no file upload, so upload/media/presigned-file patterns must not be selected."
    });
  }

  if (answerProfile.realtime === "none") {
    patterns.push({
      id: "realtime_notification_stack",
      reason: "The user selected no realtime feature, so notification/chat/update-stream patterns must not be selected."
    });
  }

  return patterns;
}

function createArchitectureEvaluationCriteria(answerProfile: ArchitectureAnswerProfile): string[] {
  const criteria = ["cost", "availability", "latency", "operational burden", "diagram clarity", "supported ResourceType"];

  if (answerProfile.budget === "low") {
    criteria.push("budget conflict visibility");
  }

  if (answerProfile.region === "global" || answerProfile.latency === "one_second") {
    criteria.push("global/static delivery signal", "single-region API latency warning when applicable");
  }

  if (answerProfile.availability === "99.99") {
    criteria.push("redundancy and high-availability signal");
  }

  if (answerProfile.upload && answerProfile.upload !== "none") {
    criteria.push("upload/media capability signal");
  }

  if (answerProfile.realtime && answerProfile.realtime !== "none") {
    criteria.push("notification/realtime capability signal");
  }

  return criteria;
}

function createUnsupportedSubstitutions(
  _answerProfile: ArchitectureAnswerProfile,
  _normalizedPrompt: string
): UnsupportedSubstitution[] {
  return [];
}

function createArchitectureCoverageRequirements(
  answerProfile: ArchitectureAnswerProfile,
  normalizedPrompt: string
): string[] {
  const requirements = [
    "Record selectedPattern id and why it was chosen.",
    "Record rejectedPatterns or lower-priority patterns with short reasons.",
    "Map every selected answer to a capability signal and node ids when a node represents that capability.",
    "Record unsupported substitutions and limitations when a requested service cannot be drawn directly."
  ];

  if (answerProfile.frontend === "spa" || answerProfile.frontend === "static") {
    requirements.push("Frontend/static delivery coverage must explain how users receive the site or app shell.");
  }

  if (answerProfile.backend && answerProfile.backend !== "none") {
    requirements.push("Backend/API coverage must explain the request entry path and runtime choice.");
  }

  if (!requiresNoDatabase(normalizedPrompt) && answerProfile.backend !== "none") {
    requirements.push("Data persistence coverage must explain database/storage assumptions or explicitly say why durable storage is not selected.");
  }

  if (answerProfile.upload && answerProfile.upload !== "none") {
    requirements.push("Upload/media coverage must mention direct upload, media storage, validation, lifecycle, or the chosen supported substitute.");
  }

  if (answerProfile.realtime && answerProfile.realtime !== "none") {
    requirements.push("Realtime/notification coverage must mention WebSocket, SSE, notification, polling, or the chosen supported substitute.");
  }

  if (answerProfile.region === "global" || answerProfile.latency === "one_second") {
    requirements.push("Global/latency coverage must mention global/static delivery or warn about single-region API/database latency.");
  }

  if (answerProfile.availability === "99.99") {
    requirements.push("High-availability coverage must mention redundancy, Multi-AZ, failover, or another explicit availability trade-off.");
  }

  if (answerProfile.budget === "low" && answerProfile.availability === "99.99") {
    requirements.push("Cost-warning coverage must mention the budget versus 99.99% availability conflict.");
  }

  return requirements;
}

function createAmazonQArchitectureDraftInstructions(): string {
  return [
    "You are Amazon Q assisting SketchCatch, an IaC operations service.",
    "Return JSON only. Do not wrap the response in markdown.",
    "Choose a cost- and security-conscious Practice Architecture from the provided ArchitectureDecisionSpace.",
    "SketchCatch is provider-neutral, AWS-first for the MVP, and Terraform-first.",
    "Do not perform deployment, apply, update, delete, or destroy actions.",
    "All architecture changes must remain user-accepted previews.",
    `Use only these ResourceNode.type values: ${SUPPORTED_RESOURCE_TYPES.join(", ")}.`,
    "The visible left resource panel is represented by supportedResourceCatalog. When the user asks for a specific panel Terraform resource, create a ResourceNode whose type is the catalog nodeType and include config.terraformResourceType with the catalog terraformResourceType. Include config.terraformBlockType when terraformBlockType is data.",
    "Use the persistent compact AWS/Terraform referenceKnowledge payload as design precedent. Do not request or quote the full source documents; apply the compact guidance only when it fits the user's selected constraints.",
    "The ArchitectureDecisionSpace is not a fixed skeleton. hardConstraints are binding only for explicit none choices or clear contradictions; preferredPatterns are candidate patterns you may choose, adapt, or combine.",
    "Select the preferredPattern that best fits the answerProfile and evaluationCriteria. If you choose a lower-priority or combined pattern, explain why in requirementCoverage.",
    "Record the selected pattern id, rejected pattern ids, and trade-off rationale in requirementCoverage, assumptions, highlights, or nextActions.",
    "Use evaluationCriteria and coverageRequirements as capability signals. Do not force a specific resource solely to make diagrams look different.",
    "Use unsupportedSubstitutions when a requested AWS service has no supported ResourceNode.type. Do not invent unsupported ResourceNode.type values.",
    "Do not artificially limit the architecture to one resource per type. If the selected pattern justifies it, use multiple EC2, SUBNET, S3, or other supported resources.",
    "Layout rules: VPC, SUBNET, and SECURITY_GROUP nodes are area boxes. Nodes related by contains/hosts edges or config references such as vpcId, subnetId, securityGroupIds, or vpcSecurityGroupIds must be fully inside their parent area box.",
    "Unrelated area boxes must not overlap. If an area belongs inside another area, place it fully inside and include the containment relationship. Boundary resources such as INTERNET_GATEWAY may sit on an area edge, but must not float half-overlapping unrelated areas.",
    "Keep diagram labels readable: non-area nodes must be spaced generously so icons, node labels, and edge labels do not overlap or crowd each other. Prefer at least 240px horizontal spacing or 150px vertical spacing between separate non-area resources.",
    "Layering and edge routing rules: list area/container nodes before their children so containers render behind resources, and do not route visible arrows through unrelated resources or place unrelated resources between connected nodes.",
    "If required information is missing, return a needs_clarification response with exactly one question.",
    "Do not include secrets, account IDs, credentials, ARNs, or private tokens.",
    "Before finalizing the diagram, derive selected capabilities from every answered clarification choice. The architectureJson must visibly satisfy those capabilities, not only mention them in prose.",
    "Every preview response must include requirementCoverage. Each entry must name the selected answer, whether it is satisfied, the capability it drives, the node ids that satisfy it, and any assumption or trade-off.",
    "If a selected answer cannot be represented with supported ResourceNode.type values, represent the closest supported topology and explain the limitation in requirementCoverage and assumptions.",
    "The preview JSON shape is:",
    '{"status":"preview","title":"string","architectureJson":{"nodes":[{"id":"string","type":"S3","label":"string","positionX":0,"positionY":0,"config":{}}],"edges":[{"id":"string","sourceId":"string","targetId":"string","label":"string"}]},"requirementCoverage":[{"answer":"string","status":"satisfied","capability":"string","nodes":["node-id"],"assumption":"string"}],"assumptions":["string"],"explanations":["string"],"summary":"string","highlights":["string"],"nextActions":["string"]}',
    "The clarification JSON shape is:",
    '{"status":"needs_clarification","question":"string","suggestions":["string"]}'
  ].join("\n");
}

function createAmazonQArchitectureDraftPrompt(
  prompt: string,
  architectureDecisionSpace: ArchitectureDecisionSpace,
  normalizedRequirement: ArchitectureIntentPlan | null
): string {
  return [
    createAmazonQArchitectureDraftInstructions(),
    createAwsArchitectureReferenceKnowledgePrompt(),
    createAmazonQArchitectureBrief(prompt),
    createNormalizedArchitectureIntentPlanPromptSection(normalizedRequirement),
    "Supported resource panel catalog:",
    JSON.stringify(SUPPORTED_RESOURCE_CATALOG, null, 2),
    "ArchitectureDecisionSpace:",
    JSON.stringify(architectureDecisionSpace, null, 2),
    "User requirement prompt:",
    prompt
  ].join("\n\n");
}

function createAmazonQArchitectureDraftRepairPrompt(
  prompt: string,
  architectureDecisionSpace: ArchitectureDecisionSpace,
  normalizedRequirement: ArchitectureIntentPlan | null,
  validationIssues: readonly string[],
  previousArchitectureJson: ArchitectureJson
): string {
  return [
    createAmazonQArchitectureDraftInstructions(),
    "The previous preview failed SketchCatch self-validation.",
    "Regenerate the full Architecture Draft JSON. Do not patch partially.",
    "Do not return the same topology. Add or remove nodes and edges needed to satisfy the failed requirement coverage checks.",
    "The regenerated response must include requirementCoverage entries proving how every selected answer is represented.",
    createAwsArchitectureReferenceKnowledgePrompt(),
    createAmazonQArchitectureBrief(prompt),
    createNormalizedArchitectureIntentPlanPromptSection(normalizedRequirement),
    "ArchitectureDecisionSpace:",
    JSON.stringify(architectureDecisionSpace, null, 2),
    "Validation issues:",
    ...validationIssues.map((issue) => `- ${issue}`),
    "Original user requirement prompt:",
    prompt,
    "Previous invalid architectureJson:",
    JSON.stringify(previousArchitectureJson)
  ].join("\n\n");
}

function createAmazonQArchitecturePlanRepairPrompt(
  prompt: string,
  architectureDecisionSpace: ArchitectureDecisionSpace,
  normalizedRequirement: ArchitectureIntentPlan | null,
  validationIssues: readonly string[],
  previousPlan: Record<string, unknown>
): string {
  return [
    createAmazonQArchitectureDraftInstructions(),
    "The previous compact architecture plan failed deterministic SketchCatch materialization validation.",
    "Return a complete corrected plan JSON. Do not return a preview and do not repeat the invalid plan.",
    createAmazonQArchitectureBrief(prompt),
    createNormalizedArchitectureIntentPlanPromptSection(normalizedRequirement),
    "ArchitectureDecisionSpace:",
    JSON.stringify(architectureDecisionSpace, null, 2),
    "Validation issues:",
    ...validationIssues.map((issue) => `- ${issue}`),
    "Previous invalid plan:",
    JSON.stringify(previousPlan),
    "Original user requirement prompt:",
    prompt
  ].join("\n\n");
}

function createNormalizedArchitectureIntentPlanPromptSection(
  normalizedRequirement: ArchitectureIntentPlan | null
): string {
  if (normalizedRequirement === null) {
    return "";
  }

  const briefLines = (normalizedRequirement.amazonQBrief ?? []).map((line) => `- ${line}`);

  return [
    "Normalized Architecture Intent Plan:",
    JSON.stringify(normalizedRequirement, null, 2),
    ...(briefLines.length === 0 ? [] : ["Normalizer-to-Amazon-Q imperative brief:", ...briefLines])
  ].join("\n");
}

function createAmazonQArchitectureBrief(prompt: string): string {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  const intent = ["Architecture Intent:"];
  const requirements = ["Derived Architecture Requirements:"];
  const flows = ["Required Architecture Flows:"];
  const validation = ["Validation Checklist:"];
  const tradeoffs = ["Trade-off Notes:"];

  if (hasExplicitArchitectureBrief(prompt)) {
    intent.push("- User supplied a detailed architecture brief with explicit required components, flows, and validation criteria. Preserve those requirements unless a listed component is unsupported.");
  }

  if (requiresSpaFrontend(normalizedPrompt)) {
    intent.push("- React/Vue/Angular SPA or single-page frontend.");
    requirements.push("- Capability signal needed: frontend/app-shell delivery. S3 plus CLOUDFRONT is a supported candidate, but the selected pattern must explain the delivery choice.");
    flows.push("- User -> selected frontend/static delivery path -> app shell/assets.");
    validation.push("- requirementCoverage must explain the frontend delivery capability instead of relying on prose-only claims.");
  }

  if (hasExplicitComplexBackendMarker(normalizedPrompt) && requiresComplexBackend(normalizedPrompt)) {
    intent.push("- Backend requires complex business logic.");
    requirements.push("- Capability signal needed: backend/API entry path and runtime choice. LOAD_BALANCER/LOAD_BALANCER_LISTENER or API_GATEWAY_REST_API/LAMBDA are supported candidates depending on the selected pattern.");
    flows.push("- User/API traffic -> selected API/backend entry -> selected runtime.");
    validation.push("- requirementCoverage must explain why the backend pattern fits the business logic and operations profile.");
  }

  if (hasExplicitDatabaseMarker(normalizedPrompt) && requiresDatabase(normalizedPrompt)) {
    requirements.push("- Capability signal needed: durable data persistence. RDS/DB_SUBNET_GROUP is the supported relational representation when the selected pattern needs relational storage.");
    flows.push("- Backend/runtime -> selected durable data store.");
  }

  if (hasNoFileUploadRequirement(normalizedPrompt)) {
    requirements.push("- ABSOLUTE CONSTRAINT: The user selected no file upload. Do not create upload/media buckets, presigned URL flows, file-processing resources, or upload-specific IAM policies.");
    validation.push("- Any S3 bucket or IAM path named upload, media, image, attachment, presigned, or file upload violates the selected no-upload answer.");
  } else if (requiresImageUpload(normalizedPrompt)) {
    requirements.push("- Capability signal needed: upload/media handling with validation, access, lifecycle, and direct-upload assumptions when selected.");
    flows.push("- Client -> selected upload path -> selected media storage representation.");
    validation.push("- requirementCoverage must name upload/media handling and the supported node ids or limitation.");
  }

  if (hasNoRealtimeRequirement(normalizedPrompt)) {
    requirements.push("- ABSOLUTE CONSTRAINT: The user selected no realtime feature. Do not create WebSocket, SSE, realtime notification, or realtime processing resources.");
    validation.push("- Any WebSocket/SSE/realtime/notification-specific node, coverage entry, or assumption violates the selected no-realtime answer.");
  } else if (requiresRealtime(normalizedPrompt)) {
    requirements.push("- Capability signal needed: realtime/notification path. Use API_GATEWAY_REST_API/LAMBDA or the backend tier as the supported representation if dedicated messaging nodes are unavailable.");
    flows.push("- Client -> selected realtime/notification entry -> selected backend or serverless notification path.");
    validation.push("- requirementCoverage must name WebSocket, SSE, notification, or realtime and map it to node ids.");
  }

  if (requiresKoreaOnlyRegion(normalizedPrompt)) {
    requirements.push("- Region scope is Korea only. Keep regional API and database assumptions in Seoul/ap-northeast-2; CloudFront is allowed only as a static/performance CDN, not as a multi-region API design.");
    validation.push("- Do not ask for or imply multi-region/global-user deployment when the user selected Korea only.");
  }

  if (requiresGlobalOrFastFrontend(normalizedPrompt)) {
    requirements.push("- Capability signal needed: global/static delivery or a clear warning that API/database latency remains single-region.");
    validation.push("- Do not claim global 1-second dynamic API latency from a single region without requirementCoverage or nextActions warning.");
  }

  if (requiresVeryHighAvailability(normalizedPrompt)) {
    requirements.push("- Capability signal needed: redundancy/high availability. Use Multi-AZ, failover, redundant compute, or an explicit trade-off depending on the selected pattern.");
    validation.push("- requirementCoverage must explain the high-availability signal or an explicit reason the selected pattern cannot fully meet 99.99%.");
  }

  if (hasBudgetAvailabilityConflict(normalizedPrompt)) {
    tradeoffs.push("- Monthly $100 budget conflicts with 99.99% availability, ALB, redundant compute, and RDS Multi-AZ. Keep the selected design target and add explicit cost-warning assumptions unless the user chose to relax availability.");
  }

  if (mentionsAutoScalingGroup(normalizedPrompt)) {
    requirements.push("- AUTO_SCALING_GROUP is a supported ResourceNode.type. Include it directly when the user requests an Auto Scaling Group and explain its scaling role in requirementCoverage.");
  }

  return [
    "Amazon Q Architecture Brief:",
    ...dedupeNonEmptyLines(intent),
    ...dedupeNonEmptyLines(requirements),
    ...dedupeNonEmptyLines(flows),
    ...dedupeNonEmptyLines(validation),
    ...dedupeNonEmptyLines(tradeoffs)
  ].join("\n");
}

function findAmazonQPreviewValidationIssues(
  prompt: string,
  preview: AmazonQArchitectureDraftPreview,
  normalizedRequirement: ArchitectureIntentPlan | null
): string[] {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  const architectureJson = preview.architectureJson;
  const nodeTypes = new Set(architectureJson.nodes.map((node) => node.type));
  const issues: string[] = [];

  if (requiresServerlessOnlyArchitecture(normalizedPrompt) && nodeTypes.has("EC2")) {
    issues.push("The user requested serverless or no EC2, but the preview includes EC2. Regenerate without EC2 and use serverless supported resources such as LAMBDA and API_GATEWAY_REST_API when compute is needed.");
  }

  issues.push(...findRequirementCoverageValidationIssues(normalizedPrompt, preview, normalizedRequirement));
  issues.push(...findArchitectureLayoutValidationIssues(architectureJson));

  return issues;
}

function findRequirementCoverageValidationIssues(
  normalizedPrompt: string,
  preview: AmazonQArchitectureDraftPreview,
  normalizedRequirement: ArchitectureIntentPlan | null
): string[] {
  const issues: string[] = [];
  const architectureJson = preview.architectureJson;
  const nodeTypes = new Set(architectureJson.nodes.map((node) => node.type));
  const coverageText = createCoverageSearchText(preview);

  if ((preview.requirementCoverage ?? []).length === 0) {
    issues.push(
      "Requirement coverage missing: every Amazon Q preview must include requirementCoverage entries that map selected answers to capabilities and node ids."
    );
  }

  issues.push(...findRequirementCoverageNodeValidationIssues(preview));

  if (!mentionsPatternDecisionCoverage(coverageText)) {
    issues.push("Requirement coverage missing: Amazon Q must record the selected pattern and rejected/alternative pattern rationale.");
  }

  issues.push(...findExplicitResourceTypeValidationIssues(normalizedPrompt, architectureJson));
  issues.push(...findRequestedResourceQuantityValidationIssues(normalizedPrompt, architectureJson));
  issues.push(...findRuntimeTopologyValidationIssues(normalizedPrompt, architectureJson));
  issues.push(...findNormalizedRequirementValidationIssues(normalizedRequirement, architectureJson));

  if (requiresNoDatabase(normalizedPrompt) && (nodeTypes.has("RDS") || nodeTypes.has("DB_SUBNET_GROUP") || hasForbiddenDatabaseResource(architectureJson))) {
    issues.push("The user selected no database, but the preview includes database resources or database-specific labels/config. Regenerate without database resources.");
  }

  if (hasExplicitDatabaseMarker(normalizedPrompt) && requiresDatabase(normalizedPrompt) && !mentionsDataPersistenceCoverage(coverageText)) {
    issues.push("The user selected a data/database requirement, but requirementCoverage does not prove a data persistence capability or limitation.");
  }

  if (requiresNoBackend(normalizedPrompt) && hasAnyNodeType(nodeTypes, ["EC2", "LAMBDA", "API_GATEWAY_REST_API", "LOAD_BALANCER", "LOAD_BALANCER_LISTENER"])) {
    issues.push("The user selected no backend, but the preview includes backend compute or API entry resources. Remove backend-only resources unless another selected answer explicitly requires them.");
  }

  if (hasNoFileUploadRequirement(normalizedPrompt) && hasForbiddenUploadResource(architectureJson)) {
    issues.push("The user selected no file upload, but the preview includes upload/media/file-upload resources. Remove upload buckets, presigned URL flows, and upload-specific IAM policies.");
  }

  if (hasNoRealtimeRequirement(normalizedPrompt) && hasForbiddenRealtimeResource(preview)) {
    issues.push("The user selected no realtime feature, but the preview includes WebSocket/SSE/realtime/notification-specific resources or coverage. Remove realtime-specific nodes, flows, assumptions, and coverage entries.");
  }

  if (requiresSpaFrontend(normalizedPrompt) && !mentionsFrontendDeliveryCoverage(coverageText)) {
    issues.push("The user selected an SPA frontend, but requirementCoverage does not explain the frontend/static delivery capability.");
  }

  if (hasExplicitComplexBackendMarker(normalizedPrompt) && requiresComplexBackend(normalizedPrompt)) {
    if (!mentionsBackendEntryCoverage(coverageText)) {
      issues.push("The user selected complex backend/business logic, but requirementCoverage does not explain the backend/API entry path and runtime choice.");
    }
  }

  if (requiresGlobalOrFastFrontend(normalizedPrompt) && !mentionsGlobalDeliveryOrLatencyWarning(coverageText)) {
    issues.push("The user selected global users, HTTPS-sensitive delivery, or a 1-second loading goal, but requirementCoverage does not mention global/static delivery or single-region latency warning.");
  }

  if (requiresImageUpload(normalizedPrompt) && !mentionsUploadCoverage(coverageText)) {
    issues.push("The user selected image upload, but requirementCoverage does not prove upload/media handling or a supported substitute.");
  }

  if (requiresRealtime(normalizedPrompt) && !mentionsRealtimePath(coverageText)) {
    issues.push("The user selected realtime chat/notification/data updates, but requirementCoverage does not name a WebSocket, SSE, notification, or realtime path. Add a supported backend/API notification path and coverage entry.");
  }

  if (requiresVeryHighAvailability(normalizedPrompt)) {
    if (!mentionsHighAvailabilityCoverage(coverageText)) {
      issues.push("The user selected 99.99% availability/no downtime, but requirementCoverage does not prove redundancy, high availability, Multi-AZ, failover, or a clear availability trade-off.");
    }
  }

  if (hasBudgetAvailabilityConflict(normalizedPrompt) && !mentionsCostWarningCoverage(coverageText)) {
    issues.push("The user selected a low budget and 99.99% availability, but requirementCoverage does not include a cost warning or budget-risk trade-off.");
  }

  if (requiresKoreaOnlyRegion(normalizedPrompt) && mentionsForbiddenMultiRegionScope(coverageText)) {
    issues.push("The user selected Korea-only scope, but the preview claims or implies multi-region API/database coverage.");
  }

  return issues;
}

function findNormalizedRequirementValidationIssues(
  normalizedRequirement: ArchitectureIntentPlan | null,
  architectureJson: ArchitectureJson,
  options: { readonly validateVisualSpread?: boolean } = {}
): string[] {
  if (normalizedRequirement === null) {
    return [];
  }

  const issues: string[] = [];
  const actualResourceTypes = new Set(architectureJson.nodes.map((node) => node.type));
  const missingResourceTypes = (normalizedRequirement.requiredResources ?? []).filter(
    (resourceType) =>
      !isResourceTypeForbiddenByPlan(normalizedRequirement, resourceType as ResourceType) &&
      !actualResourceTypes.has(resourceType as ResourceType)
  );

  if (missingResourceTypes.length > 0) {
    issues.push(
      `The normalized requirement plan requires supported ResourceNode types that are missing from the preview: ${missingResourceTypes.join(", ")}. Regenerate with visible nodes for each required normalized resource.`
    );
  }

  for (const [resourceType, quantity] of Object.entries(normalizedRequirement.resourceQuantities ?? {})) {
    const requiredResourceType = resourceType as ResourceType;

    if (isResourceTypeForbiddenByPlan(normalizedRequirement, requiredResourceType)) {
      continue;
    }

    const actualCount = architectureJson.nodes.filter((node) => node.type === requiredResourceType).length;

    if (actualCount < quantity) {
      issues.push(
        `The normalized requirement plan requires ${quantity} ${resourceType} node(s), but the preview includes ${actualCount}. Regenerate with enough visible ${resourceType} nodes.`
      );
    }
  }

  const forbiddenCapabilities = new Set(
    (normalizedRequirement.forbiddenCapabilities ?? []).map((capability) => capability.toLowerCase())
  );

  if (forbiddenCapabilities.has("file_upload") && hasForbiddenUploadResource(architectureJson)) {
    issues.push(
      "The normalized requirement plan forbids file upload, but the preview includes upload/media/file-upload resources. Remove upload buckets, media buckets, presigned URL flows, and upload-specific IAM paths."
    );
  }

  if (forbiddenCapabilities.has("realtime") && hasForbiddenRealtimeArchitectureNodes(architectureJson)) {
    issues.push(
      "The normalized requirement plan forbids realtime features, but the preview includes realtime/notification-specific resources, coverage, or assumptions. Remove realtime-specific paths."
    );
  }

  const topology = normalizedRequirement.runtimeTopology;

  if (topology !== undefined) {
    const trafficEntry = topology.trafficEntry?.toUpperCase();
    const compute = topology.compute?.toUpperCase();

    if (trafficEntry === "LOAD_BALANCER" && compute === "EC2" && !hasAlbToEc2TrafficPath(architectureJson)) {
      issues.push(
        "The normalized requirement plan requires ALB traffic to reach EC2 runtime nodes, but the preview does not show a connected ALB/listener -> ASG/target -> EC2 path."
      );
    }

    if (topology.autoScaling === true && compute === "EC2" && !hasAutoScalingGroupToEc2Path(architectureJson)) {
      issues.push(
        "The normalized requirement plan requires Auto Scaling for EC2, but the preview does not connect AUTO_SCALING_GROUP to the EC2 fleet."
      );
    }

    if (compute === "EC2" && topology.computeCount !== undefined) {
      const actualCount = architectureJson.nodes.filter((node) => node.type === "EC2").length;

      if (actualCount < topology.computeCount) {
        issues.push(
          `The normalized requirement plan requires ${topology.computeCount} EC2 runtime node(s), but the preview includes ${actualCount}. Regenerate with enough visible EC2 nodes.`
        );
      }
    }

    if (topology.spreadAcrossPrivateSubnets === true && compute === "EC2") {
      const spread = getEc2SubnetSpread(architectureJson);
      const visualSpread = getEc2VisualPrivateSubnetSpread(architectureJson);

      if (spread.privateSubnetCount < 2 || spread.ec2SubnetCount < 2) {
        issues.push(
          `The normalized requirement plan requires EC2 spread across private subnets, but the preview shows ${spread.ec2SubnetCount} private subnet placement(s) across ${spread.privateSubnetCount} private subnet node(s).`
        );
      }

      if (
        options.validateVisualSpread !== false &&
        visualSpread.privateSubnetCount >= 2 &&
        visualSpread.ec2SubnetCount < 2
      ) {
        issues.push(
          `The normalized requirement plan requires EC2 to be visually spread across private subnets, but the preview places EC2 nodes across only ${visualSpread.ec2SubnetCount} private subnet box(es).`
        );
      }
    }
  }

  return issues;
}

export function createDeterministicArchitectureIntentPlan(prompt: string): ArchitectureIntentPlan | null {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  const requiredResources = new Set<ResourceType>(findExplicitResourceTypesInPrompt(normalizedPrompt));
  const resourceQuantities: Record<string, number> = {};
  const forbiddenCapabilities = new Set<string>();
  const amazonQBrief: string[] = [];
  const quantities = resolveArchitectureResourceQuantities(prompt);
  const fargateRuntime = requiresFargateArchitecture(normalizedPrompt);
  const forbidsEc2Runtime = explicitlyForbidsEc2Runtime(normalizedPrompt) || fargateRuntime;

  if (fargateRuntime) {
    requiredResources.add("ECS_CLUSTER");
    requiredResources.add("ECS_SERVICE");
    requiredResources.add("ECS_TASK_DEFINITION");
    requiredResources.add("ECR_REPOSITORY");
    requiredResources.add("LOAD_BALANCER");
    forbiddenCapabilities.add("ec2_runtime");
    amazonQBrief.push("Use ECS Fargate tasks in private subnets without EC2 capacity resources.");
  } else if (forbidsEc2Runtime) {
    forbiddenCapabilities.add("ec2_runtime");
  }

  if (requiresAlbEc2TrafficPath(normalizedPrompt)) {
    requiredResources.add("LOAD_BALANCER");
    requiredResources.add("EC2");
    amazonQBrief.push("Route user traffic through a visible load balancer path to the EC2 runtime.");
  }

  if (mentionsAutoScalingGroup(normalizedPrompt)) {
    requiredResources.add("AUTO_SCALING_GROUP");
    amazonQBrief.push("Include a visible Auto Scaling Group when autoscaling is requested.");
  }

  if (requiresAutoScalingGroupEc2RuntimePath(normalizedPrompt)) {
    requiredResources.add("AUTO_SCALING_GROUP");
    requiredResources.add("EC2");
  }

  if (requiresEc2PrivateSubnetSplit(normalizedPrompt)) {
    requiredResources.add("EC2");
    amazonQBrief.push("Place EC2 runtime nodes across at least two private subnet boxes, not visually grouped into one subnet.");
  }

  if (forbidsEc2Runtime) {
    for (const resourceType of [
      "EC2",
      "AMI",
      "IAM_INSTANCE_PROFILE",
      "LAUNCH_TEMPLATE",
      "AUTO_SCALING_GROUP",
      "AUTO_SCALING_POLICY",
      "ECS_CAPACITY_PROVIDER"
    ] as const) {
      requiredResources.delete(resourceType);
    }
  }

  if (quantities.ec2Instances > 1 || requiredResources.has("EC2")) {
    resourceQuantities.EC2 = quantities.ec2Instances;
  }

  if (quantities.s3Buckets > 1 && requiredResources.has("S3")) {
    resourceQuantities.S3 = quantities.s3Buckets;
  }

  if (hasNoFileUploadRequirement(normalizedPrompt)) {
    forbiddenCapabilities.add("file_upload");
    amazonQBrief.push("Do not include upload/media/file-upload resources when file upload is excluded.");
  }

  if (hasNoRealtimeRequirement(normalizedPrompt)) {
    forbiddenCapabilities.add("realtime");
    amazonQBrief.push("Do not include realtime, notification, WebSocket, or SSE-specific resources when realtime is excluded.");
  }

  const runtimeTopology = createDeterministicRuntimeTopology(normalizedPrompt, quantities.ec2Instances);
  const plan: ArchitectureIntentPlan = {
    ...(requiredResources.size === 0 ? {} : { requiredResources: [...requiredResources] }),
    ...(Object.keys(resourceQuantities).length === 0 ? {} : { resourceQuantities }),
    ...(forbiddenCapabilities.size === 0 ? {} : { forbiddenCapabilities: [...forbiddenCapabilities] }),
    ...(runtimeTopology === undefined ? {} : { runtimeTopology }),
    ...(requiresKoreaOnlyRegion(normalizedPrompt) ? { region: "ap-northeast-2" } : {}),
    ...(requiresNoDatabase(normalizedPrompt) ? { database: "none" } : requiresDatabase(normalizedPrompt) ? { database: "required" } : {}),
    ...(requiresVeryHighAvailability(normalizedPrompt) ? { availability: "99.99" } : {}),
    ...(amazonQBrief.length === 0 ? {} : { amazonQBrief })
  };

  return Object.keys(plan).length === 0 ? null : plan;
}

function createDeterministicRuntimeTopology(
  normalizedPrompt: string,
  ec2Count: number
): ArchitectureIntentPlan["runtimeTopology"] {
  const topology: NonNullable<ArchitectureIntentPlan["runtimeTopology"]> = {};

  if (requiresFargateArchitecture(normalizedPrompt)) {
    return {
      trafficEntry: "LOAD_BALANCER",
      compute: "ECS_FARGATE",
      placement: "private_subnets",
      autoScaling: true
    };
  }

  if (explicitlyForbidsEc2Runtime(normalizedPrompt) && hasPromptTerm(normalizedPrompt, ["lambda", "serverless", "람다", "서버리스"])) {
    return {
      trafficEntry: "API_GATEWAY_REST_API",
      compute: "LAMBDA"
    };
  }

  if (requiresAlbEc2TrafficPath(normalizedPrompt)) {
    topology.trafficEntry = "LOAD_BALANCER";
    topology.compute = "EC2";
  }

  if (requiresAutoScalingGroupEc2RuntimePath(normalizedPrompt)) {
    topology.compute = "EC2";
    topology.autoScaling = true;
  }

  if (requiresEc2PrivateSubnetSplit(normalizedPrompt)) {
    topology.compute = "EC2";
    topology.placement = "private_subnets";
    topology.spreadAcrossPrivateSubnets = true;
  }

  if (topology.compute === "EC2" && ec2Count > 1) {
    topology.computeCount = ec2Count;
  }

  return Object.keys(topology).length === 0 ? undefined : topology;
}

function mergeArchitectureIntentPlans(
  providerPlan: ArchitectureIntentPlan | null,
  deterministicPlan: ArchitectureIntentPlan | null
): ArchitectureIntentPlan | null {
  if (providerPlan === null) {
    return deterministicPlan;
  }

  if (deterministicPlan === null) {
    return providerPlan;
  }

  const requiredResources = mergeUniqueTextItems(providerPlan.requiredResources, deterministicPlan.requiredResources);
  const patternIds = mergeUniqueTextItems(providerPlan.patternIds, deterministicPlan.patternIds);
  const forbiddenCapabilities = mergeUniqueTextItems(
    providerPlan.forbiddenCapabilities,
    deterministicPlan.forbiddenCapabilities
  );
  const amazonQBrief = mergeUniqueTextItems(providerPlan.amazonQBrief, deterministicPlan.amazonQBrief);
  const resourceQuantities = mergeResourceQuantityPlans(
    providerPlan.resourceQuantities,
    deterministicPlan.resourceQuantities
  );
  const runtimeTopology = sanitizeMergedRuntimeTopology(
    mergeRuntimeTopologyPlans(providerPlan.runtimeTopology, deterministicPlan.runtimeTopology),
    requiredResources,
    forbiddenCapabilities
  );
  const merged: ArchitectureIntentPlan = {
    ...(providerPlan.intent === undefined ? {} : { intent: providerPlan.intent }),
    ...(providerPlan.region === undefined && deterministicPlan.region === undefined
      ? {}
      : { region: deterministicPlan.region ?? providerPlan.region }),
    ...(patternIds.length === 0 ? {} : { patternIds }),
    ...(requiredResources.length === 0 ? {} : { requiredResources }),
    ...(Object.keys(resourceQuantities).length === 0 ? {} : { resourceQuantities }),
    ...(forbiddenCapabilities.length === 0 ? {} : { forbiddenCapabilities }),
    ...(runtimeTopology === undefined ? {} : { runtimeTopology }),
    ...(providerPlan.database === undefined && deterministicPlan.database === undefined
      ? {}
      : { database: deterministicPlan.database ?? providerPlan.database }),
    ...(providerPlan.availability === undefined && deterministicPlan.availability === undefined
      ? {}
      : { availability: deterministicPlan.availability ?? providerPlan.availability }),
    ...(amazonQBrief.length === 0 ? {} : { amazonQBrief })
  };

  return Object.keys(merged).length === 0 ? null : merged;
}

function mergeUniqueTextItems(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined
): string[] {
  const items = new Set<string>();

  for (const item of [...(left ?? []), ...(right ?? [])]) {
    const trimmed = item.trim();

    if (trimmed.length > 0) {
      items.add(trimmed);
    }
  }

  return [...items];
}

function mergeResourceQuantityPlans(
  providerQuantities: Record<string, number> | undefined,
  deterministicQuantities: Record<string, number> | undefined
): Record<string, number> {
  const merged: Record<string, number> = {};

  for (const [resourceType, quantity] of Object.entries(providerQuantities ?? {})) {
    merged[resourceType] = quantity;
  }

  for (const [resourceType, quantity] of Object.entries(deterministicQuantities ?? {})) {
    merged[resourceType] = Math.max(merged[resourceType] ?? 0, quantity);
  }

  return merged;
}

function mergeRuntimeTopologyPlans(
  providerTopology: ArchitectureIntentPlan["runtimeTopology"],
  deterministicTopology: ArchitectureIntentPlan["runtimeTopology"]
): ArchitectureIntentPlan["runtimeTopology"] {
  if (providerTopology === undefined) {
    return deterministicTopology;
  }

  if (deterministicTopology === undefined) {
    return providerTopology;
  }

  return {
    ...providerTopology,
    ...deterministicTopology,
    computeCount:
      providerTopology.computeCount === undefined && deterministicTopology.computeCount === undefined
        ? undefined
        : Math.max(providerTopology.computeCount ?? 0, deterministicTopology.computeCount ?? 0)
  };
}

function sanitizeMergedRuntimeTopology(
  topology: ArchitectureIntentPlan["runtimeTopology"],
  requiredResources: readonly string[],
  forbiddenCapabilities: readonly string[]
): ArchitectureIntentPlan["runtimeTopology"] {
  if (topology === undefined) {
    return undefined;
  }

  const forbidden = new Set(forbiddenCapabilities.map((capability) => capability.toLowerCase()));
  const resources = new Set(requiredResources);
  const sanitized: NonNullable<ArchitectureIntentPlan["runtimeTopology"]> = { ...topology };

  if (forbidden.has("load_balancer") && sanitized.trafficEntry?.toUpperCase() === "LOAD_BALANCER") {
    delete sanitized.trafficEntry;
  }

  if (forbidden.has("ec2_runtime") && sanitized.compute?.toUpperCase() === "EC2") {
    if (resources.has("EKS_CLUSTER")) {
      sanitized.compute = "EKS_CLUSTER";
    } else if (resources.has("ECS_SERVICE") || resources.has("ECS_TASK_DEFINITION")) {
      sanitized.compute = "ECS_FARGATE";
    } else if (resources.has("LAMBDA")) {
      sanitized.compute = "LAMBDA";
    } else {
      delete sanitized.compute;
    }
    delete sanitized.computeCount;
    delete sanitized.spreadAcrossPrivateSubnets;
  }

  return Object.keys(sanitized).length === 0 ? undefined : sanitized;
}

function createAmazonQPlanDraftResult(
  response: AmazonQArchitectureDraftPlan,
  request: CreateArchitectureDraftRequest,
  normalizedRequirement: ArchitectureIntentPlan | null,
  providerMetadata: AiProviderMetadata
): AiArchitectureDraftResult {
  const providerPlanIsCanonical = (response.plan.patternIds?.length ?? 0) > 0;
  const plan = normalizeArchitecturePlanTopologyInvariants(
    reconcileCanonicalProviderPlan(
      providerPlanIsCanonical
        ? response.plan
        : mergeArchitectureIntentPlans(response.plan, normalizedRequirement),
      response.plan
    ),
    request.prompt
  );
  const requestDraft = createArchitectureDraft(request);
  const draft = createArchitectureDraft({
    ...request,
    prompt: createArchitecturePlanMaterializationPrompt(request.prompt, plan)
  });
  const sanitizedArchitectureJson = applyArchitecturePlanExclusions(draft.architectureJson, plan);
  const roleSanitizedArchitectureJson = removeConflictingCanonicalPatternResources(
    sanitizedArchitectureJson,
    plan
  );
  const canonicalArchitectureJson = configureCanonicalPatternResources(
    ensureCanonicalPlanResources(roleSanitizedArchitectureJson, plan),
    plan,
    request.prompt
  );
  const connectedCanonicalArchitectureJson = connectCanonicalPatternTopologies(
    canonicalArchitectureJson,
    plan?.patternIds ?? []
  );
  const architectureJson = connectArchitecturePlanRuntimeTopology(
    connectedCanonicalArchitectureJson,
    plan?.runtimeTopology
  );
  const validationIssues = findMaterializedArchitecturePlanValidationIssues(
    request.prompt,
    plan,
    architectureJson
  );

  if (validationIssues.length > 0) {
    throw new Error(`Amazon Q architecture plan failed materialization: ${validationIssues.join(" ")}`);
  }

  const assumptions = [...(response.assumptions ?? [])];
  const explanations = [...(response.explanations ?? [])];

  return {
    architectureJson,
    title: response.title,
    metadata: {
      ...requestDraft.metadata,
      source: "amazon_q",
      assumptions: assumptions.length === 0 ? requestDraft.metadata.assumptions : assumptions,
      explanations: explanations.length === 0 ? requestDraft.metadata.explanations : explanations
    },
    llmExplanation: {
      target: ARCHITECTURE_DRAFT_TARGET,
      summary: `${response.title} Architecture Draft를 생성했습니다.`,
      highlights: explanations.slice(0, 5),
      nextActions: ["Terraform IaC Preview에서 생성 가능한 설정과 참조를 검토하세요."],
      fallbackUsed: false,
      providerMetadata
    }
  };
}

function normalizeArchitecturePlanTopologyInvariants(
  plan: ArchitectureIntentPlan | null,
  prompt: string
): ArchitectureIntentPlan | null {
  if (plan === null) {
    return plan;
  }

  const patternIds = new Set(plan.patternIds ?? []);
  const usesEc2Pattern = patternIds.has("alb-asg-ec2");
  const topology = plan.runtimeTopology;
  const requiresEc2Spread =
    topology?.compute?.toUpperCase() === "EC2" &&
    topology.spreadAcrossPrivateSubnets === true;

  if (!usesEc2Pattern && !requiresEc2Spread) {
    return plan;
  }

  const hasDatabase = patternIds.has("multi-az-rds");
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  const requiredResources = new Set(plan.requiredResources ?? []);
  const resourceQuantities = { ...(plan.resourceQuantities ?? {}) };
  const computeCount = Math.max(
    2,
    topology?.computeCount ?? 0,
    resourceQuantities.EC2 ?? 0
  );

  if (usesEc2Pattern) {
    for (const resourceType of [
      "VPC",
      "SUBNET",
      "INTERNET_GATEWAY",
      "ELASTIC_IP",
      "NAT_GATEWAY",
      "ROUTE_TABLE",
      "ROUTE_TABLE_ASSOCIATION",
      "SECURITY_GROUP",
      "AMI",
      "IAM_ROLE",
      "IAM_POLICY",
      "IAM_INSTANCE_PROFILE",
      "LAUNCH_TEMPLATE",
      "AUTO_SCALING_GROUP",
      "AUTO_SCALING_POLICY",
      "EC2",
      "CLOUDWATCH_LOG_GROUP",
      "CLOUDWATCH_METRIC_ALARM"
    ]) {
      requiredResources.add(resourceType);
    }

    if (hasDatabase) {
      requiredResources.add("DB_SUBNET_GROUP");
      requiredResources.add("RDS");
      requiredResources.add("SECRETS_MANAGER_SECRET");
    }

    resourceQuantities.SUBNET = Math.max(resourceQuantities.SUBNET ?? 0, hasDatabase ? 6 : 4);
    resourceQuantities.ELASTIC_IP = Math.max(resourceQuantities.ELASTIC_IP ?? 0, 2);
    resourceQuantities.NAT_GATEWAY = Math.max(resourceQuantities.NAT_GATEWAY ?? 0, 2);
    resourceQuantities.ROUTE_TABLE = Math.max(resourceQuantities.ROUTE_TABLE ?? 0, 3);
    resourceQuantities.ROUTE_TABLE_ASSOCIATION = Math.max(
      resourceQuantities.ROUTE_TABLE_ASSOCIATION ?? 0,
      hasDatabase ? 6 : 4
    );
    resourceQuantities.SECURITY_GROUP = Math.max(
      resourceQuantities.SECURITY_GROUP ?? 0,
      hasDatabase ? 3 : 2
    );
    resourceQuantities.CLOUDWATCH_METRIC_ALARM = Math.max(
      resourceQuantities.CLOUDWATCH_METRIC_ALARM ?? 0,
      hasDatabase ? 2 : 1
    );

    if (patternIds.has("spa-cloudfront-s3") && requiresImageUpload(normalizedPrompt)) {
      requiredResources.add("S3");
      resourceQuantities.S3 = Math.max(resourceQuantities.S3 ?? 0, 2);
    }
  }

  resourceQuantities.EC2 = computeCount;

  return {
    ...plan,
    requiredResources: [...requiredResources],
    resourceQuantities,
    runtimeTopology: {
      ...topology,
      ...(usesEc2Pattern
        ? {
            trafficEntry: "LOAD_BALANCER",
            compute: "EC2",
            placement: "private_subnets",
            spreadAcrossPrivateSubnets: true,
            autoScaling: true
          }
        : {}),
      computeCount
    }
  };
}

function reconcileCanonicalProviderPlan(
  mergedPlan: ArchitectureIntentPlan | null,
  providerPlan: ArchitectureIntentPlan
): ArchitectureIntentPlan | null {
  if (mergedPlan === null || (providerPlan.patternIds?.length ?? 0) === 0) {
    return mergedPlan;
  }

  const providerPatternIds = new Set(providerPlan.patternIds ?? []);
  const providerSelectedFargate =
    providerPatternIds.has("ecs-fargate") && !providerPatternIds.has("serverless-api");

  if (!providerSelectedFargate) {
    return mergedPlan;
  }

  const resourceQuantities = { ...(mergedPlan.resourceQuantities ?? {}) };
  for (const resourceType of [
    "API_GATEWAY_REST_API",
    "API_GATEWAY_RESOURCE",
    "API_GATEWAY_METHOD",
    "API_GATEWAY_INTEGRATION",
    "API_GATEWAY_DEPLOYMENT",
    "API_GATEWAY_STAGE",
    "LAMBDA",
    "LAMBDA_PERMISSION"
  ]) {
    delete resourceQuantities[resourceType];
  }

  return {
    ...mergedPlan,
    patternIds: (mergedPlan.patternIds ?? []).filter(
      (patternId) => patternId !== "serverless-api"
    ),
    requiredResources: (mergedPlan.requiredResources ?? []).filter(
      (resourceType) => ![
        "API_GATEWAY_REST_API",
        "API_GATEWAY_RESOURCE",
        "API_GATEWAY_METHOD",
        "API_GATEWAY_INTEGRATION",
        "API_GATEWAY_DEPLOYMENT",
        "API_GATEWAY_STAGE",
        "LAMBDA",
        "LAMBDA_PERMISSION"
      ].includes(resourceType)
    ),
    resourceQuantities,
    runtimeTopology: providerPlan.runtimeTopology ?? mergedPlan.runtimeTopology
  };
}

function applyArchitecturePlanExclusions(
  architectureJson: ArchitectureJson,
  plan: ArchitectureIntentPlan | null
): ArchitectureJson {
  const forbiddenCapabilities = new Set(
    (plan?.forbiddenCapabilities ?? []).map((capability) => capability.toLowerCase())
  );
  const canonicalResourceTypes =
    (plan?.patternIds?.length ?? 0) > 0
      ? new Set(plan?.requiredResources ?? [])
      : null;
  const canonicalNodeCounts = new Map<ResourceType, number>();
  const nodes = architectureJson.nodes.filter((node) => {
    if (canonicalResourceTypes !== null && !canonicalResourceTypes.has(node.type)) {
      return false;
    }

    if (
      forbiddenCapabilities.has("ec2_runtime") &&
      hasAnyNodeType(
        new Set([node.type]),
        [
          "EC2",
          "AMI",
          "IAM_INSTANCE_PROFILE",
          "LAUNCH_TEMPLATE",
          "AUTO_SCALING_GROUP",
          "AUTO_SCALING_POLICY",
          "ECS_CAPACITY_PROVIDER"
        ]
      )
    ) {
      return false;
    }

    if (
      forbiddenCapabilities.has("load_balancer") &&
      ["LOAD_BALANCER", "LOAD_BALANCER_LISTENER", "LOAD_BALANCER_TARGET_GROUP"].includes(
        node.type
      )
    ) {
      return false;
    }

    if (forbiddenCapabilities.has("file_upload") && isForbiddenUploadResourceNode(node)) {
      return false;
    }

    if (forbiddenCapabilities.has("realtime") && isForbiddenRealtimeArchitectureNode(node)) {
      return false;
    }

    if (canonicalResourceTypes !== null) {
      const count = canonicalNodeCounts.get(node.type) ?? 0;
      const maxCount = getCanonicalPlanResourceMaxCount(plan, node.type);

      if (count >= maxCount) {
        return false;
      }

      canonicalNodeCounts.set(node.type, count + 1);
    }

    return true;
  });
  const nodeIds = new Set(nodes.map((node) => node.id));

  return {
    nodes,
    edges: architectureJson.edges.filter(
      (edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId)
    )
  };
}

function findMaterializedArchitecturePlanValidationIssues(
  prompt: string,
  plan: ArchitectureIntentPlan | null,
  architectureJson: ArchitectureJson
): string[] {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  const nodeTypes = new Set(architectureJson.nodes.map((node) => node.type));
  const planForbidsEc2Runtime = (plan?.forbiddenCapabilities ?? []).some(
    (capability) => capability.toLowerCase() === "ec2_runtime"
  );
  const issues = [
    ...findExplicitResourceTypeValidationIssues(normalizedPrompt, architectureJson),
    ...findRequestedResourceQuantityValidationIssues(normalizedPrompt, architectureJson),
    ...(planForbidsEc2Runtime
      ? []
      : findRuntimeTopologyValidationIssues(normalizedPrompt, architectureJson, {
          validateVisualSpread: false
        })),
    ...findNormalizedRequirementValidationIssues(plan, architectureJson, { validateVisualSpread: false }),
    ...findCanonicalPatternMaterializationIssues(plan, architectureJson)
  ];

  if (requiresServerlessOnlyArchitecture(normalizedPrompt) && nodeTypes.has("EC2")) {
    issues.push("The user requested serverless or no EC2, but the materialized plan includes EC2.");
  }

  if (requiresNoDatabase(normalizedPrompt) && hasAnyNodeType(nodeTypes, ["RDS", "DB_SUBNET_GROUP"])) {
    issues.push("The user selected no database, but the materialized plan includes database resources.");
  }

  if (requiresNoBackend(normalizedPrompt) && hasAnyNodeType(nodeTypes, ["EC2", "LAMBDA", "API_GATEWAY_REST_API", "LOAD_BALANCER", "LOAD_BALANCER_LISTENER"])) {
    issues.push("The user selected no backend, but the materialized plan includes backend resources.");
  }

  if (hasNoFileUploadRequirement(normalizedPrompt) && hasForbiddenUploadResource(architectureJson)) {
    issues.push("The user selected no file upload, but the materialized plan includes upload resources.");
  }

  return issues;
}

function findCanonicalPatternMaterializationIssues(
  plan: ArchitectureIntentPlan | null,
  architectureJson: ArchitectureJson
): string[] {
  const patternIds = new Set(plan?.patternIds ?? []);
  const usesRoleAwareEcs =
    patternIds.has("ecs-fargate") &&
    !patternIds.has("serverless-api") &&
    architectureJson.nodes.some(
      (node) => node.type === "ECS_SERVICE" || node.type === "ECS_TASK_DEFINITION"
    );
  const usesRoleAwareEc2 =
    patternIds.has("alb-asg-ec2") &&
    !patternIds.has("serverless-api") &&
    !usesRoleAwareEcs;

  if (usesRoleAwareEc2) {
    return findCanonicalEc2PatternMaterializationIssues(plan, architectureJson);
  }

  if (!usesRoleAwareEcs) {
    return [];
  }

  const issues: string[] = [];
  const nodes = architectureJson.nodes;
  const serializedArchitecture = JSON.stringify(architectureJson).toLowerCase();
  const subnets = nodes.filter((node) => node.type === "SUBNET");
  const publicSubnets = subnets.filter((node) => node.config.tier === "public");
  const privateAppSubnets = subnets.filter((node) => node.config.tier === "private_app");
  const privateDbSubnets = subnets.filter((node) => node.config.tier === "private_db");
  const ecsService = nodes.find((node) => node.type === "ECS_SERVICE");
  const ecsTaskDefinition = nodes.find((node) => node.type === "ECS_TASK_DEFINITION");
  const targetGroup = nodes.find((node) => node.type === "LOAD_BALANCER_TARGET_GROUP");
  const hasLoadBalancer = nodes.some((node) => node.type === "LOAD_BALANCER");
  const ecsRoles = nodes.filter(
    (node) =>
      node.type === "IAM_ROLE" &&
      JSON.stringify(node.config).includes("ecs-tasks.amazonaws.com")
  );

  if (serializedArchitecture.includes("lambda")) {
    issues.push("The Fargate plan contains Lambda-specific resources or configuration.");
  }
  if (
    publicSubnets.length !== 2 ||
    publicSubnets.some((node) => node.config.mapPublicIpOnLaunch !== true)
  ) {
    issues.push("The Fargate ALB requires two correctly configured public subnets.");
  }
  if (
    privateAppSubnets.length !== 2 ||
    privateAppSubnets.some((node) => node.config.mapPublicIpOnLaunch !== false)
  ) {
    issues.push("The Fargate service requires two private application subnets.");
  }
  if (hasLoadBalancer && targetGroup?.config.targetType !== "ip") {
    issues.push("The Fargate target group must use targetType ip.");
  }
  if (
    ecsService?.config.desiredCount !== 2 ||
    !isArchitectureConfigRecord(ecsService.config.networkConfiguration) ||
    ecsService.config.networkConfiguration.assignPublicIp !== false ||
    !Array.isArray(ecsService.config.networkConfiguration.subnets) ||
    ecsService.config.networkConfiguration.subnets.length !== 2 ||
    !isArchitectureConfigRecord(ecsService.config.loadBalancer) ||
    ecsService.config.loadBalancer.containerName !== "app" ||
    ecsService.config.loadBalancer.containerPort !== 8080
  ) {
    issues.push("The Fargate service must run two private tasks without public IPs.");
  }
  if (
    ecsTaskDefinition?.config.networkMode !== "awsvpc" ||
    !Array.isArray(ecsTaskDefinition.config.requiresCompatibilities) ||
    !ecsTaskDefinition.config.requiresCompatibilities.includes("FARGATE")
  ) {
    issues.push("The task definition is not configured for Fargate awsvpc mode.");
  }
  if (ecsRoles.length < 2) {
    issues.push("The Fargate plan requires separate execution and task IAM roles.");
  }

  if (patternIds.has("multi-az-rds")) {
    const dbSubnetGroup = nodes.find((node) => node.type === "DB_SUBNET_GROUP");
    if (
      privateDbSubnets.length !== 2 ||
      privateDbSubnets.some((node) => node.config.mapPublicIpOnLaunch !== false)
    ) {
      issues.push("The Multi-AZ RDS plan requires two private database subnets.");
    }
    if (
      !Array.isArray(dbSubnetGroup?.config.subnetIds) ||
      dbSubnetGroup.config.subnetIds.length !== 2
    ) {
      issues.push("The DB subnet group must reference both private database subnets.");
    }
  }

  return issues;
}

function findCanonicalEc2PatternMaterializationIssues(
  plan: ArchitectureIntentPlan | null,
  architectureJson: ArchitectureJson
): string[] {
  const issues: string[] = [];
  const patternIds = new Set(plan?.patternIds ?? []);
  const nodes = architectureJson.nodes;
  const edges = architectureJson.edges;
  const subnets = nodes.filter((node) => node.type === "SUBNET");
  const publicSubnets = subnets.filter((node) => node.config.tier === "public");
  const privateAppSubnets = subnets.filter((node) => node.config.tier === "private_app");
  const privateDbSubnets = subnets.filter((node) => node.config.tier === "private_db");
  const loadBalancer = nodes.find((node) => node.type === "LOAD_BALANCER");
  const listener = nodes.find((node) => node.type === "LOAD_BALANCER_LISTENER");
  const targetGroup = nodes.find((node) => node.type === "LOAD_BALANCER_TARGET_GROUP");
  const autoScalingGroup = nodes.find((node) => node.type === "AUTO_SCALING_GROUP");
  const launchTemplate = nodes.find((node) => node.type === "LAUNCH_TEMPLATE");
  const cloudFront = nodes.find((node) => node.type === "CLOUDFRONT");
  const expectedPublicSubnetRefs = publicSubnets.map((node) =>
    canonicalTerraformReference("aws_subnet", node.id)
  );
  const expectedPrivateAppSubnetRefs = privateAppSubnets.map((node) =>
    canonicalTerraformReference("aws_subnet", node.id)
  );

  if (
    publicSubnets.length !== 2 ||
    publicSubnets.some(
      (node) =>
        node.config.mapPublicIpOnLaunch !== true ||
        typeof node.config.availabilityZone !== "string"
    ) ||
    new Set(publicSubnets.map((node) => node.config.availabilityZone)).size !== 2
  ) {
    issues.push("The EC2 ALB pattern requires two public subnets in distinct Availability Zones.");
  }
  if (
    privateAppSubnets.length !== 2 ||
    privateAppSubnets.some(
      (node) =>
        node.config.mapPublicIpOnLaunch !== false ||
        typeof node.config.availabilityZone !== "string"
    ) ||
    new Set(privateAppSubnets.map((node) => node.config.availabilityZone)).size !== 2
  ) {
    issues.push("The EC2 ASG pattern requires two private application subnets in distinct Availability Zones.");
  }
  if (nodes.filter((node) => node.type === "NAT_GATEWAY").length !== 2) {
    issues.push("The multi-AZ EC2 pattern requires one NAT Gateway per public Availability Zone.");
  }
  if (
    loadBalancer === undefined ||
    !Array.isArray(loadBalancer.config.subnets) ||
    JSON.stringify(loadBalancer.config.subnets) !== JSON.stringify(expectedPublicSubnetRefs)
  ) {
    issues.push("The internet-facing ALB must use both public subnets.");
  }
  if (
    autoScalingGroup === undefined ||
    !Array.isArray(autoScalingGroup.config.vpcZoneIdentifier) ||
    JSON.stringify(autoScalingGroup.config.vpcZoneIdentifier) !==
      JSON.stringify(expectedPrivateAppSubnetRefs) ||
    !Array.isArray(autoScalingGroup.config.targetGroupArns) ||
    autoScalingGroup.config.targetGroupArns.length !== 1
  ) {
    issues.push("The ASG must span both private application subnets and register with the target group.");
  }
  if (
    launchTemplate === undefined ||
    !isArchitectureConfigRecord(launchTemplate.config.iamInstanceProfile) ||
    !isArchitectureConfigRecord(launchTemplate.config.metadataOptions) ||
    launchTemplate.config.metadataOptions.httpTokens !== "required"
  ) {
    issues.push("The EC2 Launch Template requires an instance profile and IMDSv2.");
  }
  if (
    loadBalancer === undefined ||
    listener === undefined ||
    targetGroup === undefined ||
    autoScalingGroup === undefined ||
    !edges.some((edge) => edge.sourceId === loadBalancer.id && edge.targetId === listener.id) ||
    !edges.some((edge) => edge.sourceId === listener.id && edge.targetId === targetGroup.id) ||
    !edges.some((edge) => edge.sourceId === targetGroup.id && edge.targetId === autoScalingGroup.id)
  ) {
    issues.push("The ALB, listener, target group, and ASG must form one connected traffic path.");
  }
  if (
    cloudFront !== undefined &&
    nodes.some(
      (node) =>
        node.type === "EC2" &&
        edges.some((edge) => edge.sourceId === cloudFront.id && edge.targetId === node.id)
    )
  ) {
    issues.push("CloudFront must not bypass the ALB and route directly to EC2 fleet nodes.");
  }
  const forbidsUpload = (plan?.forbiddenCapabilities ?? []).some(
    (capability) => capability.toLowerCase() === "file_upload"
  );
  if ((plan?.resourceQuantities?.S3 ?? 0) > 1 && !forbidsUpload) {
    const uploadBucket = nodes.find(
      (node) => node.type === "S3" && node.config.bucketPurpose === "user_uploads"
    );
    if (uploadBucket === undefined || uploadBucket.config.publicAccessBlock !== true) {
      issues.push("Image upload requires a private upload-purpose S3 bucket.");
    }
  }
  if (patternIds.has("multi-az-rds")) {
    const database = nodes.find((node) => node.type === "RDS");
    const dbSubnetGroup = nodes.find((node) => node.type === "DB_SUBNET_GROUP");
    if (
      privateDbSubnets.length !== 2 ||
      new Set(privateDbSubnets.map((node) => node.config.availabilityZone)).size !== 2 ||
      !Array.isArray(dbSubnetGroup?.config.subnetIds) ||
      dbSubnetGroup.config.subnetIds.length !== 2 ||
      database?.config.multiAz !== true ||
      database.config.publiclyAccessible !== false
    ) {
      issues.push("The RDS tier must use two private DB subnets and Multi-AZ without public access.");
    }
  }

  return issues;
}

function isArchitectureConfigRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createArchitecturePlanMaterializationPrompt(
  prompt: string,
  plan: ArchitectureIntentPlan | null
): string {
  if (plan === null) {
    return prompt;
  }

  const requiredResources = plan.requiredResources ?? [];
  const quantities = Object.entries(plan.resourceQuantities ?? {});
  const topology = plan.runtimeTopology;
  const lines = [prompt, "Amazon Q selected architecture plan:"];

  if (requiredResources.length > 0) {
    lines.push(`Required resources: ${requiredResources.join(", ")}.`);
  }

  for (const [resourceType, quantity] of quantities) {
    lines.push(`${resourceType} ${quantity} instances required.`);
  }

  if (topology?.compute?.toUpperCase() === "EC2") {
    lines.push("EC2 server runtime required.");
  }

  if (topology !== undefined) {
    lines.push(`Runtime topology: ${JSON.stringify(topology)}.`);
  }

  for (const capability of plan.forbiddenCapabilities ?? []) {
    if (capability.toLowerCase() === "file_upload") {
      lines.push("File upload: none; no file upload resources.");
    } else if (capability.toLowerCase() === "realtime") {
      lines.push("Realtime: none; no realtime resources.");
    }
  }

  if (plan.region !== undefined) {
    lines.push(`Region: ${plan.region}.`);
  }

  if (plan.database !== undefined) {
    lines.push(`Database: ${plan.database}.`);
  }

  if (plan.availability !== undefined) {
    lines.push(`Availability: ${plan.availability}.`);
  }

  return lines.join("\n");
}

function connectArchitecturePlanRuntimeTopology(
  architectureJson: ArchitectureJson,
  topology: ArchitectureIntentPlan["runtimeTopology"]
): ArchitectureJson {
  if (topology === undefined) {
    return architectureJson;
  }

  const edges = [...architectureJson.edges];
  let nodes = [...architectureJson.nodes];
  const loadBalancer = nodes.find((node) => node.type === "LOAD_BALANCER");
  const autoScalingGroup = nodes.find((node) => node.type === "AUTO_SCALING_GROUP");
  const loadBalancerListener = nodes.find((node) => node.type === "LOAD_BALANCER_LISTENER");
  const loadBalancerTargetGroup = nodes.find((node) => node.type === "LOAD_BALANCER_TARGET_GROUP");
  let computeNodes = nodes.filter(
    (node) => node.type === topology.compute?.toUpperCase()
  );

  if (topology.compute?.toUpperCase() === "EC2" && topology.spreadAcrossPrivateSubnets === true) {
    const subnets = nodes
      .filter((node) => node.type === "SUBNET" && /\bprivate\b/iu.test(createNodeSearchText(node)))
      .slice(0, 2);
    const placements = new Map(
      computeNodes.map((node, index) => [node.id, subnets[index % subnets.length]?.id])
    );

    nodes = nodes.map((node) => {
      const subnetId = placements.get(node.id);

      return subnetId === undefined
        ? node
        : { ...node, config: { ...node.config, subnetId } };
    });
    computeNodes = nodes.filter((node) => node.type === "EC2");

    for (const computeNode of computeNodes) {
      const subnetId = typeof computeNode.config.subnetId === "string"
        ? computeNode.config.subnetId
        : undefined;

      if (subnetId !== undefined) {
        addArchitectureEdge(
          edges,
          `canonical-${subnetId}-to-${computeNode.id}`,
          subnetId,
          computeNode.id,
          "contains"
        );
      }
    }
  }

  if (topology.trafficEntry?.toUpperCase() === "LOAD_BALANCER" && loadBalancer !== undefined) {
    if (autoScalingGroup !== undefined && topology.autoScaling === true) {
      const hasStructuredAlbPath =
        loadBalancerListener !== undefined &&
        loadBalancerTargetGroup !== undefined &&
        edges.some(
          (edge) => edge.sourceId === loadBalancer.id && edge.targetId === loadBalancerListener.id
        ) &&
        edges.some(
          (edge) => edge.sourceId === loadBalancerListener.id && edge.targetId === loadBalancerTargetGroup.id
        ) &&
        edges.some(
          (edge) => edge.sourceId === loadBalancerTargetGroup.id && edge.targetId === autoScalingGroup.id
        );

      if (!hasStructuredAlbPath) {
        addArchitectureEdge(edges, "amazon-q-load-balancer-to-auto-scaling-group", loadBalancer.id, autoScalingGroup.id, "routes traffic");
      }
    } else {
      for (const computeNode of computeNodes) {
        addArchitectureEdge(edges, `amazon-q-load-balancer-to-${computeNode.id}`, loadBalancer.id, computeNode.id, "routes traffic");
      }
    }
  }

  if (autoScalingGroup !== undefined && topology.autoScaling === true) {
    for (const computeNode of computeNodes) {
      addArchitectureEdge(edges, `amazon-q-auto-scaling-group-to-${computeNode.id}`, autoScalingGroup.id, computeNode.id, "manages fleet");
    }
  }

  return {
    nodes,
    edges
  };
}

function addArchitectureEdge(
  edges: ArchitectureJson["edges"],
  id: string,
  sourceId: string,
  targetId: string,
  label: string
): void {
  if (edges.some((edge) => edge.sourceId === sourceId && edge.targetId === targetId)) {
    return;
  }

  edges.push({ id, sourceId, targetId, label });
}

function findRuntimeTopologyValidationIssues(
  normalizedPrompt: string,
  architectureJson: ArchitectureJson,
  options: { readonly validateVisualSpread?: boolean } = {}
): string[] {
  const issues: string[] = [];

  if (
    !explicitlyForbidsEc2Runtime(normalizedPrompt) &&
    requiresAlbEc2TrafficPath(normalizedPrompt) &&
    !hasAlbToEc2TrafficPath(architectureJson)
  ) {
    issues.push(
      "The user requested EC2 runtime behind an ALB, but the preview does not connect LOAD_BALANCER/LOAD_BALANCER_LISTENER through Auto Scaling or target resources to EC2 nodes. Regenerate with a visible ALB -> ASG/target group -> EC2 traffic path."
    );
  }

  if (
    !explicitlyForbidsEc2Runtime(normalizedPrompt) &&
    requiresAutoScalingGroupEc2RuntimePath(normalizedPrompt) &&
    !hasAutoScalingGroupToEc2Path(architectureJson)
  ) {
    issues.push(
      "The user requested an Auto Scaling Group, but the preview does not connect AUTO_SCALING_GROUP to the EC2 fleet. Regenerate with ASG visibly managing or scaling the EC2 nodes."
    );
  }

  if (!explicitlyForbidsEc2Runtime(normalizedPrompt) && requiresEc2PrivateSubnetSplit(normalizedPrompt)) {
    const spread = getEc2SubnetSpread(architectureJson);
    const visualSpread = getEc2VisualPrivateSubnetSpread(architectureJson);

    if (spread.privateSubnetCount < 2 || spread.ec2SubnetCount < 2) {
      issues.push(
        `The user requested EC2 instances split across two private subnets, but the preview shows ${spread.ec2SubnetCount} private subnet placement(s) for EC2 across ${spread.privateSubnetCount} private subnet node(s). Regenerate with EC2 nodes distributed across at least two private app subnets.`
      );
    }

    if (
      options.validateVisualSpread !== false &&
      visualSpread.privateSubnetCount >= 2 &&
      visualSpread.ec2SubnetCount < 2
    ) {
      issues.push(
        `The user requested EC2 instances split across two private subnets, but the preview visually places EC2 nodes across only ${visualSpread.ec2SubnetCount} private subnet box(es). Regenerate with EC2 nodes visually placed across at least two private app subnets, not grouped inside one subnet/security-group area.`
      );
    }
  }

  return issues;
}

function findExplicitResourceTypeValidationIssues(
  normalizedPrompt: string,
  architectureJson: ArchitectureJson
): string[] {
  const requestedResourceTypes = findExplicitResourceTypesInPrompt(normalizedPrompt).filter(
    (resourceType) =>
      !explicitlyForbidsEc2Runtime(normalizedPrompt) ||
      ![
        "EC2",
        "AMI",
        "IAM_INSTANCE_PROFILE",
        "LAUNCH_TEMPLATE",
        "AUTO_SCALING_GROUP",
        "AUTO_SCALING_POLICY",
        "ECS_CAPACITY_PROVIDER"
      ].includes(resourceType)
  );
  const actualResourceTypes = new Set(architectureJson.nodes.map((node) => node.type));
  const missingResourceTypes = requestedResourceTypes.filter((resourceType) => !actualResourceTypes.has(resourceType));

  if (missingResourceTypes.length === 0) {
    return [];
  }

  return [
    `The user explicitly requested supported resource-panel types that are missing from the preview: ${missingResourceTypes.join(", ")}. Regenerate with visible ResourceNode entries for each missing type.`
  ];
}

function findRequestedResourceQuantityValidationIssues(
  normalizedPrompt: string,
  architectureJson: ArchitectureJson
): string[] {
  const requestedQuantities = resolveArchitectureResourceQuantities(normalizedPrompt);
  const ec2NodeCount = architectureJson.nodes.filter((node) => node.type === "EC2").length;

  if (requestedQuantities.ec2Instances <= 1 || ec2NodeCount >= requestedQuantities.ec2Instances) {
    return [];
  }

  return [
    `The user requested ${requestedQuantities.ec2Instances} EC2 instances, but the preview includes only ${ec2NodeCount}. Regenerate with at least ${requestedQuantities.ec2Instances} visible EC2 ResourceNode entries.`
  ];
}

function hasAlbToEc2TrafficPath(architectureJson: ArchitectureJson): boolean {
  return hasPathBetweenNodeTypes(
    architectureJson,
    ["LOAD_BALANCER", "LOAD_BALANCER_LISTENER"],
    ["EC2"],
    ["LOAD_BALANCER", "LOAD_BALANCER_LISTENER", "LOAD_BALANCER_TARGET_GROUP", "LOAD_BALANCER_TARGET_GROUP_ATTACHMENT", "AUTO_SCALING_GROUP", "EC2"],
    4
  );
}

function hasAutoScalingGroupToEc2Path(architectureJson: ArchitectureJson): boolean {
  return hasPathBetweenNodeTypes(
    architectureJson,
    ["AUTO_SCALING_GROUP"],
    ["EC2"],
    ["LOAD_BALANCER", "LOAD_BALANCER_LISTENER", "LOAD_BALANCER_TARGET_GROUP", "LOAD_BALANCER_TARGET_GROUP_ATTACHMENT", "AUTO_SCALING_GROUP", "EC2", "LAUNCH_TEMPLATE"],
    3
  );
}

function hasPathBetweenNodeTypes(
  architectureJson: ArchitectureJson,
  sourceTypes: readonly ResourceType[],
  targetTypes: readonly ResourceType[],
  allowedTypes: readonly ResourceType[],
  maxDepth: number
): boolean {
  const allowedTypeSet = new Set(allowedTypes);
  const targetTypeSet = new Set(targetTypes);
  const nodesById = new Map(architectureJson.nodes.map((node) => [node.id, node]));
  const adjacency = createUndirectedAdjacency(architectureJson.edges);
  const startNodeIds = architectureJson.nodes
    .filter((node) => sourceTypes.includes(node.type))
    .map((node) => node.id);

  for (const startNodeId of startNodeIds) {
    const queue: Array<{ readonly nodeId: string; readonly depth: number }> = [{ nodeId: startNodeId, depth: 0 }];
    const visited = new Set<string>([startNodeId]);

    while (queue.length > 0) {
      const current = queue.shift();

      if (!current) {
        continue;
      }

      const currentNode = nodesById.get(current.nodeId);

      if (current.depth > 0 && currentNode && targetTypeSet.has(currentNode.type)) {
        return true;
      }

      if (current.depth >= maxDepth) {
        continue;
      }

      for (const nextNodeId of adjacency.get(current.nodeId) ?? []) {
        if (visited.has(nextNodeId)) {
          continue;
        }

        const nextNode = nodesById.get(nextNodeId);

        if (!nextNode || !allowedTypeSet.has(nextNode.type)) {
          continue;
        }

        visited.add(nextNodeId);
        queue.push({ nodeId: nextNodeId, depth: current.depth + 1 });
      }
    }
  }

  return false;
}

function createUndirectedAdjacency(
  edges: readonly ArchitectureJson["edges"][number][]
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  for (const edge of edges) {
    addAdjacentNode(adjacency, edge.sourceId, edge.targetId);
    addAdjacentNode(adjacency, edge.targetId, edge.sourceId);
  }

  return adjacency;
}

function addAdjacentNode(adjacency: Map<string, Set<string>>, sourceId: string, targetId: string): void {
  const adjacentNodeIds = adjacency.get(sourceId) ?? new Set<string>();

  adjacentNodeIds.add(targetId);
  adjacency.set(sourceId, adjacentNodeIds);
}

function getEc2SubnetSpread(architectureJson: ArchitectureJson): {
  readonly ec2SubnetCount: number;
  readonly privateSubnetCount: number;
} {
  const nodesById = new Map(architectureJson.nodes.map((node) => [node.id, node]));
  const privateSubnetIds = new Set(
    architectureJson.nodes
      .filter((node) => node.type === "SUBNET" && /\bprivate\b|프라이빗|사설/iu.test(createNodeSearchText(node)))
      .map((node) => node.id)
  );
  const ec2SubnetIds = new Set<string>();

  for (const node of architectureJson.nodes) {
    if (node.type !== "EC2") {
      continue;
    }

    for (const subnetId of findAssociatedSubnetIds(node, architectureJson, nodesById)) {
      if (privateSubnetIds.has(subnetId)) {
        ec2SubnetIds.add(subnetId);
      }
    }
  }

  return {
    ec2SubnetCount: ec2SubnetIds.size,
    privateSubnetCount: privateSubnetIds.size
  };
}

function getEc2VisualPrivateSubnetSpread(architectureJson: ArchitectureJson): {
  readonly ec2SubnetCount: number;
  readonly privateSubnetCount: number;
} {
  const privateSubnetNodes = architectureJson.nodes.filter(
    (node) => node.type === "SUBNET" && /\bprivate\b|프라이빗|사설/iu.test(createNodeSearchText(node))
  );
  const ec2SubnetIds = new Set<string>();

  for (const node of architectureJson.nodes) {
    if (node.type !== "EC2") {
      continue;
    }

    const center = getPreviewNodeCenter(node);

    for (const subnetNode of privateSubnetNodes) {
      if (pointInRect(center, createPreviewNodeRect(subnetNode))) {
        ec2SubnetIds.add(subnetNode.id);
      }
    }
  }

  return {
    ec2SubnetCount: ec2SubnetIds.size,
    privateSubnetCount: privateSubnetNodes.length
  };
}

function findAssociatedSubnetIds(
  node: ArchitectureJson["nodes"][number],
  architectureJson: ArchitectureJson,
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>
): string[] {
  const subnetIds = new Set<string>();
  const configSubnetNode = findConfigAreaNodeByKey(node, "subnetId", nodesById);

  if (configSubnetNode?.type === "SUBNET") {
    subnetIds.add(configSubnetNode.id);
  }

  for (const edge of architectureJson.edges) {
    const candidateNodeId =
      edge.sourceId === node.id ? edge.targetId : edge.targetId === node.id ? edge.sourceId : null;

    if (!candidateNodeId) {
      continue;
    }

    const candidateNode = nodesById.get(candidateNodeId);

    if (candidateNode?.type === "SUBNET") {
      subnetIds.add(candidateNode.id);
    }
  }

  const nodeRect = createPreviewNodeRect(node);

  for (const candidateNode of nodesById.values()) {
    if (candidateNode.type !== "SUBNET") {
      continue;
    }

    if (rectContains(createPreviewNodeRect(candidateNode), nodeRect)) {
      subnetIds.add(candidateNode.id);
    }
  }

  return [...subnetIds];
}

function findExplicitResourceTypesInPrompt(normalizedPrompt: string): ResourceType[] {
  const normalizedSearchText = normalizeResourceSearchText(normalizedPrompt);
  const compactSearchText = normalizedSearchText.replaceAll(" ", "");
  const resourceTypes = new Set<ResourceType>();

  for (const definition of SUPPORTED_RESOURCE_CATALOG) {
    if (
      createResourcePromptAliases(definition).some(
        (alias) =>
          !resourcePromptExplicitlyForbidsType(normalizedPrompt, definition.nodeType) &&
          resourceSearchTextIncludesAlias(normalizedSearchText, compactSearchText, alias)
      )
    ) {
      resourceTypes.add(definition.nodeType);
    }
  }

  return [...resourceTypes];
}

function resourcePromptExplicitlyForbidsType(
  normalizedPrompt: string,
  resourceType: ResourceType
): boolean {
  if (resourceType === "EC2") {
    return (
      /(?:(?:\b(?:no|without|exclude)\b)|do\s+not\s+use)[^.\n]{0,48}ec2/iu.test(normalizedPrompt) ||
      /ec2[^.\n]{0,96}(?:not\s+needed|do\s+not\s+use|필요\s*없|사용하지\s*않|제외)/iu.test(
        normalizedPrompt
      )
    );
  }

  return (
    resourceType === "LOAD_BALANCER" &&
    (/(?:(?:\b(?:no|without|exclude)\b)|do\s+not\s+use)[^.\n]{0,48}(?:alb|load\s+balancer)/iu.test(
      normalizedPrompt
    ) ||
      /(?:alb|load\s+balancer|로드\s*밸런서|외부\s*트래픽)[^.\n]{0,96}(?:not\s+needed|do\s+not\s+use|필요\s*없|사용하지\s*않|제외)/iu.test(
        normalizedPrompt
      ))
  );
}

function resourceSearchTextIncludesAlias(
  normalizedSearchText: string,
  compactSearchText: string,
  alias: string
): boolean {
  const normalizedAlias = normalizeResourceSearchText(alias);

  if (normalizedAlias.length === 0) {
    return false;
  }

  if (normalizedAlias === "s3") {
    return new RegExp("(^|\\s)s3($|\\s)", "u").test(normalizedSearchText);
  }

  if (!normalizedAlias.includes(" ") && normalizedAlias.length <= 3) {
    return new RegExp(`(^|\\s)${escapeRegExp(normalizedAlias)}($|\\s)`, "u").test(normalizedSearchText);
  }

  return (
    normalizedSearchText.includes(normalizedAlias) ||
    compactSearchText.includes(normalizedAlias.replaceAll(" ", ""))
  );
}

function createResourcePromptAliases(definition: (typeof SUPPORTED_RESOURCE_CATALOG)[number]): string[] {
  const terraformName = definition.terraformResourceType.replace(/^aws_/u, "").replaceAll("_", " ");
  const catalogName = definition.id.replace(/^aws-/u, "").replaceAll("-", " ");
  const aliases = [
    definition.displayName,
    definition.id,
    catalogName,
    definition.nodeType,
    definition.nodeType.replaceAll("_", " "),
    definition.terraformResourceType,
    terraformName
  ];

  switch (definition.nodeType) {
    case "S3":
      aliases.push("s3", "s3 bucket", "artifact bucket");
      break;
    case "IAM_ROLE":
      aliases.push("iam role", "service role");
      break;
    case "EC2":
      aliases.push("ec2", "ec2 instance", "ec2 instances");
      break;
    case "AUTO_SCALING_GROUP":
      aliases.push("auto scaling group", "autoscaling group", "asg");
      break;
    case "LOAD_BALANCER":
      aliases.push("application load balancer", "load balancer", "alb");
      break;
    case "API_GATEWAY_REST_API":
      aliases.push("api gateway", "rest api gateway");
      break;
    case "ECR_REPOSITORY":
      aliases.push("ecr", "ecr repository", "container registry");
      break;
    case "ECS_CLUSTER":
      aliases.push("ecs cluster", "fargate cluster");
      break;
    case "ECS_SERVICE":
      aliases.push("ecs service", "fargate service", "ecs fargate", "fargate runtime");
      break;
    case "ECS_TASK_DEFINITION":
      aliases.push("ecs task definition", "task definition", "fargate task");
      break;
    case "CODEBUILD_PROJECT":
      aliases.push("codebuild project", "code build project");
      break;
    case "CODEDEPLOY_APP":
      aliases.push("codedeploy app", "code deploy app");
      break;
    case "CODEDEPLOY_DEPLOYMENT_GROUP":
      aliases.push("codedeploy deployment group", "code deploy deployment group");
      break;
    case "CODEPIPELINE":
      aliases.push("codepipeline", "code pipeline");
      break;
    case "CODESTAR_CONNECTION":
      aliases.push("codestar connection", "code star connection", "codestarconnections connection");
      break;
    default:
      break;
  }

  return aliases;
}

function normalizeResourceSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/[^a-z0-9가-힣]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findArchitectureLayoutValidationIssues(architectureJson: ArchitectureJson): string[] {
  const nodesById = new Map(architectureJson.nodes.map((node) => [node.id, node]));
  const rectsByNodeId = new Map(architectureJson.nodes.map((node) => [node.id, createPreviewNodeRect(node)]));
  const parentAreaNodeIds = new Map<string, string>();
  const issues: string[] = [];

  for (const node of architectureJson.nodes) {
    const parentAreaNodeId = findExpectedParentAreaNodeId(node, nodesById, architectureJson.edges);

    if (parentAreaNodeId) {
      parentAreaNodeIds.set(node.id, parentAreaNodeId);
    }
  }

  for (const [nodeId, parentAreaNodeId] of parentAreaNodeIds) {
    const node = nodesById.get(nodeId);
    const parentNode = nodesById.get(parentAreaNodeId);
    const nodeRect = rectsByNodeId.get(nodeId);
    const parentRect = rectsByNodeId.get(parentAreaNodeId);

    if (!node || !parentNode || !nodeRect || !parentRect || rectContains(parentRect, nodeRect)) {
      continue;
    }

    issues.push(
      `Layout violation: ${node.id} (${node.type}) must be fully inside parent area ${parentNode.id} (${parentNode.type}), but its coordinates are outside or only partially inside.`
    );
  }

  const areaNodes = architectureJson.nodes.filter((node) => PREVIEW_AREA_RESOURCE_TYPES.has(node.type));

  for (let leftIndex = 0; leftIndex < areaNodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < areaNodes.length; rightIndex += 1) {
      const leftNode = areaNodes[leftIndex];
      const rightNode = areaNodes[rightIndex];

      if (!leftNode || !rightNode) {
        continue;
      }

      const leftRect = rectsByNodeId.get(leftNode.id);
      const rightRect = rectsByNodeId.get(rightNode.id);

      if (!leftRect || !rightRect || !rectsOverlap(leftRect, rightRect)) {
        continue;
      }

      if (rectContains(leftRect, rightRect)) {
        if (!hasAncestorAreaNode(leftNode.id, rightNode.id, parentAreaNodeIds)) {
          issues.push(
            `Layout violation: area box ${rightNode.id} (${rightNode.type}) is visually inside ${leftNode.id} (${leftNode.type}) without a containment relationship. Add the correct parent reference or separate the areas.`
          );
        }

        continue;
      }

      if (rectContains(rightRect, leftRect)) {
        if (!hasAncestorAreaNode(rightNode.id, leftNode.id, parentAreaNodeIds)) {
          issues.push(
            `Layout violation: area box ${leftNode.id} (${leftNode.type}) is visually inside ${rightNode.id} (${rightNode.type}) without a containment relationship. Add the correct parent reference or separate the areas.`
          );
        }

        continue;
      }

      issues.push(
        `Layout violation: area boxes ${leftNode.id} (${leftNode.type}) and ${rightNode.id} (${rightNode.type}) overlap without full containment. Make one fully contain the other only when semantically related, otherwise separate them.`
      );
    }
  }

  for (const node of architectureJson.nodes) {
    if (PREVIEW_AREA_RESOURCE_TYPES.has(node.type) || PREVIEW_BOUNDARY_RESOURCE_TYPES.has(node.type)) {
      continue;
    }

    const nodeRect = rectsByNodeId.get(node.id);

    if (!nodeRect) {
      continue;
    }

    for (const areaNode of areaNodes) {
      if (hasAncestorAreaNode(areaNode.id, node.id, parentAreaNodeIds)) {
        continue;
      }

      const areaRect = rectsByNodeId.get(areaNode.id);

      if (!areaRect || !rectsOverlap(areaRect, nodeRect)) {
        continue;
      }

      if (rectContains(areaRect, nodeRect)) {
        issues.push(
          `Layout violation: ${node.id} (${node.type}) is visually inside area ${areaNode.id} (${areaNode.type}) without a containment reference. Add the correct parent reference or place it outside.`
        );

        continue;
      }

      issues.push(
        `Layout violation: ${node.id} (${node.type}) partially overlaps area ${areaNode.id} (${areaNode.type}) without being contained. Place it fully outside that area or add the correct containment reference.`
      );
    }
  }

  const readableNodes = architectureJson.nodes.filter((node) => !PREVIEW_AREA_RESOURCE_TYPES.has(node.type));
  const visualRectsByNodeId = new Map(
    readableNodes.map((node) => [node.id, createPreviewNodeVisualBoundsRect(node)])
  );

  for (let leftIndex = 0; leftIndex < readableNodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < readableNodes.length; rightIndex += 1) {
      const leftNode = readableNodes[leftIndex];
      const rightNode = readableNodes[rightIndex];

      if (!leftNode || !rightNode) {
        continue;
      }

      const leftRect = visualRectsByNodeId.get(leftNode.id);
      const rightRect = visualRectsByNodeId.get(rightNode.id);

      if (!leftRect || !rightRect || !rectsOverlap(leftRect, rightRect)) {
        continue;
      }

      issues.push(
        `Layout violation: nodes ${leftNode.id} (${leftNode.type}) and ${rightNode.id} (${rightNode.type}) have overlapping visual or label bounds. Separate their coordinates so icons, labels, and edge labels remain readable.`
      );
    }
  }

  for (const edge of architectureJson.edges) {
    if (isPreviewParentEdge(edge)) {
      continue;
    }

    const sourceNode = nodesById.get(edge.sourceId);
    const targetNode = nodesById.get(edge.targetId);

    if (!sourceNode || !targetNode) {
      continue;
    }

    const sourceCenter = getPreviewNodeCenter(sourceNode);
    const targetCenter = getPreviewNodeCenter(targetNode);

    for (const node of architectureJson.nodes) {
      if (node.id === sourceNode.id || node.id === targetNode.id || PREVIEW_AREA_RESOURCE_TYPES.has(node.type)) {
        continue;
      }

      const nodeRect = rectsByNodeId.get(node.id);

      if (!nodeRect || !lineSegmentIntersectsRect(sourceCenter, targetCenter, nodeRect)) {
        continue;
      }

      issues.push(
        `Layout violation: visible edge ${edge.id} from ${sourceNode.id} to ${targetNode.id} has an edge path crosses unrelated resource ${node.id} (${node.type}). Move unrelated resources away from the arrow path or reroute by changing coordinates.`
      );
    }
  }

  return issues.slice(0, 8);
}

function hasAncestorAreaNode(
  ancestorAreaNodeId: string,
  nodeId: string,
  parentAreaNodeIds: ReadonlyMap<string, string>
): boolean {
  let parentAreaNodeId = parentAreaNodeIds.get(nodeId);
  const visitedNodeIds = new Set<string>();

  while (parentAreaNodeId) {
    if (parentAreaNodeId === ancestorAreaNodeId) {
      return true;
    }

    if (visitedNodeIds.has(parentAreaNodeId)) {
      return false;
    }

    visitedNodeIds.add(parentAreaNodeId);
    parentAreaNodeId = parentAreaNodeIds.get(parentAreaNodeId);
  }

  return false;
}

function findExpectedParentAreaNodeId(
  node: ArchitectureJson["nodes"][number],
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>,
  edges: readonly ArchitectureJson["edges"][number][]
): string | undefined {
  if (node.type === "SECURITY_GROUP") {
    const protectedSubnet = findProtectedSubnetAreaNode(node, nodesById);

    if (protectedSubnet) {
      return protectedSubnet.id;
    }
  }

  const securityGroupParent = findReferencedSecurityGroupAreaNodes(node, nodesById)[0];

  if (securityGroupParent) {
    return securityGroupParent.id;
  }

  const subnetParent = findConfigAreaNodeByKey(node, "subnetId", nodesById);

  if (subnetParent && subnetParent.id !== node.id) {
    return subnetParent.id;
  }

  const vpcParent = findConfigAreaNodeByKey(node, "vpcId", nodesById);

  if (vpcParent && vpcParent.id !== node.id) {
    return vpcParent.id;
  }

  return findEdgeParentAreaNode(node, nodesById, edges)?.id;
}

function findProtectedSubnetAreaNode(
  securityGroupNode: ArchitectureJson["nodes"][number],
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>
): ArchitectureJson["nodes"][number] | undefined {
  for (const node of nodesById.values()) {
    if (node.id === securityGroupNode.id || !referencesSecurityGroup(node, securityGroupNode, nodesById)) {
      continue;
    }

    const subnetNode = findConfigAreaNodeByKey(node, "subnetId", nodesById);

    if (subnetNode) {
      return subnetNode;
    }
  }

  return undefined;
}

function referencesSecurityGroup(
  node: ArchitectureJson["nodes"][number],
  securityGroupNode: ArchitectureJson["nodes"][number],
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>
): boolean {
  return SECURITY_GROUP_REFERENCE_KEYS.flatMap((key) => getStringConfigValues(node, key)).some((referenceValue) => {
    const referencedNode = findReferencedArchitectureNode(referenceValue, nodesById);

    return referencedNode?.id === securityGroupNode.id;
  });
}

function findReferencedSecurityGroupAreaNodes(
  node: ArchitectureJson["nodes"][number],
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>
): ArchitectureJson["nodes"][number][] {
  return SECURITY_GROUP_REFERENCE_KEYS.flatMap((key) => getStringConfigValues(node, key))
    .map((referenceValue) => findReferencedArchitectureNode(referenceValue, nodesById))
    .filter((referencedNode): referencedNode is ArchitectureJson["nodes"][number] => {
      return referencedNode !== undefined && referencedNode.type === "SECURITY_GROUP";
    });
}

function findConfigAreaNodeByKey(
  node: ArchitectureJson["nodes"][number],
  key: string,
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>
): ArchitectureJson["nodes"][number] | undefined {
  const referencedNode = findConfigNodeByKey(node, key, nodesById);

  return referencedNode && PREVIEW_AREA_RESOURCE_TYPES.has(referencedNode.type) ? referencedNode : undefined;
}

function findConfigNodeByKey(
  node: ArchitectureJson["nodes"][number],
  key: string,
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>
): ArchitectureJson["nodes"][number] | undefined {
  const referenceValue = getStringConfigValue(node, key);

  return referenceValue ? findReferencedArchitectureNode(referenceValue, nodesById) : undefined;
}

function findReferencedArchitectureNode(
  rawReferenceValue: string,
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>
): ArchitectureJson["nodes"][number] | undefined {
  const referenceValue = normalizeReferenceValue(rawReferenceValue);
  const directNode = nodesById.get(referenceValue);

  if (directNode) {
    return directNode;
  }

  for (const node of nodesById.values()) {
    if (matchesTerraformArchitectureNodeReference(referenceValue, node)) {
      return node;
    }
  }

  return undefined;
}

function matchesTerraformArchitectureNodeReference(
  referenceValue: string,
  node: ArchitectureJson["nodes"][number]
): boolean {
  const terraformResourceType = RESOURCE_TYPE_TERRAFORM_NAMES[node.type];

  if (!terraformResourceType) {
    return false;
  }

  const resourceNames = new Set([node.id, getStringConfigValue(node, "terraformResourceName")].filter(Boolean));
  const references = [...resourceNames].flatMap((resourceName) => {
    return TERRAFORM_REFERENCE_ATTRIBUTE_SUFFIXES.map((suffix) => `${terraformResourceType}.${resourceName}.${suffix}`);
  });

  return references.includes(referenceValue);
}

function findEdgeParentAreaNode(
  node: ArchitectureJson["nodes"][number],
  nodesById: ReadonlyMap<string, ArchitectureJson["nodes"][number]>,
  edges: readonly ArchitectureJson["edges"][number][]
): ArchitectureJson["nodes"][number] | undefined {
  for (const edge of edges) {
    if (edge.targetId !== node.id || !isPreviewParentEdge(edge)) {
      continue;
    }

    const sourceNode = nodesById.get(edge.sourceId);

    if (sourceNode && sourceNode.id !== node.id && PREVIEW_AREA_RESOURCE_TYPES.has(sourceNode.type)) {
      return sourceNode;
    }
  }

  return undefined;
}

function isPreviewParentEdge(edge: ArchitectureJson["edges"][number]): boolean {
  return typeof edge.label === "string" && PREVIEW_PARENT_EDGE_LABELS.has(edge.label.trim().toLowerCase());
}

function createPreviewNodeRect(node: ArchitectureJson["nodes"][number]): LayoutRect {
  const size = PREVIEW_NODE_LAYOUT_SIZES[node.type] ?? DEFAULT_PREVIEW_NODE_SIZE;

  return {
    left: node.positionX,
    top: node.positionY,
    right: node.positionX + size.width,
    bottom: node.positionY + size.height
  };
}

function createPreviewNodeVisualBoundsRect(node: ArchitectureJson["nodes"][number]): LayoutRect {
  const iconRect = createPreviewNodeRect(node);
  const label = typeof node.label === "string" && node.label.trim() ? node.label.trim() : node.id;
  const labelWidth = Math.min(
    PREVIEW_LABEL_MAX_WIDTH,
    Math.max(iconRect.right - iconRect.left, label.length * PREVIEW_LABEL_CHARACTER_WIDTH + PREVIEW_LABEL_HORIZONTAL_PADDING)
  );
  const centerX = (iconRect.left + iconRect.right) / 2;

  return {
    left: centerX - labelWidth / 2 - PREVIEW_VISUAL_BOUNDS_HORIZONTAL_MARGIN,
    top: iconRect.top - PREVIEW_VISUAL_BOUNDS_VERTICAL_MARGIN,
    right: centerX + labelWidth / 2 + PREVIEW_VISUAL_BOUNDS_HORIZONTAL_MARGIN,
    bottom: iconRect.bottom + PREVIEW_LABEL_HEIGHT + PREVIEW_VISUAL_BOUNDS_VERTICAL_MARGIN
  };
}

function getPreviewNodeCenter(node: ArchitectureJson["nodes"][number]): { readonly x: number; readonly y: number } {
  const size = PREVIEW_NODE_LAYOUT_SIZES[node.type] ?? DEFAULT_PREVIEW_NODE_SIZE;

  return {
    x: node.positionX + size.width / 2,
    y: node.positionY + size.height / 2
  };
}

function rectContains(parent: LayoutRect, child: LayoutRect): boolean {
  return (
    child.left >= parent.left &&
    child.top >= parent.top &&
    child.right <= parent.right &&
    child.bottom <= parent.bottom
  );
}

function rectsOverlap(left: LayoutRect, right: LayoutRect): boolean {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

function lineSegmentIntersectsRect(
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
  rect: LayoutRect
): boolean {
  if (pointInRect(start, rect) || pointInRect(end, rect)) {
    return true;
  }

  return (
    lineSegmentsIntersect(start, end, { x: rect.left, y: rect.top }, { x: rect.right, y: rect.top }) ||
    lineSegmentsIntersect(start, end, { x: rect.right, y: rect.top }, { x: rect.right, y: rect.bottom }) ||
    lineSegmentsIntersect(start, end, { x: rect.right, y: rect.bottom }, { x: rect.left, y: rect.bottom }) ||
    lineSegmentsIntersect(start, end, { x: rect.left, y: rect.bottom }, { x: rect.left, y: rect.top })
  );
}

function pointInRect(point: { readonly x: number; readonly y: number }, rect: LayoutRect): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function lineSegmentsIntersect(
  aStart: { readonly x: number; readonly y: number },
  aEnd: { readonly x: number; readonly y: number },
  bStart: { readonly x: number; readonly y: number },
  bEnd: { readonly x: number; readonly y: number }
): boolean {
  const denominator =
    (aStart.x - aEnd.x) * (bStart.y - bEnd.y) - (aStart.y - aEnd.y) * (bStart.x - bEnd.x);

  if (denominator === 0) {
    return false;
  }

  const aNumerator =
    (aStart.x - bStart.x) * (bStart.y - bEnd.y) - (aStart.y - bStart.y) * (bStart.x - bEnd.x);
  const bNumerator =
    (aStart.x - bStart.x) * (aStart.y - aEnd.y) - (aStart.y - bStart.y) * (aStart.x - aEnd.x);
  const aRatio = aNumerator / denominator;
  const bRatio = bNumerator / denominator;

  return aRatio >= 0 && aRatio <= 1 && bRatio >= 0 && bRatio <= 1;
}

function normalizeReferenceValue(value: string): string {
  return value.trim().replace(/^\$\{(.+)\}$/u, "$1");
}

function hasAnyNodeType(nodeTypes: ReadonlySet<ResourceType>, expectedTypes: readonly ResourceType[]): boolean {
  return expectedTypes.some((type) => nodeTypes.has(type));
}

function findRequirementCoverageNodeValidationIssues(preview: AmazonQArchitectureDraftPreview): string[] {
  const nodeIds = new Set(preview.architectureJson.nodes.map((node) => node.id));
  const missingNodeIds = new Set<string>();

  for (const coverage of preview.requirementCoverage ?? []) {
    for (const nodeId of coverage.nodes ?? []) {
      if (!nodeIds.has(nodeId)) {
        missingNodeIds.add(nodeId);
      }
    }
  }

  return [...missingNodeIds].map(
    (nodeId) => `Requirement coverage references missing node id '${nodeId}'. Use only node ids present in architectureJson.`
  );
}

function hasForbiddenDatabaseResource(architectureJson: ArchitectureJson): boolean {
  return architectureJson.nodes.some((node) => {
    if (hasAnyNodeType(new Set([node.type]), ["RDS", "DB_SUBNET_GROUP"])) {
      return true;
    }

    return /(database|\bdb\b|rds|postgres|postgresql|mysql|db\s*subnet|\uB370\uC774\uD130\uBCA0\uC774\uC2A4)/iu.test(
      createNodeSearchText(node)
    );
  });
}

function hasForbiddenUploadResource(architectureJson: ArchitectureJson): boolean {
  return architectureJson.nodes.some(isForbiddenUploadResourceNode);
}

function isForbiddenUploadResourceNode(node: ArchitectureJson["nodes"][number]): boolean {
  const nodeText = createNodeSearchText(node);

  if (node.type === "S3") {
    return /upload|media|image|profile\s*image|post\s*image|attachment|presigned/iu.test(nodeText);
  }

  if (hasAnyNodeType(new Set([node.type]), ["IAM_POLICY", "IAM_ROLE", "LAMBDA", "KMS_KEY"])) {
    return /upload|media|presigned|file\s*processing|image\s*processing/iu.test(nodeText);
  }

  return /presigned\s*url|file\s*upload\s*flow|direct[-\s]*to[-\s]*s3\s*upload/iu.test(nodeText);
}

function hasForbiddenRealtimeResource(preview: AmazonQArchitectureDraftPreview): boolean {
  if (hasForbiddenRealtimeArchitectureNodes(preview.architectureJson)) {
    return true;
  }

  return (preview.requirementCoverage ?? []).some((coverage) =>
    hasPositiveRealtimeSignal(
      [
        coverage.answer,
        coverage.status,
        coverage.capability ?? "",
        coverage.assumption ?? "",
        ...(coverage.nodes ?? [])
      ].join(" ")
    )
  );
}

function hasForbiddenRealtimeArchitectureNodes(architectureJson: ArchitectureJson): boolean {
  return architectureJson.nodes.some(isForbiddenRealtimeArchitectureNode);
}

function isForbiddenRealtimeArchitectureNode(node: ArchitectureJson["nodes"][number]): boolean {
  const nodeText = createNodeSearchText(node);

  if (hasPositiveRealtimeSignal(nodeText)) {
    return true;
  }

  return (
    hasAnyNodeType(new Set([node.type]), ["API_GATEWAY_REST_API", "LAMBDA", "EC2"]) &&
    /(user|client|push|message|event|realtime|real-time|websocket|web\s*socket|\bsse\b|notification|notify|\uC2E4\uC2DC\uAC04|\uC54C\uB9BC|\uCC44\uD305)/iu.test(
      nodeText
    )
  );
}

function hasPositiveRealtimeSignal(text: string): boolean {
  const normalizedText = text.normalize("NFKC").toLowerCase();

  if (/(no\s+realtime|no\s+real-time|no\s+real\s*time|realtime:\s*(none|no)|real-time:\s*(none|no)|\uD544\uC694\s*\uC5C6\uC74C|\uC5C6\uC74C)/iu.test(normalizedText)) {
    return false;
  }

  return /(websocket|web\s*socket|server-sent|\bsse\b|realtime|real-time|realtime\s+notification|notification\s+api|push\s+notification|chat|\uC2E4\uC2DC\uAC04|\uCC44\uD305)/iu.test(
    normalizedText
  );
}

function mentionsDataPersistenceCoverage(text: string): boolean {
  return /(data\s*persistence|durable\s*(data|storage)|database|relational|rds|storage\s*assumption|\uB370\uC774\uD130|\uC800\uC7A5)/iu.test(
    text
  );
}

function mentionsPatternDecisionCoverage(text: string): boolean {
  return /(selected\s*pattern|chosen\s*pattern|pattern\s*id|rejected\s*pattern|alternative\s*pattern|preferred\s*pattern|trade[-\s]*off|선택.*패턴|거부.*패턴|대안.*패턴)/iu.test(
    text
  );
}

function mentionsFrontendDeliveryCoverage(text: string): boolean {
  return /(frontend|static\s*delivery|app\s*shell|spa|cdn|cloudfront|s3|asset\s*delivery|\uC815\uC801|\uD504론트엔드)/iu.test(
    text
  );
}

function mentionsBackendEntryCoverage(text: string): boolean {
  return /(backend|api\s*entry|runtime|load\s*balancer|alb|api\s*gateway|lambda|ec2|request\s*entry|\uBC31\uC5D4\uB4DC|api)/iu.test(
    text
  );
}

function mentionsGlobalDeliveryOrLatencyWarning(text: string): boolean {
  return /(global|worldwide|cdn|cloudfront|static\s*delivery|edge|single[-\s]*region.*latency|latency.*single[-\s]*region|api.*latency.*warning|database.*latency.*warning|\uAE00\uB85C\uBC8C|\uC9C0연|\uB2E8\uC77C\s*\uB9AC\uC804)/iu.test(
    text
  );
}

function mentionsUploadCoverage(text: string): boolean {
  return /(upload|media|image|presigned|direct[-\s]*to[-\s]*s3|file\s*handling|lifecycle|\uC5C5\uB85C\uB4DC|\uC774\uBBF8\uC9C0|\uBBF8\uB514\uC5B4)/iu.test(
    text
  );
}

function mentionsHighAvailabilityCoverage(text: string): boolean {
  return /(high\s*availability|redundan|multi[-\s]*az|failover|99\.99|no[-\s]*downtime|availability\s*trade[-\s]*off|\uAC00\uC6A9\uC131|\uB2E4\uC911\s*az|\uC911\uBCF5|\uC774\uC911화)/iu.test(
    text
  );
}

function mentionsCostWarningCoverage(text: string): boolean {
  return /(cost\s*warning|budget\s*risk|budget.*conflict|cost.*trade[-\s]*off|over\s*budget|exceed.*budget|\uBE44\uC6A9\s*\uACBD\uACE0|\uC608\uC0B0.*(\uCD08\uACFC|\uCDA9돌|\uC704험))/iu.test(
    text
  );
}

function mentionsForbiddenMultiRegionScope(text: string): boolean {
  return /(multi[-\s]*region\s*(api|database|rds)|api\/rds.*multi[-\s]*region|\uB2E4\uC911\s*\uB9AC\uC804.*(api|rds|\uB370\uC774\uD130\uBCA0\uC774\uC2A4))/iu.test(
    text
  );
}

function createCoverageSearchText(preview: AmazonQArchitectureDraftPreview): string {
  return [
    ...(preview.requirementCoverage ?? []).flatMap((coverage) => [
      coverage.answer,
      coverage.status,
      coverage.capability ?? "",
      coverage.assumption ?? "",
      ...(coverage.nodes ?? [])
    ]),
    ...(preview.assumptions ?? []),
    ...(preview.explanations ?? []),
    ...(preview.highlights ?? []),
    ...(preview.nextActions ?? []),
    preview.summary ?? "",
    ...preview.architectureJson.nodes.map(createNodeSearchText)
  ]
    .join("\n")
    .normalize("NFKC")
    .toLowerCase();
}

function createNodeSearchText(node: ArchitectureJson["nodes"][number]): string {
  return [node.id, node.label ?? "", node.type, JSON.stringify(node.config)].join(" ").normalize("NFKC").toLowerCase();
}

function getStringConfigValue(node: ArchitectureJson["nodes"][number], key: string): string | undefined {
  const value = node.config[key];

  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function getStringConfigValues(node: ArchitectureJson["nodes"][number], key: string): string[] {
  const value = node.config[key];

  if (typeof value === "string" && value.trim().length > 0) {
    return [value];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function requiresServerlessOnlyArchitecture(normalizedPrompt: string): boolean {
  return hasPromptTerm(normalizedPrompt, ["serverless", "lambda", "without ec2", "no ec2", "ec2 without", "ec2 excluded", "ec2 not allowed", "\uC11C\uBC84\uB9AC\uC2A4", "\uB78C\uB2E4"]);
}

function getCanonicalPlanResourceMaxCount(
  plan: ArchitectureIntentPlan | null,
  resourceType: ResourceType
): number {
  const requestedQuantity = plan?.resourceQuantities?.[resourceType];

  if (requestedQuantity !== undefined) {
    return requestedQuantity;
  }

  if (resourceType === "S3") {
    return Math.max(
      1,
      (plan?.patternIds ?? []).filter((patternId) =>
        ["spa-cloudfront-s3", "github-cicd-codedeploy"].includes(patternId)
      ).length
    );
  }

  if (["SUBNET", "SECURITY_GROUP", "ROUTE_TABLE", "ROUTE_TABLE_ASSOCIATION", "IAM_ROLE"].includes(resourceType)) {
    return Number.POSITIVE_INFINITY;
  }

  return 1;
}

const ECS_ROLE_SENSITIVE_RESOURCE_TYPES = new Set<ResourceType>([
  "SUBNET",
  "ELASTIC_IP",
  "NAT_GATEWAY",
  "ROUTE_TABLE",
  "ROUTE_TABLE_ASSOCIATION",
  "SECURITY_GROUP",
  "IAM_ROLE",
  "IAM_POLICY",
  "CLOUDWATCH_LOG_GROUP",
  "CLOUDWATCH_METRIC_ALARM",
  "DB_SUBNET_GROUP"
]);

function removeConflictingCanonicalPatternResources(
  architectureJson: ArchitectureJson,
  plan: ArchitectureIntentPlan | null
): ArchitectureJson {
  const patternIds = new Set(plan?.patternIds ?? []);
  const requiredResources = new Set(plan?.requiredResources ?? []);
  const hasEcsRuntime = (plan?.requiredResources ?? []).some(
    (resourceType) => resourceType === "ECS_SERVICE" || resourceType === "ECS_TASK_DEFINITION"
  );

  if (!patternIds.has("ecs-fargate") || patternIds.has("serverless-api") || !hasEcsRuntime) {
    return architectureJson;
  }

  const keepsObjectStorage =
    requiredResources.has("S3") ||
    patternIds.has("spa-cloudfront-s3") ||
    patternIds.has("github-cicd-codedeploy");
  const nodes = architectureJson.nodes.filter((node) => {
    if (ECS_ROLE_SENSITIVE_RESOURCE_TYPES.has(node.type)) {
      return false;
    }

    return node.type !== "S3" || keepsObjectStorage;
  });
  const nodeIds = new Set(nodes.map((node) => node.id));

  return {
    nodes,
    edges: architectureJson.edges.filter(
      (edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId)
    )
  };
}

type CanonicalNodeSpec = {
  readonly id: string;
  readonly label: string;
  readonly config: Record<string, unknown>;
  readonly positionX: number;
  readonly positionY: number;
};

function configureCanonicalPatternResources(
  architectureJson: ArchitectureJson,
  plan: ArchitectureIntentPlan | null,
  prompt: string
): ArchitectureJson {
  const patternIds = new Set(plan?.patternIds ?? []);
  const hasEcsRuntime = architectureJson.nodes.some(
    (node) => node.type === "ECS_SERVICE" || node.type === "ECS_TASK_DEFINITION"
  );
  const usesRoleAwareEc2 =
    patternIds.has("alb-asg-ec2") &&
    !patternIds.has("serverless-api") &&
    !hasEcsRuntime;

  if (usesRoleAwareEc2) {
    return configureCanonicalEc2PatternResources(architectureJson, plan, prompt);
  }

  if (!patternIds.has("ecs-fargate") || patternIds.has("serverless-api") || !hasEcsRuntime) {
    return architectureJson;
  }

  const hasDatabase = patternIds.has("multi-az-rds");
  const hasLoadBalancer = architectureJson.nodes.some(
    (node) => node.type === "LOAD_BALANCER"
  );
  const region = plan?.region ?? "ap-northeast-2";
  const vpcId = "vpc-main";
  const vpcRef = canonicalTerraformReference("aws_vpc", vpcId);
  const subnetSpecs: CanonicalNodeSpec[] = [
    canonicalSubnetSpec("public-subnet-a", "Public Subnet A", "10.0.0.0/24", `${region}a`, "public", true, 180, 480, vpcRef),
    canonicalSubnetSpec("public-subnet-b", "Public Subnet B", "10.0.1.0/24", `${region}b`, "public", true, 420, 480, vpcRef),
    canonicalSubnetSpec("private-app-subnet-a", "Private App Subnet A", "10.0.10.0/24", `${region}a`, "private_app", false, 180, 700, vpcRef),
    canonicalSubnetSpec("private-app-subnet-b", "Private App Subnet B", "10.0.11.0/24", `${region}b`, "private_app", false, 420, 700, vpcRef),
    ...(hasDatabase
      ? [
          canonicalSubnetSpec("private-db-subnet-a", "Private DB Subnet A", "10.0.20.0/24", `${region}a`, "private_db", false, 180, 920, vpcRef),
          canonicalSubnetSpec("private-db-subnet-b", "Private DB Subnet B", "10.0.21.0/24", `${region}b`, "private_db", false, 420, 920, vpcRef)
        ]
      : [])
  ];
  const routeTableSpecs: CanonicalNodeSpec[] = [
    canonicalNodeSpec("public-route-table", "Public Route Table", 680, 480, {
      vpcId: vpcRef,
      route: [{ cidrBlock: "0.0.0.0/0", gatewayId: canonicalTerraformReference("aws_internet_gateway", "internet-gateway") }]
    }),
    canonicalNodeSpec("private-route-table-a", "Private Route Table A", 680, 700, {
      vpcId: vpcRef,
      route: [{ cidrBlock: "0.0.0.0/0", natGatewayId: canonicalTerraformReference("aws_nat_gateway", "nat-gateway-a") }]
    }),
    canonicalNodeSpec("private-route-table-b", "Private Route Table B", 900, 700, {
      vpcId: vpcRef,
      route: [{ cidrBlock: "0.0.0.0/0", natGatewayId: canonicalTerraformReference("aws_nat_gateway", "nat-gateway-b") }]
    })
  ];
  const associationSpecs = createCanonicalRouteAssociationSpecs(hasDatabase);
  const securityGroupSpecs: CanonicalNodeSpec[] = [
    ...(hasLoadBalancer
      ? [canonicalNodeSpec("alb-security-group", "ALB Security Group", 930, 480, {
          name: "sketchcatch-alb",
          description: "Public HTTP ingress through CloudFront or clients",
          vpcId: vpcRef,
          ingress: [{ protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] }]
        })]
      : []),
    canonicalNodeSpec("app-security-group", "Fargate App Security Group", 930, 700, {
      name: "sketchcatch-app",
      description: hasLoadBalancer
        ? "Application traffic from the ALB only"
        : "Private application task traffic",
      vpcId: vpcRef,
      ingress: hasLoadBalancer
        ? [{ protocol: "tcp", fromPort: 8080, toPort: 8080, securityGroups: [canonicalTerraformReference("aws_security_group", "alb-security-group")] }]
        : []
    }),
    ...(hasDatabase
      ? [canonicalNodeSpec("db-security-group", "Database Security Group", 930, 920, {
          name: "sketchcatch-db",
          description: "PostgreSQL traffic from Fargate tasks only",
          vpcId: vpcRef,
          ingress: [{ protocol: "tcp", fromPort: 5432, toPort: 5432, securityGroups: [canonicalTerraformReference("aws_security_group", "app-security-group")] }]
        })]
      : [])
  ];
  const roleTrustPolicy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [{ Effect: "Allow", Principal: { Service: "ecs-tasks.amazonaws.com" }, Action: "sts:AssumeRole" }]
  });
  const specsByType = new Map<ResourceType, readonly CanonicalNodeSpec[]>([
    ["SUBNET", subnetSpecs],
    ["ELASTIC_IP", [
      canonicalNodeSpec("nat-eip-a", "NAT Elastic IP A", 680, 350, { domain: "vpc" }),
      canonicalNodeSpec("nat-eip-b", "NAT Elastic IP B", 900, 350, { domain: "vpc" })
    ]],
    ["NAT_GATEWAY", [
      canonicalNodeSpec("nat-gateway-a", "NAT Gateway A", 680, 580, {
        allocationId: canonicalTerraformReference("aws_eip", "nat-eip-a"),
        subnetId: canonicalTerraformReference("aws_subnet", "public-subnet-a")
      }),
      canonicalNodeSpec("nat-gateway-b", "NAT Gateway B", 900, 580, {
        allocationId: canonicalTerraformReference("aws_eip", "nat-eip-b"),
        subnetId: canonicalTerraformReference("aws_subnet", "public-subnet-b")
      })
    ]],
    ["ROUTE_TABLE", routeTableSpecs],
    ["ROUTE_TABLE_ASSOCIATION", associationSpecs],
    ["SECURITY_GROUP", securityGroupSpecs],
    ["IAM_ROLE", [
      canonicalNodeSpec("ecs-execution-role", "ECS Task Execution Role", 1180, 700, { assumeRolePolicy: roleTrustPolicy }),
      canonicalNodeSpec("ecs-task-role", "ECS Task Role", 1380, 700, { assumeRolePolicy: roleTrustPolicy })
    ]],
    ["IAM_POLICY", [canonicalNodeSpec("ecs-task-policy", "ECS Task Policy", 1380, 840, {
      policy: JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: ["logs:CreateLogStream", "logs:PutLogEvents", "s3:GetObject", "s3:PutObject"], Resource: "*" }] })
    })]],
    ["CLOUDWATCH_LOG_GROUP", [canonicalNodeSpec("ecs-log-group", "ECS Application Logs", 1180, 840, {
      name: "/ecs/sketchcatch-app",
      retentionInDays: 30
    })]],
    ["CLOUDWATCH_METRIC_ALARM", [
      canonicalNodeSpec("app-cpu-alarm", "ECS Service CPU Alarm", 1180, 980, createCanonicalMetricAlarmConfig("sketchcatch-ecs-cpu", "AWS/ECS", "CPUUtilization", { ClusterName: canonicalTerraformReference("aws_ecs_cluster", "ecs-cluster", "name"), ServiceName: canonicalTerraformReference("aws_ecs_service", "ecs-service", "name") })),
      ...(hasDatabase
        ? [canonicalNodeSpec("db-cpu-alarm", "Database CPU Alarm", 1380, 980, createCanonicalMetricAlarmConfig("sketchcatch-rds-cpu", "AWS/RDS", "CPUUtilization", { DBInstanceIdentifier: canonicalTerraformReference("aws_db_instance", "app-database", "id") }))]
        : [])
    ]],
    ...(hasDatabase
      ? [["DB_SUBNET_GROUP", [canonicalNodeSpec("db-subnet-group", "DB Subnet Group", 680, 920, {
          name: "sketchcatch-db-subnets",
          subnetIds: [
            canonicalTerraformReference("aws_subnet", "private-db-subnet-a"),
            canonicalTerraformReference("aws_subnet", "private-db-subnet-b")
          ]
        })]] as const]
      : [])
  ]);
  const replacementById = new Map<string, ArchitectureJson["nodes"][number]>();

  for (const [resourceType, specs] of specsByType) {
    const matchingNodes = architectureJson.nodes.filter((node) => node.type === resourceType);
    specs.forEach((spec, index) => {
      const node = matchingNodes[index];
      if (node !== undefined) {
        replacementById.set(node.id, { ...node, ...spec });
      }
    });
  }

  const publicSubnetRefs = ["public-subnet-a", "public-subnet-b"].map((id) =>
    canonicalTerraformReference("aws_subnet", id)
  );
  const privateAppSubnetRefs = ["private-app-subnet-a", "private-app-subnet-b"].map((id) =>
    canonicalTerraformReference("aws_subnet", id)
  );
  const staticBucket = architectureJson.nodes.find(
    (node) => node.type === "S3" && node.config.bucketPurpose === "static_website_origin"
  ) ?? architectureJson.nodes.find((node) => node.type === "S3");
  const nodes = architectureJson.nodes.map((node) => {
    const replacement = replacementById.get(node.id);
    if (replacement !== undefined) {
      return replacement;
    }

    switch (node.type) {
      case "VPC":
        return { ...node, id: vpcId, label: "Main VPC", config: { cidrBlock: "10.0.0.0/16", enableDnsHostnames: true, enableDnsSupport: true } };
      case "INTERNET_GATEWAY":
        return { ...node, id: "internet-gateway", label: "Internet Gateway", config: { vpcId: vpcRef } };
      case "LOAD_BALANCER":
        return { ...node, id: "application-load-balancer", label: "Application Load Balancer", config: { name: "sketchcatch-app", internal: false, loadBalancerType: "application", subnets: publicSubnetRefs, securityGroups: [canonicalTerraformReference("aws_security_group", "alb-security-group")] } };
      case "LOAD_BALANCER_TARGET_GROUP":
        return { ...node, id: "app-target-group", label: "Fargate Target Group", config: { name: "sketchcatch-app", port: 8080, protocol: "HTTP", targetType: "ip", vpcId: vpcRef, healthCheck: { path: "/health", matcher: "200-399" } } };
      case "LOAD_BALANCER_LISTENER":
        return { ...node, id: "http-listener", label: "ALB HTTP Listener", config: { loadBalancerArn: canonicalTerraformReference("aws_lb", "application-load-balancer", "arn"), port: 80, protocol: "HTTP", defaultAction: { type: "forward", targetGroupArn: canonicalTerraformReference("aws_lb_target_group", "app-target-group", "arn") } } };
      case "ECR_REPOSITORY":
        return { ...node, id: "app-repository", label: "Application ECR Repository", config: { name: "sketchcatch-app", imageTagMutability: "IMMUTABLE", imageScanningConfiguration: { scanOnPush: true } } };
      case "ECS_CLUSTER":
        return { ...node, id: "ecs-cluster", label: "Fargate ECS Cluster", config: { name: "sketchcatch-app" } };
      case "ECS_TASK_DEFINITION":
        return { ...node, id: "ecs-task-definition", label: "Fargate Task Definition", config: { family: "sketchcatch-app", networkMode: "awsvpc", requiresCompatibilities: ["FARGATE"], cpu: "512", memory: "1024", executionRoleArn: canonicalTerraformReference("aws_iam_role", "ecs-execution-role", "arn"), taskRoleArn: canonicalTerraformReference("aws_iam_role", "ecs-task-role", "arn"), containerDefinitions: JSON.stringify([{ name: "app", image: "public.ecr.aws/docker/library/nginx:1.27-alpine", essential: true, portMappings: [{ containerPort: 8080, protocol: "tcp" }], logConfiguration: { logDriver: "awslogs", options: { "awslogs-group": "/ecs/sketchcatch-app", "awslogs-region": region, "awslogs-stream-prefix": "app" } } }]) } };
      case "ECS_SERVICE":
        return { ...node, id: "ecs-service", label: "Fargate Application Service", config: { name: "sketchcatch-app", cluster: canonicalTerraformReference("aws_ecs_cluster", "ecs-cluster"), taskDefinition: canonicalTerraformReference("aws_ecs_task_definition", "ecs-task-definition", "arn"), desiredCount: 2, launchType: "FARGATE", healthCheckGracePeriodSeconds: 60, deploymentMinimumHealthyPercent: 100, deploymentMaximumPercent: 200, deploymentCircuitBreaker: { enable: true, rollback: true }, networkConfiguration: { assignPublicIp: false, subnets: privateAppSubnetRefs, securityGroups: [canonicalTerraformReference("aws_security_group", "app-security-group")] }, loadBalancer: { targetGroupArn: canonicalTerraformReference("aws_lb_target_group", "app-target-group", "arn"), containerName: "app", containerPort: 8080 } } };
      case "CLOUDFRONT":
        return { ...node, config: { ...node.config, ...(staticBucket === undefined ? {} : { originResourceId: staticBucket.id }), enabled: true, viewerProtocolPolicy: "redirect-to-https" } };
      case "RDS":
        return { ...node, id: "app-database", label: "Multi-AZ Application Database", config: { engine: "postgres", instanceClass: "db.t4g.small", allocatedStorage: 50, multiAz: true, publiclyAccessible: false, storageEncrypted: true, backupRetentionPeriod: 7, deletionProtection: true, skipFinalSnapshot: false, finalSnapshotIdentifier: "sketchcatch-app-final", dbSubnetGroupName: canonicalTerraformReference("aws_db_subnet_group", "db-subnet-group", "name"), vpcSecurityGroupIds: [canonicalTerraformReference("aws_security_group", "db-security-group")] } };
      case "SECRETS_MANAGER_SECRET":
        return { ...node, id: "database-secret", label: "Database Credentials Secret", config: { name: "sketchcatch/database/credentials", recoveryWindowInDays: 7 } };
      default:
        return node;
    }
  });

  return { nodes, edges: architectureJson.edges };
}

function configureCanonicalEc2PatternResources(
  architectureJson: ArchitectureJson,
  plan: ArchitectureIntentPlan | null,
  prompt: string
): ArchitectureJson {
  const patternIds = new Set(plan?.patternIds ?? []);
  const hasDatabase = patternIds.has("multi-az-rds");
  const region = plan?.region ?? "ap-northeast-2";
  const vpcId = "vpc-main";
  const vpcRef = canonicalTerraformReference("aws_vpc", vpcId);
  const computeCount = Math.max(
    2,
    plan?.runtimeTopology?.computeCount ?? 0,
    plan?.resourceQuantities?.EC2 ?? 0
  );
  const publicSubnetIds = ["public-subnet-a", "public-subnet-b"];
  const privateAppSubnetIds = ["private-app-subnet-a", "private-app-subnet-b"];
  const privateDbSubnetIds = ["private-db-subnet-a", "private-db-subnet-b"];
  const publicSubnetRefs = publicSubnetIds.map((id) =>
    canonicalTerraformReference("aws_subnet", id)
  );
  const privateAppSubnetRefs = privateAppSubnetIds.map((id) =>
    canonicalTerraformReference("aws_subnet", id)
  );
  const subnetSpecs: CanonicalNodeSpec[] = [
    canonicalSubnetSpec("public-subnet-a", "Public Subnet A", "10.0.0.0/24", `${region}a`, "public", true, 180, 480, vpcRef),
    canonicalSubnetSpec("public-subnet-b", "Public Subnet B", "10.0.1.0/24", `${region}b`, "public", true, 500, 480, vpcRef),
    canonicalSubnetSpec("private-app-subnet-a", "Private App Subnet A", "10.0.10.0/24", `${region}a`, "private_app", false, 180, 760, vpcRef),
    canonicalSubnetSpec("private-app-subnet-b", "Private App Subnet B", "10.0.11.0/24", `${region}b`, "private_app", false, 500, 760, vpcRef),
    ...(hasDatabase
      ? [
          canonicalSubnetSpec("private-db-subnet-a", "Private DB Subnet A", "10.0.20.0/24", `${region}a`, "private_db", false, 180, 1040, vpcRef),
          canonicalSubnetSpec("private-db-subnet-b", "Private DB Subnet B", "10.0.21.0/24", `${region}b`, "private_db", false, 500, 1040, vpcRef)
        ]
      : [])
  ];
  const ec2TrustPolicy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [{ Effect: "Allow", Principal: { Service: "ec2.amazonaws.com" }, Action: "sts:AssumeRole" }]
  });
  const uploadProfile = resolveUploadProfile(prompt.normalize("NFKC").toLowerCase());
  const uploadEnabled = uploadProfile !== undefined && uploadProfile !== "none";
  const specsByType = new Map<ResourceType, readonly CanonicalNodeSpec[]>([
    ["SUBNET", subnetSpecs],
    ["ELASTIC_IP", [
      canonicalNodeSpec("nat-eip-a", "NAT Elastic IP A", 840, 420, { domain: "vpc" }),
      canonicalNodeSpec("nat-eip-b", "NAT Elastic IP B", 1040, 420, { domain: "vpc" })
    ]],
    ["NAT_GATEWAY", [
      canonicalNodeSpec("nat-gateway-a", "NAT Gateway A", 840, 560, {
        allocationId: canonicalTerraformReference("aws_eip", "nat-eip-a"),
        subnetId: canonicalTerraformReference("aws_subnet", "public-subnet-a")
      }),
      canonicalNodeSpec("nat-gateway-b", "NAT Gateway B", 1040, 560, {
        allocationId: canonicalTerraformReference("aws_eip", "nat-eip-b"),
        subnetId: canonicalTerraformReference("aws_subnet", "public-subnet-b")
      })
    ]],
    ["ROUTE_TABLE", [
      canonicalNodeSpec("public-route-table", "Public Route Table", 1260, 480, {
        vpcId: vpcRef,
        route: [{ cidrBlock: "0.0.0.0/0", gatewayId: canonicalTerraformReference("aws_internet_gateway", "internet-gateway") }]
      }),
      canonicalNodeSpec("private-route-table-a", "Private Route Table A", 1260, 700, {
        vpcId: vpcRef,
        route: [{ cidrBlock: "0.0.0.0/0", natGatewayId: canonicalTerraformReference("aws_nat_gateway", "nat-gateway-a") }]
      }),
      canonicalNodeSpec("private-route-table-b", "Private Route Table B", 1460, 700, {
        vpcId: vpcRef,
        route: [{ cidrBlock: "0.0.0.0/0", natGatewayId: canonicalTerraformReference("aws_nat_gateway", "nat-gateway-b") }]
      })
    ]],
    ["ROUTE_TABLE_ASSOCIATION", createCanonicalRouteAssociationSpecs(hasDatabase)],
    ["SECURITY_GROUP", [
      canonicalNodeSpec("alb-security-group", "ALB Security Group", 840, 700, {
        name: "sketchcatch-alb",
        description: "Public HTTP ingress to the application load balancer",
        vpcId: vpcRef,
        ingress: [{ protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] }],
        egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }]
      }),
      canonicalNodeSpec("app-security-group", "EC2 App Security Group", 1040, 840, {
        name: "sketchcatch-app",
        description: "Application traffic from the ALB only",
        vpcId: vpcRef,
        ingress: [{ protocol: "tcp", fromPort: 8080, toPort: 8080, securityGroups: [canonicalTerraformReference("aws_security_group", "alb-security-group")] }],
        egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }]
      }),
      ...(hasDatabase
        ? [canonicalNodeSpec("db-security-group", "Database Security Group", 1040, 1060, {
            name: "sketchcatch-db",
            description: "PostgreSQL traffic from the EC2 application tier only",
            vpcId: vpcRef,
            ingress: [{ protocol: "tcp", fromPort: 5432, toPort: 5432, securityGroups: [canonicalTerraformReference("aws_security_group", "app-security-group")] }]
          })]
        : [])
    ]],
    ["AMI", [canonicalNodeSpec("app-ami", "Amazon Linux 2023 AMI", 1680, 700, {
      mostRecent: true,
      owners: ["amazon"],
      filter: [
        { name: "name", values: ["al2023-ami-2023.*-x86_64"] },
        { name: "virtualization-type", values: ["hvm"] }
      ]
    })]],
    ["IAM_ROLE", [canonicalNodeSpec("app-runtime-role", "EC2 Runtime Role", 1680, 840, {
      assumeRolePolicy: ec2TrustPolicy
    })]],
    ["IAM_POLICY", [canonicalNodeSpec("app-runtime-policy", "EC2 Runtime Policy", 1880, 840, {
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Action: [
            "logs:CreateLogStream",
            "logs:PutLogEvents",
            "cloudwatch:PutMetricData",
            "ssm:UpdateInstanceInformation",
            ...(uploadEnabled ? ["s3:GetObject", "s3:PutObject"] : [])
          ],
          Resource: "*"
        }]
      })
    })]],
    ["IAM_INSTANCE_PROFILE", [canonicalNodeSpec("app-instance-profile", "EC2 Instance Profile", 1880, 700, {
      name: "sketchcatch-app",
      role: canonicalTerraformReference("aws_iam_role", "app-runtime-role", "name")
    })]],
    ["CLOUDWATCH_LOG_GROUP", [canonicalNodeSpec("app-log-group", "Application Logs", 1680, 980, {
      name: "/sketchcatch/ec2/app",
      retentionInDays: 30
    })]],
    ["CLOUDWATCH_METRIC_ALARM", [
      canonicalNodeSpec("app-cpu-alarm", "ASG CPU Alarm", 1880, 980, {
        ...createCanonicalMetricAlarmConfig("sketchcatch-ec2-cpu", "AWS/EC2", "CPUUtilization", {
          AutoScalingGroupName: canonicalTerraformReference("aws_autoscaling_group", "app-auto-scaling-group", "name")
        }),
        alarmActions: [canonicalTerraformReference("aws_autoscaling_policy", "app-scaling-policy", "arn")]
      }),
      ...(hasDatabase
        ? [canonicalNodeSpec("db-cpu-alarm", "Database CPU Alarm", 1880, 1120, createCanonicalMetricAlarmConfig("sketchcatch-rds-cpu", "AWS/RDS", "CPUUtilization", {
            DBInstanceIdentifier: canonicalTerraformReference("aws_db_instance", "app-database", "id")
          }))]
        : [])
    ]],
    ["DB_SUBNET_GROUP", hasDatabase
      ? [canonicalNodeSpec("db-subnet-group", "DB Subnet Group", 840, 1040, {
          name: "sketchcatch-db-subnets",
          subnetIds: privateDbSubnetIds.map((id) => canonicalTerraformReference("aws_subnet", id))
        })]
      : []],
    ["S3", [
      canonicalNodeSpec("web-assets-bucket", "Web Assets Bucket", 420, 140, {
        bucketPurpose: "static_website_origin",
        publicAccessBlock: true,
        forceDestroy: false
      }),
      ...(uploadEnabled
        ? [canonicalNodeSpec("image-upload-bucket", "Private Image Upload Bucket", 680, 140, {
            bucketPurpose: "user_uploads",
            publicAccessBlock: true,
            forceDestroy: false
          })]
        : [])
    ]],
    ["EC2", Array.from({ length: computeCount }, (_, index) =>
      canonicalNodeSpec(
        `app-server-${index + 1}`,
        `EC2 Fleet Instance ${index + 1}`,
        index % 2 === 0 ? 300 : 620,
        820 + Math.floor(index / 2) * 120,
        {
          associatePublicIpAddress: false,
          managedByAutoScalingGroup: "app-auto-scaling-group",
          sketchcatchReferenceTerraform: true,
          subnetId: privateAppSubnetIds[index % privateAppSubnetIds.length],
          vpcSecurityGroupIds: [canonicalTerraformReference("aws_security_group", "app-security-group")]
        }
      )
    )]
  ]);
  const replacementById = new Map<string, ArchitectureJson["nodes"][number]>();

  for (const [resourceType, specs] of specsByType) {
    const matchingNodes = architectureJson.nodes.filter((node) => node.type === resourceType);
    specs.forEach((spec, index) => {
      const node = matchingNodes[index];
      if (node !== undefined) {
        replacementById.set(node.id, { ...node, ...spec });
      }
    });
  }

  const nodes = architectureJson.nodes.map((node) => {
    const replacement = replacementById.get(node.id);
    if (replacement !== undefined) {
      return replacement;
    }

    switch (node.type) {
      case "VPC":
        return { ...node, id: vpcId, label: "Main VPC", config: { cidrBlock: "10.0.0.0/16", enableDnsHostnames: true, enableDnsSupport: true } };
      case "INTERNET_GATEWAY":
        return { ...node, id: "internet-gateway", label: "Internet Gateway", config: { vpcId: vpcRef } };
      case "LOAD_BALANCER":
        return { ...node, id: "application-load-balancer", label: "Application Load Balancer", config: { name: "sketchcatch-app", internal: false, loadBalancerType: "application", subnets: publicSubnetRefs, securityGroups: [canonicalTerraformReference("aws_security_group", "alb-security-group")] } };
      case "LOAD_BALANCER_TARGET_GROUP":
        return { ...node, id: "app-target-group", label: "EC2 Target Group", config: { name: "sketchcatch-app", port: 8080, protocol: "HTTP", targetType: "instance", vpcId: vpcRef, healthCheck: { path: "/health", matcher: "200-399" } } };
      case "LOAD_BALANCER_LISTENER":
        return { ...node, id: "http-listener", label: "ALB HTTP Listener", config: { loadBalancerArn: canonicalTerraformReference("aws_lb", "application-load-balancer", "arn"), port: 80, protocol: "HTTP", defaultAction: { type: "forward", targetGroupArn: canonicalTerraformReference("aws_lb_target_group", "app-target-group", "arn") } } };
      case "LAUNCH_TEMPLATE":
        return { ...node, id: "app-launch-template", label: "EC2 Launch Template", config: { namePrefix: "sketchcatch-app-", imageId: canonicalTerraformReference("data.aws_ami", "app-ami"), instanceType: "t3.small", vpcSecurityGroupIds: [canonicalTerraformReference("aws_security_group", "app-security-group")], iamInstanceProfile: { name: canonicalTerraformReference("aws_iam_instance_profile", "app-instance-profile", "name") }, metadataOptions: { httpEndpoint: "enabled", httpTokens: "required" }, monitoring: { enabled: true } } };
      case "AUTO_SCALING_GROUP":
        return { ...node, id: "app-auto-scaling-group", label: "Application Auto Scaling Group", config: { name: "sketchcatch-app", minSize: 2, desiredCapacity: computeCount, maxSize: Math.max(4, computeCount * 2), vpcZoneIdentifier: privateAppSubnetRefs, targetGroupArns: [canonicalTerraformReference("aws_lb_target_group", "app-target-group", "arn")], healthCheckType: "ELB", healthCheckGracePeriod: 120, launchTemplate: { id: canonicalTerraformReference("aws_launch_template", "app-launch-template"), version: "$Latest" } } };
      case "AUTO_SCALING_POLICY":
        return { ...node, id: "app-scaling-policy", label: "CPU Scaling Policy", config: { name: "sketchcatch-cpu-scale-out", autoscalingGroupName: canonicalTerraformReference("aws_autoscaling_group", "app-auto-scaling-group", "name"), policyType: "SimpleScaling", adjustmentType: "ChangeInCapacity", scalingAdjustment: 1, cooldown: 120 } };
      case "CLOUDFRONT":
        return { ...node, id: "cloudfront-distribution", label: "CloudFront Public Entry", config: { ...node.config, originResourceId: "web-assets-bucket", enabled: true, viewerProtocolPolicy: "redirect-to-https" } };
      case "RDS":
        return { ...node, id: "app-database", label: "Multi-AZ Application Database", config: { engine: "postgres", instanceClass: "db.t4g.small", allocatedStorage: 20, multiAz: true, publiclyAccessible: false, storageEncrypted: true, backupRetentionPeriod: 7, deletionProtection: true, skipFinalSnapshot: false, finalSnapshotIdentifier: "sketchcatch-app-final", dbSubnetGroupName: canonicalTerraformReference("aws_db_subnet_group", "db-subnet-group", "name"), vpcSecurityGroupIds: [canonicalTerraformReference("aws_security_group", "db-security-group")] } };
      case "SECRETS_MANAGER_SECRET":
        return { ...node, id: "database-secret", label: "Database Credentials Secret", config: { name: "sketchcatch/database/credentials", recoveryWindowInDays: 7 } };
      default:
        return node;
    }
  });

  return { nodes, edges: [] };
}

function canonicalSubnetSpec(
  id: string,
  label: string,
  cidrBlock: string,
  availabilityZone: string,
  tier: "public" | "private_app" | "private_db",
  mapPublicIpOnLaunch: boolean,
  positionX: number,
  positionY: number,
  vpcId: string
): CanonicalNodeSpec {
  return canonicalNodeSpec(id, label, positionX, positionY, {
    availabilityZone,
    cidrBlock,
    mapPublicIpOnLaunch,
    tier,
    vpcId
  });
}

function canonicalNodeSpec(
  id: string,
  label: string,
  positionX: number,
  positionY: number,
  config: Record<string, unknown>
): CanonicalNodeSpec {
  return { id, label, positionX, positionY, config };
}

function createCanonicalRouteAssociationSpecs(hasDatabase: boolean): CanonicalNodeSpec[] {
  const pairs = [
    ["public-route-association-a", "Public Route Association A", "public-route-table", "public-subnet-a"],
    ["public-route-association-b", "Public Route Association B", "public-route-table", "public-subnet-b"],
    ["private-app-route-association-a", "Private App Route Association A", "private-route-table-a", "private-app-subnet-a"],
    ["private-app-route-association-b", "Private App Route Association B", "private-route-table-b", "private-app-subnet-b"],
    ...(hasDatabase
      ? [
          ["private-db-route-association-a", "Private DB Route Association A", "private-route-table-a", "private-db-subnet-a"],
          ["private-db-route-association-b", "Private DB Route Association B", "private-route-table-b", "private-db-subnet-b"]
        ]
      : [])
  ];

  return pairs.map(([id, label, routeTableId, subnetId], index) =>
    canonicalNodeSpec(id!, label!, 1120 + (index % 2) * 220, 350 + Math.floor(index / 2) * 140, {
      routeTableId: canonicalTerraformReference("aws_route_table", routeTableId!),
      subnetId: canonicalTerraformReference("aws_subnet", subnetId!)
    })
  );
}

function createCanonicalMetricAlarmConfig(
  alarmName: string,
  namespace: string,
  metricName: string,
  dimensions: Record<string, string>
): Record<string, unknown> {
  return {
    alarmName,
    comparisonOperator: "GreaterThanThreshold",
    dimensions,
    evaluationPeriods: 2,
    metricName,
    namespace,
    period: 300,
    statistic: "Average",
    threshold: 80
  };
}

function canonicalTerraformReference(
  resourceType: string,
  nodeId: string,
  attribute = "id"
): string {
  return `${resourceType}.${nodeId.replaceAll("-", "_")}.${attribute}`;
}

function ensureCanonicalPlanResources(
  architectureJson: ArchitectureJson,
  plan: ArchitectureIntentPlan | null
): ArchitectureJson {
  if ((plan?.patternIds?.length ?? 0) === 0) {
    return architectureJson;
  }

  const nodes = [...architectureJson.nodes];
  const edges = [...architectureJson.edges];
  const requiredQuantities = new Map<ResourceType, number>();

  for (const resourceType of plan?.requiredResources ?? []) {
    if (!isResourceTypeForbiddenByPlan(plan, resourceType as ResourceType)) {
      requiredQuantities.set(resourceType as ResourceType, 1);
    }
  }

  for (const [resourceType, quantity] of Object.entries(plan?.resourceQuantities ?? {})) {
    if (!isResourceTypeForbiddenByPlan(plan, resourceType as ResourceType)) {
      requiredQuantities.set(
        resourceType as ResourceType,
        Math.max(requiredQuantities.get(resourceType as ResourceType) ?? 0, quantity)
      );
    }
  }

  for (const [resourceType, quantity] of requiredQuantities) {
    let actualCount = nodes.filter((node) => node.type === resourceType).length;

    while (actualCount < quantity) {
      const definition = SUPPORTED_RESOURCE_CATALOG.find(
        (candidate) => candidate.nodeType === resourceType
      );

      if (definition === undefined) {
        break;
      }

      const sequence = actualCount + 1;
      const index = nodes.length;
      nodes.push({
        id: createUniqueCanonicalNodeId(nodes, `${resourceType.toLowerCase()}-${sequence}`),
        type: resourceType,
        label: `${definition.displayName}${quantity > 1 ? ` ${sequence}` : ""}`,
        positionX: 120 + (index % 6) * 180,
        positionY: 120 + Math.floor(index / 6) * 140,
        config: createArchitectureResourceDeploymentConfig(definition.terraformResourceType)
      });
      actualCount += 1;
    }
  }

  const hasPublicIngressPattern =
    !(plan?.forbiddenCapabilities ?? []).some(
      (capability) => capability.toLowerCase() === "load_balancer"
    ) &&
    (plan?.patternIds ?? []).some(
      (patternId) => patternId === "alb-asg-ec2" || patternId === "ecs-fargate"
    );
  let subnetIndex = 0;
  const labeledNodes = nodes.map((node) => {
    if (node.type !== "SUBNET") {
      return node;
    }

    const isPublic = hasPublicIngressPattern && subnetIndex < 2;
    const zoneLabel = subnetIndex % 2 === 0 ? "A" : "B";
    subnetIndex += 1;

    return {
      ...node,
      label: isPublic ? `Public Subnet ${zoneLabel}` : `Private Subnet ${zoneLabel}`,
      config: { ...node.config, tier: isPublic ? "public" : "private" }
    };
  });

  return { nodes: labeledNodes, edges };
}

function isResourceTypeForbiddenByPlan(
  plan: ArchitectureIntentPlan | null,
  resourceType: ResourceType
): boolean {
  const forbiddenCapabilities = new Set(
    (plan?.forbiddenCapabilities ?? []).map((capability) => capability.toLowerCase())
  );

  if (
    forbiddenCapabilities.has("load_balancer") &&
    ["LOAD_BALANCER", "LOAD_BALANCER_LISTENER", "LOAD_BALANCER_TARGET_GROUP"].includes(
      resourceType
    )
  ) {
    return true;
  }

  return (
    forbiddenCapabilities.has("ec2_runtime") &&
    [
      "EC2",
      "AMI",
      "IAM_INSTANCE_PROFILE",
      "LAUNCH_TEMPLATE",
      "AUTO_SCALING_GROUP",
      "AUTO_SCALING_POLICY",
      "ECS_CAPACITY_PROVIDER"
    ].includes(resourceType)
  );
}

function createUniqueCanonicalNodeId(
  nodes: readonly ArchitectureJson["nodes"][number][],
  baseId: string
): string {
  const ids = new Set(nodes.map((node) => node.id));
  let candidate = `canonical-${baseId}`;
  let suffix = 2;

  while (ids.has(candidate)) {
    candidate = `canonical-${baseId}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function connectCanonicalPatternTopologies(
  architectureJson: ArchitectureJson,
  patternIds: readonly string[]
): ArchitectureJson {
  const edges = [...architectureJson.edges];
  const nodesByType = new Map<ResourceType, ArchitectureJson["nodes"]>();
  const nodeById = new Map(architectureJson.nodes.map((node) => [node.id, node]));
  const usesRoleAwareEcs =
    patternIds.includes("ecs-fargate") &&
    !patternIds.includes("serverless-api") &&
    architectureJson.nodes.some(
      (node) => node.type === "ECS_SERVICE" || node.type === "ECS_TASK_DEFINITION"
    );
  const usesRoleAwareEc2 =
    patternIds.includes("alb-asg-ec2") &&
    !patternIds.includes("serverless-api") &&
    !usesRoleAwareEcs;
  const usesRoleAwareNetwork = usesRoleAwareEcs || usesRoleAwareEc2;
  const roleAwarePrivateAppSubnetIds = ["private-app-subnet-a", "private-app-subnet-b"];

  for (const node of architectureJson.nodes) {
    nodesByType.set(node.type, [...(nodesByType.get(node.type) ?? []), node]);
  }

  const connect = (sourceType: ResourceType, targetType: ResourceType, label: string): void => {
    const source = nodesByType.get(sourceType)?.[0];
    const target = nodesByType.get(targetType)?.[0];

    if (source === undefined || target === undefined) {
      return;
    }

    addArchitectureEdge(
      edges,
      `canonical-${source.id}-to-${target.id}`,
      source.id,
      target.id,
      label
    );
  };
  const connectOneToAll = (sourceType: ResourceType, targetType: ResourceType, label: string): void => {
    const source = nodesByType.get(sourceType)?.[0];

    if (source === undefined) {
      return;
    }

    for (const target of nodesByType.get(targetType) ?? []) {
      addArchitectureEdge(
        edges,
        `canonical-${source.id}-to-${target.id}`,
        source.id,
        target.id,
        label
      );
    }
  };
  const connectAllToOne = (sourceType: ResourceType, targetType: ResourceType, label: string): void => {
    const target = nodesByType.get(targetType)?.[0];

    if (target === undefined) {
      return;
    }

    for (const source of nodesByType.get(sourceType) ?? []) {
      addArchitectureEdge(
        edges,
        `canonical-${source.id}-to-${target.id}`,
        source.id,
        target.id,
        label
      );
    }
  };
  const connectIds = (sourceId: string, targetId: string, label: string): void => {
    if (!nodeById.has(sourceId) || !nodeById.has(targetId)) {
      return;
    }

    addArchitectureEdge(
      edges,
      `canonical-${sourceId}-to-${targetId}`,
      sourceId,
      targetId,
      label
    );
  };

  if (patternIds.includes("alb-asg-ec2") || patternIds.includes("ecs-fargate") || patternIds.includes("multi-az-rds")) {
    if (usesRoleAwareNetwork) {
      for (const subnet of nodesByType.get("SUBNET") ?? []) {
        connectIds("vpc-main", subnet.id, "contains");
      }
      connectIds("vpc-main", "internet-gateway", "attaches");
      connectIds("nat-eip-a", "nat-gateway-a", "allocates");
      connectIds("nat-eip-b", "nat-gateway-b", "allocates");
      connectIds("public-subnet-a", "nat-gateway-a", "hosts");
      connectIds("public-subnet-b", "nat-gateway-b", "hosts");
      const routeAssociations = [
        ["public-route-table", "public-route-association-a", "public-subnet-a"],
        ["public-route-table", "public-route-association-b", "public-subnet-b"],
        ["private-route-table-a", "private-app-route-association-a", "private-app-subnet-a"],
        ["private-route-table-b", "private-app-route-association-b", "private-app-subnet-b"],
        ["private-route-table-a", "private-db-route-association-a", "private-db-subnet-a"],
        ["private-route-table-b", "private-db-route-association-b", "private-db-subnet-b"]
      ] as const;
      for (const [routeTableId, associationId, subnetId] of routeAssociations) {
        connectIds(routeTableId, associationId, "associates");
        connectIds(associationId, subnetId, "binds");
      }
    } else {
      connectOneToAll("VPC", "SUBNET", "contains");
      connect("VPC", "INTERNET_GATEWAY", "attaches");
      connectOneToAll("INTERNET_GATEWAY", "ROUTE_TABLE", "routes");
      connectAllToOne("ROUTE_TABLE", "ROUTE_TABLE_ASSOCIATION", "associates");
      connect("ROUTE_TABLE_ASSOCIATION", "SUBNET", "binds");
    }
  }

  if (patternIds.includes("alb-asg-ec2")) {
    if (usesRoleAwareEc2) {
      connectIds("public-subnet-a", "application-load-balancer", "hosts ALB");
      connectIds("public-subnet-b", "application-load-balancer", "hosts ALB");
      connectIds("application-load-balancer", "http-listener", "listens");
      connectIds("http-listener", "app-target-group", "forwards");
      connectIds("app-target-group", "app-auto-scaling-group", "targets fleet");
      connectIds("app-auto-scaling-group", "app-launch-template", "launches");
      connectIds("app-ami", "app-launch-template", "machine image");
      connectIds("app-instance-profile", "app-launch-template", "instance identity");
      connectIds("app-instance-profile", "app-runtime-role", "uses role");
      connectIds("app-runtime-role", "app-runtime-policy", "attaches policy");
      connectIds("app-runtime-policy", "app-log-group", "writes logs");
      connectIds("app-scaling-policy", "app-auto-scaling-group", "scales fleet");
      connectIds("app-auto-scaling-group", "app-cpu-alarm", "monitors CPU");
      connectIds("alb-security-group", "application-load-balancer", "protects");
      connectIds("app-security-group", "app-auto-scaling-group", "protects instances");
      for (const [index, instance] of (nodesByType.get("EC2") ?? []).entries()) {
        connectIds("app-auto-scaling-group", instance.id, "manages fleet");
        connectIds(
          roleAwarePrivateAppSubnetIds[index % roleAwarePrivateAppSubnetIds.length]!,
          instance.id,
          "hosts private instance"
        );
      }
      for (const bucket of nodesByType.get("S3") ?? []) {
        if (bucket.config.bucketPurpose === "user_uploads") {
          connectIds("app-auto-scaling-group", bucket.id, "stores uploads");
        }
      }
    } else {
      connect("LOAD_BALANCER", "LOAD_BALANCER_LISTENER", "listens");
      connect("LOAD_BALANCER_LISTENER", "LOAD_BALANCER_TARGET_GROUP", "forwards");
      connect("LOAD_BALANCER_TARGET_GROUP", "AUTO_SCALING_GROUP", "targets");
      connect("AUTO_SCALING_GROUP", "LAUNCH_TEMPLATE", "launches");
      connectOneToAll("AUTO_SCALING_GROUP", "EC2", "manages");
      connectAllToOne("SECURITY_GROUP", "LOAD_BALANCER", "protects");
    }
  }

  if (patternIds.includes("serverless-api")) {
    connect("API_GATEWAY_REST_API", "API_GATEWAY_RESOURCE", "contains");
    connect("API_GATEWAY_RESOURCE", "API_GATEWAY_METHOD", "exposes");
    connect("API_GATEWAY_METHOD", "API_GATEWAY_INTEGRATION", "integrates");
    connect("API_GATEWAY_INTEGRATION", "LAMBDA", "invokes");
    connect("LAMBDA_PERMISSION", "LAMBDA", "allows invoke");
    connect("API_GATEWAY_DEPLOYMENT", "API_GATEWAY_STAGE", "publishes");
    connect("IAM_ROLE", "LAMBDA", "authorizes");
    connect("LAMBDA", "CLOUDWATCH_LOG_GROUP", "logs");
  }

  if (patternIds.includes("spa-cloudfront-s3")) {
    const cloudFront = nodesByType.get("CLOUDFRONT")?.[0];
    const staticBucket = (nodesByType.get("S3") ?? []).find(
      (node) => node.config.bucketPurpose === "static_website_origin"
    ) ?? nodesByType.get("S3")?.[0];
    if (cloudFront !== undefined && staticBucket !== undefined) {
      connectIds(cloudFront.id, staticBucket.id, "private origin");
    }
    if (usesRoleAwareNetwork && cloudFront !== undefined) {
      connectIds(cloudFront.id, "application-load-balancer", "API origin");
    }
  }

  if (patternIds.includes("ecs-fargate")) {
    if (usesRoleAwareEcs) {
      connectIds("app-repository", "ecs-task-definition", "image");
      connectIds("ecs-cluster", "ecs-service", "runs");
      connectIds("ecs-task-definition", "ecs-service", "defines");
      connectIds("application-load-balancer", "http-listener", "listens");
      connectIds("http-listener", "app-target-group", "forwards");
      connectIds("app-target-group", "ecs-service", "targets ip");
      connectIds("alb-security-group", "application-load-balancer", "protects");
      connectIds("app-security-group", "ecs-service", "protects");
      connectIds("ecs-execution-role", "ecs-task-definition", "pulls image and logs");
      connectIds("ecs-task-role", "ecs-task-definition", "application permissions");
      connectIds("ecs-task-policy", "ecs-task-role", "least privilege");
      connectIds("ecs-task-definition", "ecs-log-group", "logs");
      connectIds("ecs-service", "app-cpu-alarm", "monitors");
      connectIds("private-app-subnet-a", "ecs-service", "places tasks");
      connectIds("private-app-subnet-b", "ecs-service", "places tasks");
      for (const bucket of nodesByType.get("S3") ?? []) {
        if (bucket.config.bucketPurpose !== "static_website_origin") {
          connectIds("ecs-service", bucket.id, "stores uploads");
        }
      }
    } else {
      connect("ECR_REPOSITORY", "ECS_TASK_DEFINITION", "image");
      connect("ECS_CLUSTER", "ECS_SERVICE", "runs");
      connect("ECS_TASK_DEFINITION", "ECS_SERVICE", "defines");
      connect("LOAD_BALANCER", "LOAD_BALANCER_LISTENER", "listens");
      connect("LOAD_BALANCER_LISTENER", "LOAD_BALANCER_TARGET_GROUP", "forwards");
      connect("LOAD_BALANCER_TARGET_GROUP", "ECS_SERVICE", "targets ip");
      connect("IAM_ROLE", "ECS_TASK_DEFINITION", "authorizes");
      connect("ECS_TASK_DEFINITION", "CLOUDWATCH_LOG_GROUP", "logs");
      connectAllToOne("SECURITY_GROUP", "ECS_SERVICE", "protects");
    }
  }

  if (patternIds.includes("github-cicd-codedeploy")) {
    connect("CODESTAR_CONNECTION", "CODEPIPELINE", "sources");
    connect("CODEPIPELINE", "CODEBUILD_PROJECT", "builds");
    connectOneToAll("CODEBUILD_PROJECT", "S3", "stores artifact");
    connect("S3", "CODEDEPLOY_APP", "releases");
    connect("CODEDEPLOY_APP", "CODEDEPLOY_DEPLOYMENT_GROUP", "deploys");
    connect("IAM_ROLE", "CODEPIPELINE", "authorizes");
    connect("IAM_ROLE", "CODEBUILD_PROJECT", "authorizes");
    connect("IAM_ROLE", "CODEDEPLOY_DEPLOYMENT_GROUP", "authorizes");
  }

  if (patternIds.includes("multi-az-rds")) {
    if (usesRoleAwareNetwork) {
      connectIds("private-db-subnet-a", "db-subnet-group", "member");
      connectIds("private-db-subnet-b", "db-subnet-group", "member");
      connectIds("db-subnet-group", "app-database", "places");
      connectIds("db-security-group", "app-database", "protects");
      connectIds("app-security-group", "db-security-group", "allows PostgreSQL");
      connectIds("database-secret", "app-database", "credentials");
      connectIds("app-database", "db-cpu-alarm", "monitors");
    } else {
      connectOneToAll("SUBNET", "DB_SUBNET_GROUP", "members");
      connect("DB_SUBNET_GROUP", "RDS", "places");
      connectAllToOne("SECURITY_GROUP", "RDS", "protects");
      connect("SECRETS_MANAGER_SECRET", "RDS", "credentials");
      connect("RDS", "CLOUDWATCH_METRIC_ALARM", "monitors");
    }
  }

  connect("S3", "LAMBDA", "object event");
  connect("LAMBDA", "SQS_QUEUE", "enqueues");
  connect("LAMBDA", "DYNAMODB_TABLE", "writes");
  connect("SQS_QUEUE", "ECS_SERVICE", "work queue");
  connect("EVENTBRIDGE_PERMISSION", "EVENTBRIDGE_RULE", "authorizes");
  connect("EVENTBRIDGE_RULE", "EVENTBRIDGE_TARGET", "triggers");
  connect("EVENTBRIDGE_TARGET", "ECS_TASK_DEFINITION", "runs task");
  connect("EVENTBRIDGE_TARGET", "LAMBDA", "invokes");
  connectOneToAll("SUBNET", "EKS_CLUSTER", "places");
  connectAllToOne("SECURITY_GROUP", "EKS_CLUSTER", "protects");
  connect("EKS_CLUSTER", "EKS_NODE_GROUP", "manages");
  connectOneToAll("EKS_CLUSTER", "EKS_ADDON", "installs");
  connect("LOAD_BALANCER", "EKS_CLUSTER", "routes");
  connect("LOAD_BALANCER_TARGET_GROUP", "EKS_CLUSTER", "targets");
  connect("IAM_ROLE", "EKS_CLUSTER", "authorizes");
  connect("EKS_CLUSTER", "CLOUDWATCH_LOG_GROUP", "logs");
  connect("WAF_WEB_ACL", "WAF_WEB_ACL_ASSOCIATION", "associates");
  connect("WAF_WEB_ACL_ASSOCIATION", "CLOUDFRONT", "protects");
  connect("WAF_WEB_ACL_ASSOCIATION", "LOAD_BALANCER", "protects");

  if ((nodesByType.get("WAF_WEB_ACL_ASSOCIATION")?.length ?? 0) === 0) {
    connect("WAF_WEB_ACL", "CLOUDFRONT", "protects");
    connect("WAF_WEB_ACL", "LOAD_BALANCER", "protects");
  }

  connect("API_GATEWAY_V2_ROUTE", "API_GATEWAY_V2_INTEGRATION", "integrates");
  connect("API_GATEWAY_V2_INTEGRATION", "LAMBDA", "invokes");
  connect("API_GATEWAY_V2_STAGE", "API_GATEWAY_V2_ROUTE", "publishes");
  if (!usesRoleAwareNetwork) {
    connect("IAM_POLICY", "IAM_ROLE", "least privilege");
  }
  connect("ACM_CERTIFICATE", "ACM_CERTIFICATE_VALIDATION", "validates");
  connect("ACM_CERTIFICATE_VALIDATION", "CLOUDFRONT", "secures");
  connect("ACM_CERTIFICATE_VALIDATION", "LOAD_BALANCER_LISTENER", "secures");
  connect("ACM_CERTIFICATE_VALIDATION", "API_GATEWAY_REST_API", "secures");
  connectOneToAll("KMS_KEY", "S3", "encrypts");
  connectOneToAll("KMS_KEY", "RDS", "encrypts");
  connectOneToAll("KMS_KEY", "DYNAMODB_TABLE", "encrypts");
  connectAllToOne("EC2", "CLOUDWATCH_LOG_GROUP", "logs");
  if (!usesRoleAwareEcs) {
    connect("ECS_SERVICE", "CLOUDWATCH_METRIC_ALARM", "monitors");
  }
  connect("LAMBDA", "CLOUDWATCH_METRIC_ALARM", "monitors");

  return {
    nodes: architectureJson.nodes,
    edges
  };
}

function requiresFargateArchitecture(normalizedPrompt: string): boolean {
  return hasPromptTerm(normalizedPrompt, ["ecs fargate", "fargate service", "fargate task", "fargate runtime"]);
}

function explicitlyForbidsEc2Runtime(normalizedPrompt: string): boolean {
  return hasPromptTerm(normalizedPrompt, [
    "without ec2",
    "no ec2",
    "no ec2 capacity",
    "ec2 excluded",
    "ec2 is excluded",
    "ec2 not allowed",
    "serverless runtime",
    "lambda only",
    "ec2 없이",
    "ec2는 사용하지 않",
    "ec2는 필요 없",
    "ec2 제외"
  ]);
}

function resolveTrafficProfile(normalizedPrompt: string): ArchitectureAnswerProfile["traffic"] {
  if (/(bursty|event\s+spike|unpredictable|급변동|이벤트|예측\s*불가)/iu.test(normalizedPrompt)) {
    return "bursty";
  }

  if (/(large\s+traffic|10,?000|500\+|대규모|일\s*10,?000|동시\s*500)/iu.test(normalizedPrompt)) {
    return "large";
  }

  if (/(medium\s+traffic|1,?000|concurrent\s+50|중간\s*규모|일\s*1,?000|동시\s*50|동접자?\s*1000)/iu.test(normalizedPrompt)) {
    return "medium";
  }

  if (/(small\s+traffic|under\s+10|100명\s*미만|소규모|동시\s*10명\s*미만)/iu.test(normalizedPrompt)) {
    return "small";
  }

  return undefined;
}

function resolveFrontendProfile(normalizedPrompt: string): ArchitectureAnswerProfile["frontend"] {
  if (isMobileAppPrompt(normalizedPrompt)) {
    return "mobile";
  }

  if (/(next\.?js|nuxt|ssr|server\s*side|서버\s*사이드)/iu.test(normalizedPrompt)) {
    return "ssr";
  }

  if (/(spa|single\s*page|react|vue|angular)/iu.test(normalizedPrompt)) {
    return "spa";
  }

  if (/(static\s+site|html\/css\/js|pure\s+web|정적\s*사이트|순수\s*웹|회사\s*소개|포트폴리오|블로그)/iu.test(normalizedPrompt)) {
    return "static";
  }

  return undefined;
}

function resolveBackendProfile(normalizedPrompt: string): ArchitectureAnswerProfile["backend"] {
  if (requiresNoBackend(normalizedPrompt)) {
    return "none";
  }

  if (/(microservice|마이크로서비스)/iu.test(normalizedPrompt)) {
    return "microservices";
  }

  if (requiresComplexBackend(normalizedPrompt)) {
    return "complex";
  }

  if (/(simple\s+api|api\s+server|node\.?js|python\s*flask|간단\s*api|api\s*서버)/iu.test(normalizedPrompt)) {
    return "simple_api";
  }

  return undefined;
}

function resolveRegionProfile(normalizedPrompt: string): ArchitectureAnswerProfile["region"] {
  if (requiresKoreaOnlyRegion(normalizedPrompt)) {
    return "korea";
  }

  if (/(global|worldwide|united\s+states|europe|글로벌|미국|유럽)/iu.test(normalizedPrompt)) {
    return "global";
  }

  if (/(asia\s*pacific|apac|tokyo|singapore|아시아\s*태평양|도쿄|싱가포르)/iu.test(normalizedPrompt)) {
    return "apac";
  }

  if (/(specific\s+region|중국|일본|특정\s*지역)/iu.test(normalizedPrompt)) {
    return "specific";
  }

  return undefined;
}

function resolveUploadProfile(normalizedPrompt: string): ArchitectureAnswerProfile["upload"] {
  if (hasNoFileUploadRequirement(normalizedPrompt)) {
    return "none";
  }

  if (/(large\s+file|100mb|대용량)/iu.test(normalizedPrompt)) {
    return "large";
  }

  if (/(mixed\s+files?|documents?|video|동영상|문서|다양한\s*파일)/iu.test(normalizedPrompt)) {
    return "mixed";
  }

  if (requiresImageUpload(normalizedPrompt)) {
    return "image";
  }

  return undefined;
}

function resolveRealtimeProfile(normalizedPrompt: string): ArchitectureAnswerProfile["realtime"] {
  if (hasNoRealtimeRequirement(normalizedPrompt)) {
    return "none";
  }

  if (/(chat|채팅)/iu.test(normalizedPrompt)) {
    return "chat";
  }

  if (/(data\s+updates?|주식|게임|데이터\s*업데이트)/iu.test(normalizedPrompt)) {
    return "data_updates";
  }

  if (/(notification|notify|알림)/iu.test(normalizedPrompt)) {
    return "notification";
  }

  return undefined;
}

function resolveManagementProfile(normalizedPrompt: string): ArchitectureAnswerProfile["management"] {
  if (/(fully\s*managed|serverless|관리\s*최소|완전\s*관리형|서버리스)/iu.test(normalizedPrompt)) {
    return "fully_managed";
  }

  if (/(semi[-\s]*managed|some\s+server|반관리|semi-managed)/iu.test(normalizedPrompt)) {
    return "semi_managed";
  }

  if (/(self[-\s]*managed|direct\s+management|직접\s*관리|셀프)/iu.test(normalizedPrompt)) {
    return "self_managed";
  }

  if (/(unknown|모르겠|상관없|추천)/iu.test(normalizedPrompt)) {
    return "unknown";
  }

  return undefined;
}

function resolveLatencyProfile(normalizedPrompt: string): ArchitectureAnswerProfile["latency"] {
  if (/(1\s*second|under\s*1\s*(second|sec|s)\b|1초|1\s*초)/iu.test(normalizedPrompt)) {
    return "one_second";
  }

  if (/(3\s*seconds?|under\s*3\s*(seconds?|sec|s)\b|3초|3\s*초)/iu.test(normalizedPrompt)) {
    return "three_seconds";
  }

  if (/(5\s*seconds?|under\s*5\s*(seconds?|sec|s)\b|5초|5\s*초)/iu.test(normalizedPrompt)) {
    return "five_seconds";
  }

  if (/(loading\s*time:\s*(no\s+preference|none)|latency:\s*(no\s+preference|none)|로딩\s*시간[\s\S]{0,20}(상관없|선호\s*없음))/iu.test(normalizedPrompt)) {
    return "none";
  }

  return undefined;
}

function resolveAvailabilityProfile(normalizedPrompt: string): ArchitectureAnswerProfile["availability"] {
  if (requiresVeryHighAvailability(normalizedPrompt)) {
    return "99.99";
  }

  if (/(99\.9|월\s*1시간|1\s*hour)/iu.test(normalizedPrompt)) {
    return "99.9";
  }

  if (/(99%|하루\s*몇\s*시간|few\s+hours)/iu.test(normalizedPrompt)) {
    return "99";
  }

  if (/(downtime\s+tolerance:\s*(no\s+preference|none)|availability:\s*(no\s+preference|none)|가용성[\s\S]{0,20}(상관없|선호\s*없음)|중단[\s\S]{0,20}(상관없|선호\s*없음))/iu.test(normalizedPrompt)) {
    return "none";
  }

  return undefined;
}

function resolveBudgetProfile(normalizedPrompt: string): ArchitectureAnswerProfile["budget"] {
  if (hasLowMonthlyBudget(normalizedPrompt) || /(minimum\s+cost|very\s+low|10만원\s*미만|최소\s*비용)/iu.test(normalizedPrompt)) {
    return "low";
  }

  if (/(10-50만원|moderate|normal|적당한\s*성능)/iu.test(normalizedPrompt)) {
    return "normal";
  }

  if (/(50-200만원|high\s+budget|고성능)/iu.test(normalizedPrompt)) {
    return "high";
  }

  if (/(enterprise|200만원\s*이상|엔터프라이즈)/iu.test(normalizedPrompt)) {
    return "enterprise";
  }

  return undefined;
}

function hasExplicitArchitectureBrief(prompt: string): boolean {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();

  if (
    /(?:required\s+components|architecture\s+flow|validation\s+checklist|\uD544\uC218\s*\uD3EC\uD568\s*\uCEF4\uD3EC\uB10C\uD2B8|\uD575\uC2EC\s*\uC694\uAD6C\uC0AC\uD56D|\uC544\uD0A4\uD14D\uCC98\s*\uD50C\uB85C\uC6B0|\uAC80\uC99D\s*\uAC00\uB2A5\uD55C\s*\uAE30\uC900)/iu.test(
      normalizedPrompt
    )
  ) {
    return true;
  }

  const explicitComponentMentions = [
    /cloudfront/iu,
    /\bs3\b|simple\s*storage|\uC774\uBBF8\uC9C0\s*\uC800\uC7A5|\uC815\uC801\s*\uC790\uC0B0/iu,
    /application\s*load\s*balancer|\balb\b|load\s*balancer/iu,
    /rds|multi-az|db\s*subnet/iu,
    /websocket|sse|api\s*gateway|\uC2E4\uC2DC\uAC04\s*\uC54C\uB9BC/iu,
    /vpc|subnet|\uC11C\uBE0C\uB137/iu,
    /cloudwatch/iu,
    /iam/iu
  ].filter((pattern) => pattern.test(normalizedPrompt)).length;

  const explicitFlowMentions = [
    /user[\s\S]{0,40}cloudfront|\uC0AC\uC6A9\uC790[\s\S]{0,40}cloudfront/iu,
    /cloudfront[\s\S]{0,40}s3/iu,
    /cloudfront[\s\S]{0,80}(load\s*balancer|alb)/iu,
    /(ec2|backend)[\s\S]{0,40}rds/iu,
    /presigned\s*url|\uC0AC\uC804\s*\uC11C\uBA85|\uD504\uB9AC\uC0AC\uC778/iu
  ].filter((pattern) => pattern.test(normalizedPrompt)).length;

  return explicitComponentMentions >= 5 && explicitFlowMentions >= 2;
}

function hasBudgetAvailabilityConflict(normalizedPrompt: string): boolean {
  return hasLowMonthlyBudget(normalizedPrompt) && requiresVeryHighAvailability(normalizedPrompt);
}

function hasLowMonthlyBudget(normalizedPrompt: string): boolean {
  return /(\$\s*100|100\s*(usd|dollars?|monthly)|monthly\s*100|budget\s*cost:\s*100|\uC6D4\s*\$?\s*100|\uC608\uC0B0[\s\S]{0,20}100)/iu.test(
    normalizedPrompt
  );
}

function hasBudgetAvailabilityResolution(normalizedPrompt: string): boolean {
  return /(99\.9%|relax\s*availability|cost\s*warning|target\s*architecture|keep\s*99\.99|\uAC00\uC6A9\uC131[\s\S]{0,20}\uC644\uD654|\uBE44\uC6A9[\s\S]{0,20}\uACBD\uACE0|\uC608\uC0B0[\s\S]{0,20}\uCD08\uACFC|\uBAA9\uD45C\s*\uC544\uD0A4\uD14D\uCC98)/iu.test(
    normalizedPrompt
  );
}

function hasGlobalDeploymentDecision(normalizedPrompt: string): boolean {
  return /(cloudfront[\s\S]{0,30}(global|\uAE00\uB85C\uBC8C)|api\/rds[\s\S]{0,30}(single|\uB2E8\uC77C)|single\s*region|multi[-\s]*region|future\s*multi[-\s]*region|\uB2E8\uC77C\s*\uB9AC\uC804|\uB2E4\uC911\s*\uB9AC\uC804)/iu.test(
    normalizedPrompt
  );
}

function requiresGlobalDeploymentScopeDecision(normalizedPrompt: string): boolean {
  if (requiresKoreaOnlyRegion(normalizedPrompt)) {
    return false;
  }

  return /(global|worldwide|united\s+states|europe|\uAE00\uB85C\uBC8C|\uBBF8\uAD6D|\uC720\uB7FD|1\s*second|1\uCD08)/iu.test(
    normalizedPrompt
  );
}

function hasRealtimeImplementationDecision(normalizedPrompt: string): boolean {
  return /(websocket|web\s*socket|sse|server-sent\s*events|polling|api\s*gateway|\uC6F9\uC18C\uCF13|\uC5F0\uACB0\s*\uACBD\uB85C|\uD3F4\uB9C1)/iu.test(
    normalizedPrompt
  );
}

function mentionsAutoScalingGroup(normalizedPrompt: string): boolean {
  return /(auto\s*scaling\s*group|\basg\b|autoscaling\s*group|\uC624\uD1A0\s*\uC2A4\uCF00\uC77C|\uC790\uB3D9\s*\uD655\uC7A5)/iu.test(
    normalizedPrompt
  );
}

function dedupeNonEmptyLines(lines: readonly string[]): string[] {
  const seenLines = new Set<string>();
  const dedupedLines: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || seenLines.has(trimmedLine)) {
      continue;
    }

    seenLines.add(trimmedLine);
    dedupedLines.push(trimmedLine);
  }

  return dedupedLines;
}

function requiresNoDatabase(normalizedPrompt: string): boolean {
  return /(database:\s*(none|no)|no\s+database|database\s+not\s+required|\uB370\uC774\uD130\uBCA0\uC774\uC2A4[\s\S]{0,60}\uD544\uC694\s*\uC5C6\uC74C|\uD544\uC694\s*\uC5C6\uC74C[\s\S]{0,60}\uB370\uC774\uD130\uBCA0\uC774\uC2A4|\uC815\uC801\s*\uCF58\uD150\uCE20\uB9CC)/iu.test(
    normalizedPrompt
  );
}

function requiresDatabase(normalizedPrompt: string): boolean {
  if (requiresNoDatabase(normalizedPrompt)) {
    return false;
  }

  return /(database|\bdb\b|rds|postgres|postgresql|mysql|dynamodb|relational|\uB370\uC774\uD130\uBCA0\uC774\uC2A4|\uC0AC\uC6A9\uC790\s*\uC815\uBCF4|\uAC8C\uC2DC\uAE00)/iu.test(
    normalizedPrompt
  );
}

function requiresNoBackend(normalizedPrompt: string): boolean {
  return /(backend:\s*(none|no)|no\s+backend|backend\s+not\s+required|\uBC31\uC5D4\uB4DC[\s\S]{0,60}\uD544\uC694\s*\uC5C6\uC74C|\uD544\uC694\s*\uC5C6\uC74C[\s\S]{0,60}\uC815\uC801\s*\uC0AC\uC774\uD2B8)/iu.test(
    normalizedPrompt
  );
}

function requiresSpaFrontend(normalizedPrompt: string): boolean {
  return /(spa|single\s*page|react|vue|angular)/iu.test(normalizedPrompt);
}

function requiresComplexBackend(normalizedPrompt: string): boolean {
  return /(complex\s+backend|complex\s+business|business\s+logic|spring\s*boot|django|microservice|\uBCF5\uC7A1\s*(?:\uBE44\uC988\uB2C8\uC2A4|\uBC31\uC5D4\uB4DC)|\uBE44\uC988\uB2C8\uC2A4\s*\uB85C\uC9C1|\uB9C8\uC774\uD06C\uB85C\uC11C\uBE44\uC2A4)/iu.test(
    normalizedPrompt
  );
}

function requiresGlobalOrFastFrontend(normalizedPrompt: string): boolean {
  return /(global|worldwide|united\s+states|europe|\uAE00\uB85C\uBC8C|\uBBF8\uAD6D|\uC720\uB7FD|1\s*second|1\uCD08|https:\s*required|ssl:\s*required|https[\s\S]{0,30}\uD544\uC218|ssl[\s\S]{0,30}\uD544\uC218)/iu.test(
    normalizedPrompt
  );
}

function requiresImageUpload(normalizedPrompt: string): boolean {
  if (hasNoFileUploadRequirement(normalizedPrompt)) {
    return false;
  }

  return /(image\s+upload|images?\s+only|profile\s+image|post\s+image|\uC774\uBBF8\uC9C0|\uC0AC\uC9C4)/iu.test(normalizedPrompt);
}

function requiresRealtime(normalizedPrompt: string): boolean {
  if (hasNoRealtimeRequirement(normalizedPrompt)) {
    return false;
  }

  return /(realtime|real-time|notification|chat|websocket|\bsse\b|\uC2E4\uC2DC\uAC04\s*\uC54C\uB9BC|\uCC44\uD305)/iu.test(normalizedPrompt);
}

function requiresVeryHighAvailability(normalizedPrompt: string): boolean {
  return /(99\.99|no\s+downtime|zero\s+downtime|\uBB34\uC911\uB2E8|\uC808\uB300\s*\uC548\uB428)/iu.test(normalizedPrompt);
}

function mentionsRealtimePath(text: string): boolean {
  return /(realtime|real-time|notification|websocket|\bsse\b|notify|\uC2E4\uC2DC\uAC04\s*\uC54C\uB9BC|\uCC44\uD305)/iu.test(text);
}

function requiresAlbEc2TrafficPath(normalizedPrompt: string): boolean {
  return /((alb|application\s*load\s*balancer|load\s*balancer|로드\s*밸런서)[\s\S]{0,80}(ec2|auto\s*scaling|autoscaling|asg|인스턴스|서버|뒤|트래픽)|(ec2|인스턴스|서버)[\s\S]{0,80}(alb|application\s*load\s*balancer|load\s*balancer|로드\s*밸런서)\s*(뒤|behind)?)/iu.test(
    normalizedPrompt
  );
}

function requiresAutoScalingGroupEc2RuntimePath(normalizedPrompt: string): boolean {
  return mentionsAutoScalingGroup(normalizedPrompt) && /(ec2|instance|instances|fleet|runtime|런타임|인스턴스|서버|alb|load\s*balancer|로드\s*밸런서)/iu.test(normalizedPrompt);
}

function requiresEc2PrivateSubnetSplit(normalizedPrompt: string): boolean {
  if (
    [
      /(ec2|instances?|servers?)[\s\S]{0,120}(split|spread|distribut|across|between)[\s\S]{0,80}(two|2)[\s\S]{0,30}private\s*subnets?/iu,
      /(ec2|instances?|servers?)[\s\S]{0,120}(two|2)[\s\S]{0,30}private\s*subnets?[\s\S]{0,80}(split|spread|distribut|across|between)/iu,
      /private\s*subnets?[\s\S]{0,40}(two|2)[\s\S]{0,120}(ec2|instances?|servers?)[\s\S]{0,80}(split|spread|distribut|across|between)/iu
    ].some((pattern) => pattern.test(normalizedPrompt))
  ) {
    return true;
  }

  return /((ec2|인스턴스|서버)[\s\S]{0,120}(private\s*subnets?\s*2|2\s*private\s*subnets|프라이빗\s*서브넷\s*2|서브넷\s*2개)[\s\S]{0,80}(split|spread|distribut|나눠|분산|배치)|(private\s*subnets?\s*2|2\s*private\s*subnets|프라이빗\s*서브넷\s*2|서브넷\s*2개)[\s\S]{0,120}(ec2|인스턴스|서버)[\s\S]{0,80}(split|spread|distribut|나눠|분산|배치))/iu.test(
    normalizedPrompt
  );
}

function requiresKoreaOnlyRegion(normalizedPrompt: string): boolean {
  return /(region:\s*(korea|seoul)|korea\s*only|seoul\s*region|ap-northeast-2|\uD55C\uAD6D\uB9CC|\uC11C\uC6B8\s*\uB9AC\uC804)/iu.test(
    normalizedPrompt
  );
}

function hasNoFileUploadRequirement(normalizedPrompt: string): boolean {
  if (
    /(?:file\s*upload:\s*(?:none|no)|no\s+file\s+upload|upload:\s*none|text\s*only)/iu.test(
      normalizedPrompt
    )
  ) {
    return true;
  }

  const lines = normalizedPrompt.split(/\r?\n/u).map((line) => line.trim());
  const noUploadAnswer = /^(?:\uC5C6\uC74C(?:\s*\(\uD14D\uC2A4\uD2B8\uB9CC\))?|\uD14D\uC2A4\uD2B8\uB9CC)$/u;
  const sameLineNoUpload = /\uD30C\uC77C(?:\s*\uC5C5\uB85C\uB4DC)?[^\r\n]{0,40}(?:\uC5C6\uC74C|\uC5C6\uACE0|\uC5C6\uB2E4|\uC5C6\uAC8C|\uC5C6\uC774|\uC5C6\uB294|\uC81C\uC678)/u;

  for (const [index, line] of lines.entries()) {
    if (line.includes("?놁쓬") && line.includes("?띿뒪?몃쭔")) {
      return true;
    }

    if (sameLineNoUpload.test(line)) {
      return true;
    }

    if (/\uD30C\uC77C\s*\uC5C5\uB85C\uB4DC/u.test(line)) {
      for (const answerLine of lines.slice(index + 1, index + 7)) {
        if (answerLine === "\uC9C8\uBB38") {
          break;
        }

        if (noUploadAnswer.test(answerLine)) {
          return true;
        }
      }
    }
  }

  return lines.some((line) => noUploadAnswer.test(line) && lines.length === 1);
}

function hasNoRealtimeRequirement(normalizedPrompt: string): boolean {
  return /(?:realtime:\s*(?:none|no)|real-time:\s*(?:none|no)|no\s+realtime|no\s+real-time|no\s+real\s*time|\uC2E4\uC2DC\uAC04[\s\S]{0,80}(?:\uD544\uC694\s*\uC5C6\uC74C|\uC5C6\uC74C)|\uD544\uC694\s*\uC5C6\uC74C[\s\S]{0,80}\uC2E4\uC2DC\uAC04)/iu.test(
    normalizedPrompt
  );
}

function hasExplicitDatabaseMarker(normalizedPrompt: string): boolean {
  return /(database|db\b|rds|postgres|postgresql|mysql|dynamodb|relational|\uB370\uC774\uD130\uBCA0\uC774\uC2A4|\uC0AC\uC6A9\uC790\s*\uC815\uBCF4|\uAC8C\uC2DC\uAE00)/iu.test(
    normalizedPrompt
  );
}

function hasExplicitComplexBackendMarker(normalizedPrompt: string): boolean {
  return /(complex\s+backend|complex\s+business|business\s+logic|spring\s*boot|django|microservice|\uBCF5\uC7A1\s*(?:\uBE44\uC988\uB2C8\uC2A4|\uBC31\uC5D4\uB4DC)|\uBE44\uC988\uB2C8\uC2A4\s*\uB85C\uC9C1|\uB9C8\uC774\uD06C\uB85C\uC11C\uBE44\uC2A4)/iu.test(
    normalizedPrompt
  );
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

  if (parsed.status === "plan") {
    const plan = parseArchitectureIntentPlan(parsed);

    if (plan === null) {
      throw new Error("Amazon Q architecture plan must include supported planning fields");
    }

    return {
      status: "plan",
      title: typeof parsed.title === "string" && parsed.title.trim().length > 0
        ? parsed.title.trim()
        : "Amazon Q Architecture Draft",
      plan,
      assumptions: readStringArray(parsed.assumptions),
      explanations: readStringArray(parsed.explanations)
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
    requirementCoverage: readRequirementCoverage(parsed.requirementCoverage),
    assumptions: readStringArray(parsed.assumptions),
    explanations: readStringArray(parsed.explanations),
    summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
    highlights: readStringArray(parsed.highlights),
    nextActions: readStringArray(parsed.nextActions)
  };
}

function readRequirementCoverage(value: unknown): AmazonQRequirementCoverage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isObject(item) || typeof item.answer !== "string" || typeof item.status !== "string") {
      return [];
    }

    return [
      {
        answer: item.answer,
        status: item.status,
        ...(typeof item.capability === "string" ? { capability: item.capability } : {}),
        ...(Array.isArray(item.nodes) ? { nodes: item.nodes.filter((node): node is string => typeof node === "string") } : {}),
        ...(typeof item.assumption === "string" ? { assumption: item.assumption } : {})
      }
    ];
  });
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
