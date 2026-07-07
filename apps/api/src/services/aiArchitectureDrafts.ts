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
const DEFAULT_PREVIEW_NODE_SIZE = { width: 124, height: 96 } as const;
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
const AMAZON_Q_CLARIFICATION_CHOICE_CONSTRAINTS = [
  "Clarification choice mapping rules:",
  "Website type: static website => S3 plus CLOUDFRONT only unless another answered choice requires an API; dynamic web application => include frontend delivery, backend compute, data storage when requested, and security boundaries; SPA => S3 plus CLOUDFRONT for static assets and a separate API/backend path when backend is required; API server => focus on API entry, compute, logs, security groups, and database only when requested.",
  "Traffic scale: small traffic or concurrent users under 10 => prefer minimal resources and avoid unnecessary duplication; medium traffic or about daily 1,000/concurrent 50 => include scalable entry and app tier when backend exists; large traffic or daily 10,000+/concurrent 500+ => include load balancing, multiple app targets, stronger alarms, and scale-out assumptions; bursty traffic => prefer elastic/serverless patterns where suitable or explicit scaling assumptions and alarms.",
  "Database: no database => do not add RDS or DB_SUBNET_GROUP; simple data => include the lightest suitable storage and explain assumptions; medium relational data or PostgreSQL/MySQL => include RDS and DB_SUBNET_GROUP in private DB subnets; large or complex data => include stronger RDS config, encryption, backups, alarms, and scaling assumptions.",
  "Frontend: HTML/CSS/JS => S3 plus CLOUDFRONT static delivery; React/Vue/Angular SPA => S3 plus CLOUDFRONT and API origin when backend exists; Next.js/Nuxt.js SSR => include runtime compute or serverless runtime plus static asset delivery; mobile app => emphasize API/backend, auth/security, and media/API entry rather than a website-only frontend.",
  "Backend: none => do not add EC2, LAMBDA, API_GATEWAY_REST_API, LOAD_BALANCER, or RDS solely for backend; simple API => use the smallest supported API path such as LAMBDA plus API_GATEWAY_REST_API or one small EC2 when explicitly preferred; complex business logic => include backend compute behind LOAD_BALANCER plus LOAD_BALANCER_LISTENER with private app subnets when VPC is present; microservices => represent multiple service components or compute nodes and shared entry/observability without inventing unsupported resource types.",
  "User region: Korea only => keep API, database, and regional resources in Seoul/ap-northeast-2 assumptions; CloudFront may be used for fast static delivery, but do not describe the design as multi-region or global-user architecture; Asia Pacific => include CLOUDFRONT when frontend/media exists and note regional latency assumptions; global including US/Europe => include CLOUDFRONT and a global entry assumption, and warn when a single-region database/API cannot guarantee global sub-second API latency; specific region => preserve that region in assumptions and resource labels.",
  "Budget: very low/minimum budget => prefer serverless/static/minimal managed resources and clearly trade off high availability; moderate budget => balance managed services with cost controls; high budget => allow Multi-AZ, load balancing, stronger monitoring, encryption, and backups; enterprise budget => include stronger resilience/security/operations assumptions. Never hide a budget/SLA conflict.",
  "HTTPS: required => include CLOUDFRONT or LOAD_BALANCER HTTPS path, ROUTE53_RECORD when a domain is implied, and certificate requirements in config/assumptions because ACM is not a supported node type; optional HTTP => keep HTTPS recommendation in nextActions but do not overbuild solely for certificates; unknown => recommend HTTPS in nextActions.",
  "File upload: none => STRICTLY FORBIDDEN to add upload/media/file-processing buckets, presigned URL flows, or upload-specific IAM policy paths; image only => include a separate S3 media bucket and presigned upload flow; documents/video/mixed files => include S3 media bucket, IAM policy boundaries, KMS when security matters, and lifecycle/size assumptions; large files over 100MB => use direct-to-S3 upload assumptions and avoid proxying through the app server.",
  "Realtime: none => STRICTLY FORBIDDEN to add WebSocket, SSE, realtime notification, realtime processing, or notification-only resources; realtime chat => include a persistent notification/chat path using supported API/backend resources and explain WebSocket/SSE assumptions; realtime notification => include a lighter notification path and do not omit it; realtime data updates => include stronger scaling/monitoring assumptions for the update stream.",
  "Management preference: fully managed/serverless => prefer S3, CLOUDFRONT, LAMBDA, API_GATEWAY_REST_API, and managed RDS where data is required, avoiding manually managed EC2 unless explicitly requested; semi-managed => LOAD_BALANCER plus EC2 app tier or managed services with some server responsibility is acceptable; direct/self-managed => EC2 is acceptable but still include security, logs, backups, and alarms; unknown => choose the lowest-operational-burden option that satisfies other answers.",
  "Page loading goal: under 1 second => use CLOUDFRONT for static/media assets and warn when dynamic API latency is limited by region/database placement; under 3 seconds => use normal CDN/static caching when suitable; under 5 seconds => avoid expensive over-optimization unless required by other answers; no preference => optimize for cost and simplicity.",
  "Website size: under 10MB => static/CDN-friendly minimal asset assumptions; 10MB-100MB => normal SPA/static asset delivery; 100MB-1GB/image-heavy => media S3 bucket, CloudFront caching, and lifecycle assumptions; 1GB+/video => S3 media storage, CloudFront delivery, and direct upload/lifecycle assumptions.",
  "Traffic pattern: steady => stable baseline capacity; time-of-day peak => autoscaling/alarms or burst assumptions; event spike => elastic/serverless or explicit scale-out plus alarm assumptions; unpredictable => prefer elastic capacity and stronger monitoring.",
  "Downtime tolerance: 99.99% or no downtime => no single-AZ/single-EC2 design when backend/database exists, include Multi-AZ app and RDS Multi-AZ where applicable; 99.9% => use at least managed backups/monitoring and consider Multi-AZ for stateful tiers; 99% => cost-optimized single-region/simple redundancy may be acceptable; no preference => choose cost-conscious defaults."
] as const;

const AMAZON_Q_CLARIFICATION_CHOICE_ENFORCEMENT_RULES = [
  "Complete option enforcement rules:",
  "Question gates: ask realtime implementation only when the user selected realtime chat, realtime notification, or realtime data updates; never ask it when the user selected no realtime. Ask upload implementation only when the user selected image, mixed, or large-file upload; never ask it when the user selected no file upload. Ask multi-region/global performance scope only for Asia Pacific/global/specific-region/global-latency requirements; never ask it just because Korea-only uses CloudFront for static acceleration.",
  "Mutual exclusion: a selected 'none' answer is stronger than a generic feature mention. No backend forbids backend-only compute/API resources unless another explicit answer requires an API. No database forbids RDS/DB_SUBNET_GROUP. No file upload forbids upload/media/presigned/file-processing resources. No realtime forbids WebSocket/SSE/realtime/user-notification resources.",
  "Traffic matrix: small traffic should stay minimal unless availability overrides it; medium traffic should add scalable entry and app capacity when backend exists; large traffic should add load balancing, multiple targets, stronger database and alarms; bursty/event traffic should add elastic scaling assumptions and alarms.",
  "Frontend matrix: pure HTML/CSS/JS should be static S3/CloudFront; SPA should be S3/CloudFront with SPA fallback plus a separate API origin when backend exists; SSR should include runtime compute or serverless runtime and must not be represented as pure S3-only hosting; mobile should emphasize secure APIs, auth assumptions, and upload/API entry rather than website-only hosting.",
  "Backend matrix: no backend means static-only; simple API means Lambda/API Gateway or a small EC2 path; complex business logic means load-balanced backend compute with logs/security boundaries; microservices means multiple service components or compute nodes and shared entry/observability while staying within supported ResourceNode types.",
  "Region matrix: Korea-only means regional resources in ap-northeast-2 and no multi-region wording; Asia Pacific means CloudFront plus APAC latency assumptions; global means CloudFront/global entry and explicit single-region API/RDS latency warning unless multi-region is chosen; specific region means preserve residency/compliance assumptions.",
  "Security matrix: HTTPS required means HTTPS path, certificate assumption/config, and redirect/security notes; HTTP optional means do not overbuild solely for certificates; unknown means recommend HTTPS in nextActions.",
  "Upload matrix: no upload means text/data only; image upload means direct-to-S3/presigned media bucket; mixed documents/video means S3 lifecycle, IAM boundaries, validation/scanning assumptions; large files means multipart/direct-to-S3 and avoid proxying through app compute.",
  "Realtime matrix: no realtime means normal request/response only; chat means persistent connection path and message storage assumptions; notification means lightweight user notification path; realtime data updates means low-latency update path plus scaling/monitoring assumptions.",
  "Management matrix: fully managed prefers S3/CloudFront/Lambda/API Gateway/managed database; semi-managed allows ALB plus EC2 and managed RDS; direct management allows EC2 control but still requires logs/security/backups; unknown picks lowest operational burden that satisfies the answers.",
  "Performance and size matrix: 1-second goal requires CloudFront/static caching and API latency warning when single-region; 3-second goal uses normal CDN/database optimization; 5-second/no preference favors cost and simplicity. Image-heavy/video-heavy sites require media storage/lifecycle/delivery assumptions only when the selected upload/size answers imply those assets.",
  "Traffic pattern matrix: steady traffic favors baseline capacity; daytime peaks favor scheduled scaling/alarms; event spikes favor elastic/serverless or scale-out assumptions; unpredictable traffic favors reactive autoscaling and stronger monitoring.",
  "Availability matrix: 99.99% requires ALB/listener and redundant backend targets when backend exists, plus RDS Multi-AZ when a relational database exists; 99.9% recommends Multi-AZ/monitoring; 99% can be cost optimized; no preference chooses simple cost-conscious defaults.",
  "Conflict resolution: when $100 budget conflicts with 99.99% availability, do not hide the conflict. If the user chose cost priority, relax availability; if the user chose availability priority, include cost-overrun warning; if the user chose target architecture with warning, draw the 99.99% target and clearly mark budget risk. When static-site wording conflicts with DB/API requirements, represent the explicit DB/API requirement or ask a single clarification if unresolved."
] as const;

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

  const architectureBrief = createAmazonQArchitectureBrief(request.prompt);
  const payload = maskSecretsForAi({
    architectureBrief,
    prompt: request.prompt,
    supportedResourceTypes: SUPPORTED_RESOURCE_TYPES
  });

  try {
    let activePayload = payload;
    let response = await provider.generate({
      target: ARCHITECTURE_DRAFT_TARGET,
      instructions: createAmazonQArchitectureDraftInstructions(),
      prompt: createAmazonQArchitectureDraftPrompt(request.prompt),
      payload: activePayload
    });
    let parsedResponse = parseAmazonQArchitectureDraftResponse(response.text);

    if (parsedResponse.status === "preview") {
      const validationIssues = findAmazonQPreviewValidationIssues(request.prompt, parsedResponse);

      if (validationIssues.length > 0) {
        activePayload = maskSecretsForAi({
          architectureBrief,
          prompt: request.prompt,
          validationIssues,
          previousArchitectureJson: parsedResponse.architectureJson,
          supportedResourceTypes: SUPPORTED_RESOURCE_TYPES
        });
        response = await provider.generate({
          target: ARCHITECTURE_DRAFT_TARGET,
          instructions: createAmazonQArchitectureDraftInstructions(),
          prompt: createAmazonQArchitectureDraftRepairPrompt(request.prompt, validationIssues, parsedResponse.architectureJson),
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
  return hasPromptTerm(prompt, ["static", "dynamic", "spa", "single page", "api server", "api 서버", "정적", "동적", "블로그", "포트폴리오", "회사", "소개", "쇼핑몰", "게시판", "회원", "?뺤쟻", "?숈쟻", "釉붾줈", "寃뚯떆", "?뚯썝"]);
}

function isTrafficAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["traffic", "concurrent", "daily", "트래픽", "소규모", "중간 규모", "대규모", "급변동", "동시", "동접", "?몃옒", "?뚭퇋", "以묎컙", "?洹", "湲됰", "?숈떆", "?숈젒"]) || /\b(?:100|1,000|1000|10,000|10000|50|500)\b/iu.test(prompt);
}

function isDatabaseAnswered(prompt: string): boolean {
  return hasPromptTerm(prompt, ["database", " db", "rds", "postgres", "postgresql", "mysql", "dynamodb", "데이터베이스", "정적 콘텐츠", "사용자 정보", "게시글", "?곗씠", "肄섑뀗", "寃뚯떆", "10gb", "100gb"]);
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
      question: "湲濡쒕쾶 ?ъ슜?먯? 1珥?濡쒕뵫 紐⑺몴瑜??대뼡 踰붿쐞濡??ㅺ퀎?좉퉴??",
      suggestions: [
        "CloudFront 湲濡쒕쾶 + API/RDS???⑥씪 由ъ쟾",
        "?ㅼ쨷 由ъ쟾 API源뚯? ?ы븿",
        "MVP???⑥씪 由ъ쟾, 異뷀썑 ?ㅼ쨷 由ъ쟾 ?뺤옣 寃쎄퀬 ?쒖떆"
      ],
      isAnswered: () => true
    };
  }

  if (requiresRealtime(normalizedPrompt) && !hasRealtimeImplementationDecision(normalizedPrompt)) {
    return {
      id: "realtime_implementation",
      question: "?ㅼ떆媛??뚮┝? ?대뼡 諛⑹떇?쇰줈 ?쒗쁽?좉퉴??",
      suggestions: [
        "WebSocket ?곌껐 寃쎈줈",
        "SSE ?⑤갑???뚮┝ 寃쎈줈",
        "媛꾨떒 ?대쭅 諛⑹떇怨?鍮꾩슜 ?덇컧 寃쎄퀬"
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

function createAmazonQArchitectureDraftInstructions(): string {
  return [
    "You are Amazon Q assisting SketchCatch, an IaC operations service.",
    "Return JSON only. Do not wrap the response in markdown.",
    "Recommend a cost- and security-conscious Practice Architecture from the user's requirements.",
    "SketchCatch is provider-neutral, AWS-first for the MVP, and Terraform-first.",
    "Do not perform deployment, apply, update, delete, or destroy actions.",
    "All architecture changes must remain user-accepted previews.",
    `Use only these ResourceNode.type values: ${SUPPORTED_RESOURCE_TYPES.join(", ")}.`,
    "Treat the user's clarification answers as binding architecture constraints, not loose background context. Convert each answered choice into explicit nodes, edges, config, assumptions, and warnings in the preview.",
    ...AMAZON_Q_CLARIFICATION_CHOICE_CONSTRAINTS,
    ...AMAZON_Q_CLARIFICATION_CHOICE_ENFORCEMENT_RULES,
    "For React/Vue/Angular SPA requirements, model frontend delivery as S3 static assets behind CLOUDFRONT unless the user explicitly asks for SSR. Do not serve the SPA only from an application server.",
    "For complex backend/business-logic requirements, include a backend compute tier behind LOAD_BALANCER and LOAD_BALANCER_LISTENER, with private application subnets and SECURITY_GROUP boundaries when VPC networking is present.",
    "For global users, HTTPS-required, or 1-second loading goals, include a global entry path with CLOUDFRONT. Include ROUTE53_RECORD when a domain/HTTPS path is needed. Because ACM is not a supported node type, represent certificate requirements in CloudFront or load balancer config, assumptions, or nextActions instead of inventing an unsupported ACM node.",
    "For image-upload requirements, include a separate S3 media bucket and describe the browser-to-S3 presigned upload flow in explanations, with IAM_ROLE/IAM_POLICY and KMS_KEY when security requirements justify them.",
    "For real-time notification requirements, do not omit the notification path. If a dedicated WebSocket resource type is unavailable, represent the supported notification entry/channel through the backend tier or API_GATEWAY_REST_API/LAMBDA and explain the WebSocket or SSE implementation detail in assumptions.",
    "For 99.99% availability or no-downtime requirements, do not return a single-AZ or single-EC2 architecture. Use at least two Availability Zones, multiple app subnets, LOAD_BALANCER plus LOAD_BALANCER_LISTENER, redundant compute nodes when compute is modeled as EC2, DB_SUBNET_GROUP, and RDS Multi-AZ config when a relational database is required.",
    "If budget constraints conflict with high availability, global latency, or 1-second loading goals, do not silently downgrade the architecture. Return the architecture that satisfies the stated reliability/performance goal and add clear assumptions, warnings, or nextActions about the expected cost trade-off.",
    "Do not artificially limit the architecture to one resource per type. If traffic, availability, security, or cost requirements justify it, use multiple EC2, SUBNET, S3, or other supported resources.",
    "When multiple compute instances are needed, prefer multiple Availability Zones and include LOAD_BALANCER plus LOAD_BALANCER_LISTENER when that is the cost- and security-appropriate entry path.",
    "For high concurrency or high availability requirements such as large concurrent users, 99.9%+ availability, or event traffic spikes, consider horizontally scaled compute across AZs instead of a single EC2 instance.",
    "Layout rules: VPC, SUBNET, and SECURITY_GROUP nodes are area boxes. Nodes related by contains/hosts edges or config references such as vpcId, subnetId, securityGroupIds, or vpcSecurityGroupIds must be fully inside their parent area box.",
    "Unrelated area boxes must not overlap. If an area belongs inside another area, place it fully inside and include the containment relationship. Boundary resources such as INTERNET_GATEWAY may sit on an area edge, but must not float half-overlapping unrelated areas.",
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

function createAmazonQArchitectureDraftPrompt(prompt: string): string {
  return [
    createAmazonQArchitectureDraftInstructions(),
    createAmazonQArchitectureBrief(prompt),
    "User requirement prompt:",
    prompt
  ].join("\n\n");
}

function createAmazonQArchitectureDraftRepairPrompt(
  prompt: string,
  validationIssues: readonly string[],
  previousArchitectureJson: ArchitectureJson
): string {
  return [
    createAmazonQArchitectureDraftInstructions(),
    "The previous preview failed SketchCatch self-validation.",
    "Regenerate the full Architecture Draft JSON. Do not patch partially.",
    "Do not return the same topology. Add or remove nodes and edges needed to satisfy the failed requirement coverage checks.",
    "The regenerated response must include requirementCoverage entries proving how every selected answer is represented.",
    createAmazonQArchitectureBrief(prompt),
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
    requirements.push("- Include S3 for SPA/static asset hosting and CLOUDFRONT as the global/static entry.");
    flows.push("- User -> CLOUDFRONT -> S3 SPA/static assets.");
    validation.push("- Do not serve the SPA only from EC2 or backend compute.");
  }

  if (hasExplicitComplexBackendMarker(normalizedPrompt) && requiresComplexBackend(normalizedPrompt)) {
    intent.push("- Backend requires complex business logic.");
    requirements.push("- Include LOAD_BALANCER plus LOAD_BALANCER_LISTENER and at least two backend compute targets when availability is 99.99% or no-downtime.");
    flows.push("- User/API traffic -> CLOUDFRONT or DNS entry -> LOAD_BALANCER -> backend compute.");
    validation.push("- Do not return a lone EC2 backend for complex business logic.");
  }

  if (hasExplicitDatabaseMarker(normalizedPrompt) && requiresDatabase(normalizedPrompt)) {
    requirements.push("- Include RDS for relational data and DB_SUBNET_GROUP for private database placement.");
    flows.push("- Backend compute -> RDS database.");
  }

  if (hasNoFileUploadRequirement(normalizedPrompt)) {
    requirements.push("- ABSOLUTE CONSTRAINT: The user selected no file upload. Do not create upload/media buckets, presigned URL flows, file-processing resources, or upload-specific IAM policies.");
    validation.push("- Any S3 bucket or IAM path named upload, media, image, attachment, presigned, or file upload violates the selected no-upload answer.");
  } else if (requiresImageUpload(normalizedPrompt)) {
    requirements.push("- Include a separate S3 media/upload bucket and represent presigned URL upload assumptions.");
    flows.push("- Client -> presigned URL -> S3 media/upload bucket.");
    validation.push("- Do not reuse the SPA asset bucket as the only image-upload resource.");
  }

  if (hasNoRealtimeRequirement(normalizedPrompt)) {
    requirements.push("- ABSOLUTE CONSTRAINT: The user selected no realtime feature. Do not create WebSocket, SSE, realtime notification, or realtime processing resources.");
    validation.push("- Any WebSocket/SSE/realtime/notification-specific node, coverage entry, or assumption violates the selected no-realtime answer.");
  } else if (requiresRealtime(normalizedPrompt)) {
    requirements.push("- Include a realtime notification path. Use API_GATEWAY_REST_API/LAMBDA or the backend tier as the supported node representation, and state WebSocket/SSE assumptions in requirementCoverage.");
    flows.push("- Client -> realtime notification endpoint -> backend/Lambda notification path.");
    validation.push("- requirementCoverage must name WebSocket, SSE, notification, or realtime and map it to node ids.");
  }

  if (requiresKoreaOnlyRegion(normalizedPrompt)) {
    requirements.push("- Region scope is Korea only. Keep regional API and database assumptions in Seoul/ap-northeast-2; CloudFront is allowed only as a static/performance CDN, not as a multi-region API design.");
    validation.push("- Do not ask for or imply multi-region/global-user deployment when the user selected Korea only.");
  }

  if (requiresGlobalOrFastFrontend(normalizedPrompt)) {
    requirements.push("- Include CLOUDFRONT for global delivery and explain any single-region API/RDS latency limits.");
    validation.push("- Do not claim global 1-second dynamic API latency from a single region without a warning.");
  }

  if (requiresVeryHighAvailability(normalizedPrompt)) {
    requirements.push("- Include at least two app targets across AZ assumptions, LOAD_BALANCER plus LOAD_BALANCER_LISTENER, DB_SUBNET_GROUP, and RDS Multi-AZ when a database is required.");
    validation.push("- Do not return single-AZ or single-compute architecture for 99.99% availability.");
  }

  if (hasBudgetAvailabilityConflict(normalizedPrompt)) {
    tradeoffs.push("- Monthly $100 budget conflicts with 99.99% availability, ALB, redundant compute, and RDS Multi-AZ. Keep the selected design target and add explicit cost-warning assumptions unless the user chose to relax availability.");
  }

  if (mentionsUnsupportedAutoScalingGroup(normalizedPrompt)) {
    requirements.push("- AUTO_SCALING_GROUP is not a supported ResourceNode.type in ArchitectureJson; model it with multiple EC2 app targets and explain the ASG assumption in labels/config/requirementCoverage.");
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

  if (requiresNoDatabase(normalizedPrompt) && nodeTypes.has("RDS")) {
    issues.push("The user selected no database, but the preview includes RDS. Regenerate without database resources.");
  }

  if (hasExplicitDatabaseMarker(normalizedPrompt) && requiresDatabase(normalizedPrompt) && !nodeTypes.has("RDS")) {
    issues.push("The user selected a database requirement, but the preview does not include RDS. Add an RDS database or ask a clarification if no relational database is intended.");
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

  if (requiresSpaFrontend(normalizedPrompt) && (!nodeTypes.has("S3") || !nodeTypes.has("CLOUDFRONT"))) {
    issues.push("The user selected an SPA frontend, but the preview does not include S3 static assets behind CloudFront. Add the SPA asset bucket and CloudFront entry.");
  }

  if (hasExplicitComplexBackendMarker(normalizedPrompt) && requiresComplexBackend(normalizedPrompt)) {
    if (!nodeTypes.has("LOAD_BALANCER") || !nodeTypes.has("LOAD_BALANCER_LISTENER")) {
      issues.push("The user selected complex backend/business logic, but the preview lacks LOAD_BALANCER and LOAD_BALANCER_LISTENER. Add an explicit backend entry path instead of a lone app server.");
    }
  }

  if (requiresGlobalOrFastFrontend(normalizedPrompt) && !nodeTypes.has("CLOUDFRONT")) {
    issues.push("The user selected global users, HTTPS-sensitive delivery, or a 1-second loading goal, but the preview lacks CloudFront. Add CloudFront for global/static/media acceleration.");
  }

  if (requiresImageUpload(normalizedPrompt) && !hasMediaUploadBucket(architectureJson)) {
    issues.push("The user selected image upload, but the preview lacks a separate S3 media/upload bucket. Add a media bucket and represent the presigned upload flow in edges or explanations.");
  }

  if (requiresRealtime(normalizedPrompt) && !mentionsRealtimePath(coverageText)) {
    issues.push("The user selected realtime chat/notification/data updates, but requirementCoverage does not name a WebSocket, SSE, notification, or realtime path. Add a supported backend/API notification path and coverage entry.");
  }

  if (requiresVeryHighAvailability(normalizedPrompt)) {
    if (requiresBackend(normalizedPrompt) && countComputeTargets(architectureJson) < 2) {
      issues.push("The user selected 99.99% availability/no downtime, but the preview has only one app compute target. Add redundant compute targets in separate availability assumptions behind a load balancer.");
    }

    if (requiresBackend(normalizedPrompt) && (!nodeTypes.has("LOAD_BALANCER") || !nodeTypes.has("LOAD_BALANCER_LISTENER"))) {
      issues.push("The user selected 99.99% availability/no downtime with an API/backend, but the preview lacks LOAD_BALANCER and LOAD_BALANCER_LISTENER. Add ALB/listener in front of redundant compute targets.");
    }

    if (
      hasExplicitDatabaseMarker(normalizedPrompt) &&
      requiresDatabase(normalizedPrompt) &&
      (!nodeTypes.has("DB_SUBNET_GROUP") || !coverageText.includes("multi-az"))
    ) {
      issues.push("The user selected 99.99% availability with a database, but the preview does not prove RDS Multi-AZ with DB_SUBNET_GROUP. Add DB_SUBNET_GROUP and a requirementCoverage/assumption entry that names RDS Multi-AZ.");
    }
  }

  return issues;
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

function countComputeTargets(architectureJson: ArchitectureJson): number {
  const ec2Count = architectureJson.nodes.filter((node) => node.type === "EC2").length;

  if (ec2Count > 0) {
    return ec2Count;
  }

  return architectureJson.nodes.filter((node) => node.type === "LAMBDA").length;
}

function hasMediaUploadBucket(architectureJson: ArchitectureJson): boolean {
  const s3Nodes = architectureJson.nodes.filter((node) => node.type === "S3");

  return (
    s3Nodes.length > 1 ||
    s3Nodes.some((node) => /upload|media|image|profile|post|attachment|asset|file|\uC774\uBBF8\uC9C0|\uC5C5\uB85C\uB4DC|\uBBF8\uB514\uC5B4/iu.test(createNodeSearchText(node)))
  );
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

function mentionsUnsupportedAutoScalingGroup(normalizedPrompt: string): boolean {
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
  return /(complex\s+backend|complex\s+business|business\s+logic|spring\s*boot|django|microservice|\uBCF5\uC7A1|\uBE44\uC988\uB2C8\uC2A4\s*\uB85C\uC9C1|\uB9C8\uC774\uD06C\uB85C\uC11C\uBE44\uC2A4)/iu.test(
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

function requiresKoreaOnlyRegion(normalizedPrompt: string): boolean {
  return /(region:\s*(korea|seoul)|korea\s*only|seoul\s*region|ap-northeast-2|\uD55C\uAD6D\uB9CC|\uC11C\uC6B8\s*\uB9AC\uC804)/iu.test(
    normalizedPrompt
  );
}

function hasNoFileUploadRequirement(normalizedPrompt: string): boolean {
  return /(?:file\s*upload:\s*(?:none|no)|no\s+file\s+upload|upload:\s*none|text\s*only|\uD30C\uC77C[\s\S]{0,80}\uC5C6\uC74C|\uC5C6\uC74C\s*\(\uD14D\uC2A4\uD2B8\uB9CC\)|\uD14D\uC2A4\uD2B8\uB9CC)/iu.test(
    normalizedPrompt
  );
}

function hasNoRealtimeRequirement(normalizedPrompt: string): boolean {
  return /(?:realtime:\s*(?:none|no)|real-time:\s*(?:none|no)|no\s+realtime|no\s+real-time|no\s+real\s*time|\uC2E4\uC2DC\uAC04[\s\S]{0,80}(?:\uD544\uC694\s*\uC5C6\uC74C|\uC5C6\uC74C)|\uD544\uC694\s*\uC5C6\uC74C[\s\S]{0,80}\uC2E4\uC2DC\uAC04)/iu.test(
    normalizedPrompt
  );
}

function requiresBackend(normalizedPrompt: string): boolean {
  if (requiresNoBackend(normalizedPrompt)) {
    return false;
  }

  return /(backend|api\b|node\.?js|python|flask|spring|django|server|ec2|lambda|\uAC04\uB2E8\s*api|\uBCF5\uC7A1\s*\uBE44\uC988\uB2C8\uC2A4|\uBC31\uC5D4\uB4DC|\uC11C\uBC84)/iu.test(
    normalizedPrompt
  );
}
function hasExplicitDatabaseMarker(normalizedPrompt: string): boolean {
  return /(database|db\b|rds|postgres|postgresql|mysql|dynamodb|relational|\uB370\uC774\uD130\uBCA0\uC774\uC2A4|\uC0AC\uC6A9\uC790\s*\uC815\uBCF4|\uAC8C\uC2DC\uAE00)/iu.test(
    normalizedPrompt
  );
}

function hasExplicitComplexBackendMarker(normalizedPrompt: string): boolean {
  return /(complex\s+backend|complex\s+business|business\s+logic|spring\s*boot|django|microservice)/iu.test(
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
