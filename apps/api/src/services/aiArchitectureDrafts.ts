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
import {
  SUPPORTED_ARCHITECTURE_RESOURCE_CATALOG,
  SUPPORTED_ARCHITECTURE_RESOURCE_TYPES
} from "./aiArchitectureResourceCatalog.js";
import { planPracticeArchitecture } from "./aiArchitectureRequirementDraftBuilder.js";
import { applyOperatingConditionConfig } from "./aiArchitectureOperatingConditions.js";
import { resolveArchitectureResourceQuantities } from "./aiArchitectureResourceQuantities.js";
import { resolveArchitectureRequirement } from "./aiArchitectureRequirementResolution.js";
import { createArchitectureDraftFallbackExplanation } from "./aiLlmExplanationFallbacks.js";
import {
  createAwsArchitectureReferenceKnowledgePayload,
  createAwsArchitectureReferenceKnowledgePrompt
} from "./awsArchitectureReferenceKnowledge.js";
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

  const conditionalQuestion = findConditionalArchitectureQuestion(request.prompt);

  if (conditionalQuestion !== null) {
    return createArchitectureDraftClarification(conditionalQuestion, request, provider, creditPolicy.billingMode);
  }

  const architectureDecisionSpace = createArchitectureDecisionSpace(request.prompt);
  const architectureBrief = createAmazonQArchitectureBrief(request.prompt);
  const referenceKnowledge = createAwsArchitectureReferenceKnowledgePayload();
  const payload = maskSecretsForAi({
    architectureBrief,
    architectureDecisionSpace,
    prompt: request.prompt,
    referenceKnowledge,
    supportedResourceTypes: SUPPORTED_RESOURCE_TYPES,
    supportedResourceCatalog: SUPPORTED_RESOURCE_CATALOG
  });

  try {
    let activePayload = payload;
    let response = await provider.generate({
      target: ARCHITECTURE_DRAFT_TARGET,
      instructions: createAmazonQArchitectureDraftInstructions(),
      prompt: createAmazonQArchitectureDraftPrompt(request.prompt, architectureDecisionSpace),
      payload: activePayload
    });
    let parsedResponse = parseAmazonQArchitectureDraftResponse(response.text);

    if (parsedResponse.status === "preview") {
      const validationIssues = findAmazonQPreviewValidationIssues(request.prompt, parsedResponse);

      if (validationIssues.length > 0) {
        activePayload = maskSecretsForAi({
          architectureBrief,
          architectureDecisionSpace,
          prompt: request.prompt,
          referenceKnowledge,
          validationIssues,
          previousArchitectureJson: parsedResponse.architectureJson,
          supportedResourceTypes: SUPPORTED_RESOURCE_TYPES,
          supportedResourceCatalog: SUPPORTED_RESOURCE_CATALOG
        });
        response = await provider.generate({
          target: ARCHITECTURE_DRAFT_TARGET,
          instructions: createAmazonQArchitectureDraftInstructions(),
          prompt: createAmazonQArchitectureDraftRepairPrompt(
            request.prompt,
            architectureDecisionSpace,
            validationIssues,
            parsedResponse.architectureJson
          ),
          payload: activePayload
        });
        parsedResponse = parseAmazonQArchitectureDraftResponse(response.text);

        const retryValidationIssues =
          parsedResponse.status === "preview" ? findAmazonQPreviewValidationIssues(request.prompt, parsedResponse) : [];

        if (parsedResponse.status === "preview" && retryValidationIssues.length > 0) {
          throw new Error("Amazon Q architecture draft failed self-validation after retry");
        }
      }
    }

    const providerMetadata = createAiProviderMetadata({
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
  architectureDecisionSpace: ArchitectureDecisionSpace
): string {
  return [
    createAmazonQArchitectureDraftInstructions(),
    createAwsArchitectureReferenceKnowledgePrompt(),
    createAmazonQArchitectureBrief(prompt),
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
  preview: AmazonQArchitectureDraftPreview
): string[] {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();
  const architectureJson = preview.architectureJson;
  const nodeTypes = new Set(architectureJson.nodes.map((node) => node.type));
  const issues: string[] = [];

  if (requiresServerlessOnlyArchitecture(normalizedPrompt) && nodeTypes.has("EC2")) {
    issues.push("The user requested serverless or no EC2, but the preview includes EC2. Regenerate without EC2 and use serverless supported resources such as LAMBDA and API_GATEWAY_REST_API when compute is needed.");
  }

  issues.push(...findRequirementCoverageValidationIssues(normalizedPrompt, preview));
  issues.push(...findArchitectureLayoutValidationIssues(architectureJson));

  return issues;
}

function findRequirementCoverageValidationIssues(
  normalizedPrompt: string,
  preview: AmazonQArchitectureDraftPreview
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

function findRuntimeTopologyValidationIssues(
  normalizedPrompt: string,
  architectureJson: ArchitectureJson
): string[] {
  const issues: string[] = [];

  if (requiresAlbEc2TrafficPath(normalizedPrompt) && !hasAlbToEc2TrafficPath(architectureJson)) {
    issues.push(
      "The user requested EC2 runtime behind an ALB, but the preview does not connect LOAD_BALANCER/LOAD_BALANCER_LISTENER through Auto Scaling or target resources to EC2 nodes. Regenerate with a visible ALB -> ASG/target group -> EC2 traffic path."
    );
  }

  if (requiresAutoScalingGroupEc2RuntimePath(normalizedPrompt) && !hasAutoScalingGroupToEc2Path(architectureJson)) {
    issues.push(
      "The user requested an Auto Scaling Group, but the preview does not connect AUTO_SCALING_GROUP to the EC2 fleet. Regenerate with ASG visibly managing or scaling the EC2 nodes."
    );
  }

  if (requiresEc2PrivateSubnetSplit(normalizedPrompt)) {
    const spread = getEc2SubnetSpread(architectureJson);

    if (spread.privateSubnetCount < 2 || spread.ec2SubnetCount < 2) {
      issues.push(
        `The user requested EC2 instances split across two private subnets, but the preview shows ${spread.ec2SubnetCount} private subnet placement(s) for EC2 across ${spread.privateSubnetCount} private subnet node(s). Regenerate with EC2 nodes distributed across at least two private app subnets.`
      );
    }
  }

  return issues;
}

function findExplicitResourceTypeValidationIssues(
  normalizedPrompt: string,
  architectureJson: ArchitectureJson
): string[] {
  const requestedResourceTypes = findExplicitResourceTypesInPrompt(normalizedPrompt);
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
      createResourcePromptAliases(definition).some((alias) =>
        resourceSearchTextIncludesAlias(normalizedSearchText, compactSearchText, alias)
      )
    ) {
      resourceTypes.add(definition.nodeType);
    }
  }

  return [...resourceTypes];
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
  return architectureJson.nodes.some((node) => {
    const nodeText = createNodeSearchText(node);

    if (node.type === "S3") {
      return /upload|media|image|profile\s*image|post\s*image|attachment|presigned/iu.test(nodeText);
    }

    if (hasAnyNodeType(new Set([node.type]), ["IAM_POLICY", "IAM_ROLE", "LAMBDA", "KMS_KEY"])) {
      return /upload|media|presigned|file\s*processing|image\s*processing/iu.test(nodeText);
    }

    return /presigned\s*url|file\s*upload\s*flow|direct[-\s]*to[-\s]*s3\s*upload/iu.test(nodeText);
  });
}

function hasForbiddenRealtimeResource(preview: AmazonQArchitectureDraftPreview): boolean {
  const hasRealtimeNode = preview.architectureJson.nodes.some((node) => {
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
  });

  if (hasRealtimeNode) {
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
  return /(?:file\s*upload:\s*(?:none|no)|no\s+file\s+upload|upload:\s*none|text\s*only|\uD30C\uC77C[\s\S]{0,80}(?:\uC5C6\uC74C|\uC5C6\uACE0|\uC5C6\uB2E4|\uC5C6\uAC8C|\uC5C6\uC774|\uC5C6\uB294|\uC81C\uC678)|\uC5C6\uC74C\s*\(\uD14D\uC2A4\uD2B8\uB9CC\)|\uD14D\uC2A4\uD2B8\uB9CC)/iu.test(
    normalizedPrompt
  );
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
