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
  "User region: Korea only => prefer Seoul/ap-northeast-2 assumptions and regional cost efficiency; Asia Pacific => include CLOUDFRONT when frontend/media exists and note regional latency assumptions; global including US/Europe => include CLOUDFRONT and a global entry assumption, and warn when a single-region database/API cannot guarantee global sub-second API latency; specific region => preserve that region in assumptions and resource labels.",
  "Budget: very low/minimum budget => prefer serverless/static/minimal managed resources and clearly trade off high availability; moderate budget => balance managed services with cost controls; high budget => allow Multi-AZ, load balancing, stronger monitoring, encryption, and backups; enterprise budget => include stronger resilience/security/operations assumptions. Never hide a budget/SLA conflict.",
  "HTTPS: required => include CLOUDFRONT or LOAD_BALANCER HTTPS path, ROUTE53_RECORD when a domain is implied, and certificate requirements in config/assumptions because ACM is not a supported node type; optional HTTP => keep HTTPS recommendation in nextActions but do not overbuild solely for certificates; unknown => recommend HTTPS in nextActions.",
  "File upload: none => do not add a media bucket for uploads; image only => include a separate S3 media bucket and presigned upload flow; documents/video/mixed files => include S3 media bucket, IAM policy boundaries, KMS when security matters, and lifecycle/size assumptions; large files over 100MB => use direct-to-S3 upload assumptions and avoid proxying through the app server.",
  "Realtime: none => do not add realtime-only nodes; realtime chat => include a persistent notification/chat path using supported API/backend resources and explain WebSocket/SSE assumptions; realtime notification => include a lighter notification path and do not omit it; realtime data updates => include stronger scaling/monitoring assumptions for the update stream.",
  "Management preference: fully managed/serverless => prefer S3, CLOUDFRONT, LAMBDA, API_GATEWAY_REST_API, and managed RDS where data is required, avoiding manually managed EC2 unless explicitly requested; semi-managed => LOAD_BALANCER plus EC2 app tier or managed services with some server responsibility is acceptable; direct/self-managed => EC2 is acceptable but still include security, logs, backups, and alarms; unknown => choose the lowest-operational-burden option that satisfies other answers.",
  "Page loading goal: under 1 second => use CLOUDFRONT for static/media assets and warn when dynamic API latency is limited by region/database placement; under 3 seconds => use normal CDN/static caching when suitable; under 5 seconds => avoid expensive over-optimization unless required by other answers; no preference => optimize for cost and simplicity.",
  "Website size: under 10MB => static/CDN-friendly minimal asset assumptions; 10MB-100MB => normal SPA/static asset delivery; 100MB-1GB/image-heavy => media S3 bucket, CloudFront caching, and lifecycle assumptions; 1GB+/video => S3 media storage, CloudFront delivery, and direct upload/lifecycle assumptions.",
  "Traffic pattern: steady => stable baseline capacity; time-of-day peak => autoscaling/alarms or burst assumptions; event spike => elastic/serverless or explicit scale-out plus alarm assumptions; unpredictable => prefer elastic capacity and stronger monitoring.",
  "Downtime tolerance: 99.99% or no downtime => no single-AZ/single-EC2 design when backend/database exists, include Multi-AZ app and RDS Multi-AZ where applicable; 99.9% => use at least managed backups/monitoring and consider Multi-AZ for stateful tiers; 99% => cost-optimized single-region/simple redundancy may be acceptable; no preference => choose cost-conscious defaults."
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
    isAnswered: (prompt) =>
      /(정적|블로그|포트폴리오|회사\s*소개|dynamic|동적|쇼핑몰|게시판|회원\s*시스템|spa|single\s*page|api\s*서버)/i.test(
        prompt
      )
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
    isAnswered: (prompt) =>
      /(예상\s*트래픽|트래픽|소규모|중간\s*규모|대규모|급변동|일\s*100명|일\s*1,000명|일\s*1000명|일\s*10,000명|일\s*10000명|동접|동시\s*접속|동시\s*접속자|동시\s*\d[\d,]*\s*명|동시\s*10명|동시\s*50명|동시\s*500명|daily\s*traffic|concurrent\s*users?)/i.test(
        prompt
      )
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
    isAnswered: (prompt) =>
      /(데이터베이스|database|\bdb\b|rds|postgres|mysql|dynamodb|정적\s*콘텐츠|사용자\s*정보|게시글|10gb|100gb|복잡한\s*쿼리)/i.test(
        prompt
      )
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
    isAnswered: (prompt) =>
      /(프론트엔드|프론트|frontend|html|css|javascript|\bjs\b|react|vue|angular|next\.?js|nuxt\.?js|ssr|순수\s*웹|웹뷰|네이티브)/i.test(
        prompt
      )
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
    isAnswered: (prompt) =>
      /(백엔드|backend|간단한\s*api|node\.?js|python|flask|복잡한\s*비즈니스|spring\s*boot|django|마이크로서비스|여러\s*서비스)/i.test(
        prompt
      )
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
    isAnswered: (prompt) =>
      /(주요\s*사용자\s*지역|한국|서울|아시아\s*태평양|도쿄|싱가포르|글로벌|미국|유럽|중국|일본|global|korea|asia|worldwide)/i.test(
        prompt
      )
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
    isAnswered: (prompt) => /(예산|비용|월\s*\d|만원|최소\s*비용|적당한\s*성능|고성능|엔터프라이즈|budget|cost|krw|usd)/i.test(prompt)
  },
  {
    id: "ssl",
    question: "SSL 인증서(HTTPS)가 필요한가요?",
    suggestions: [
      "필수 (보안 중요)",
      "선택사항 (HTTP도 괜찮음)",
      "모르겠음 (추천해주세요)"
    ],
    isAnswered: (prompt) => /(ssl|https|인증서|보안\s*중요|http도\s*괜찮음|추천해주세요|domain|도메인)/i.test(prompt)
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
    isAnswered: (prompt) =>
      /(파일\s*업로드|텍스트만|이미지만|프로필|게시글\s*이미지|다양한\s*파일|문서|동영상|대용량\s*파일|100mb|upload|image|document|file)/i.test(
        prompt
      )
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
    isAnswered: (prompt) => /(실시간|채팅|알림|데이터\s*업데이트|주식|게임|realtime|real-time|chat|notification|websocket)/i.test(prompt)
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
    isAnswered: (prompt) => /(관리\s*복잡도|완전\s*관리형|반관리형|직접\s*관리|서버리스|serverless|서버\s*직접\s*운영|managed|추천해주세요)/i.test(prompt)
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
    isAnswered: (prompt) => /(페이지\s*로딩|로딩\s*시간|1초\s*이내|3초\s*이내|5초\s*이내|느려도\s*괜찮음|상관없음|loading\s*time)/i.test(prompt)
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
    isAnswered: (prompt) =>
      /(전체\s*웹사이트\s*크기|사이트\s*크기|10mb\s*미만|10mb-100mb|100mb-1gb|1gb\s*이상|간단한\s*사이트|일반적인\s*사이트|이미지\s*많은\s*사이트|동영상\s*포함)/i.test(
        prompt
      )
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
    isAnswered: (prompt) => /(트래픽\s*패턴|일정함|하루\s*종일\s*비슷|시간대별\s*차이|낮에\s*많음|이벤트성\s*급증|특정\s*시기|예측\s*불가)/i.test(prompt)
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
    isAnswered: (prompt) => /(서비스\s*중단|중단\s*허용|절대\s*안됨|99\.99%|월\s*1시간|99\.9%|월\s*8시간|99%\s*가용성|상관없음)/i.test(prompt)
  }
];

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

  if (requiresImageUpload(normalizedPrompt)) {
    requirements.push("- Include a separate S3 media/upload bucket and represent presigned URL upload assumptions.");
    flows.push("- Client -> presigned URL -> S3 media/upload bucket.");
    validation.push("- Do not reuse the SPA asset bucket as the only image-upload resource.");
  }

  if (requiresRealtime(normalizedPrompt)) {
    requirements.push("- Include a realtime notification path. Use API_GATEWAY_REST_API/LAMBDA or the backend tier as the supported node representation, and state WebSocket/SSE assumptions in requirementCoverage.");
    flows.push("- Client -> realtime notification endpoint -> backend/Lambda notification path.");
    validation.push("- requirementCoverage must name WebSocket, SSE, notification, or realtime and map it to node ids.");
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
    if (countComputeTargets(architectureJson) === 1) {
      issues.push("The user selected 99.99% availability/no downtime, but the preview has only one app compute target. Add redundant compute targets in separate availability assumptions behind a load balancer.");
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
    s3Nodes.some((node) => /upload|media|image|profile|post|attachment|asset|file|이미지|업로드|미디어/iu.test(createNodeSearchText(node)))
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
  return /(serverless|서버리스|lambda|람다|without\s+ec2|no\s+ec2|ec2\s*(없는|없이|빼고|제외|말고)|ec2는\s*쓰지\s*마)/iu.test(
    normalizedPrompt
  );
}

function hasExplicitArchitectureBrief(prompt: string): boolean {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();

  if (
    /(필수\s*포함\s*컴포넌트|핵심\s*요구사항|아키텍처\s*플로우|검증\s*가능한\s*기준|required\s+components|architecture\s+flow|validation\s+checklist)/iu.test(
      normalizedPrompt
    )
  ) {
    return true;
  }

  const explicitComponentMentions = [
    /cloudfront/iu,
    /\bs3\b|simple\s*storage|이미지\s*저장|정적\s*자산/iu,
    /application\s*load\s*balancer|\balb\b|load\s*balancer/iu,
    /rds|multi-az|db\s*subnet/iu,
    /websocket|sse|api\s*gateway|실시간\s*알림/iu,
    /vpc|subnet|서브넷/iu,
    /cloudwatch/iu,
    /iam/iu
  ].filter((pattern) => pattern.test(normalizedPrompt)).length;

  const explicitFlowMentions = [
    /user\s*[-→>]+\s*cloudfront|사용자\s*[-→>]+\s*cloudfront/iu,
    /cloudfront\s*[-→>]+\s*s3/iu,
    /cloudfront\s*[-→>]+.*load\s*balancer|cloudfront\s*[-→>]+.*alb/iu,
    /ec2\s*[-→>]+\s*rds|backend\s*[-→>]+\s*rds/iu,
    /presigned\s*url|사전\s*서명|프리사인/iu
  ].filter((pattern) => pattern.test(normalizedPrompt)).length;

  return explicitComponentMentions >= 5 && explicitFlowMentions >= 2;
}

function hasBudgetAvailabilityConflict(normalizedPrompt: string): boolean {
  return hasLowMonthlyBudget(normalizedPrompt) && requiresVeryHighAvailability(normalizedPrompt);
}

function hasLowMonthlyBudget(normalizedPrompt: string): boolean {
  return /(\$\s*100|100\s*(usd|dollars?|달러)|monthly\s*100|100\s*monthly|월\s*\$?\s*100|budget\s*cost:\s*100|월\s*100\b)/iu.test(
    normalizedPrompt
  );
}

function hasBudgetAvailabilityResolution(normalizedPrompt: string): boolean {
  return /(99\.9%\s*수준으로\s*완화|가용성.*완화|예산\s*초과\s*허용|cost\s*warning|비용\s*초과\s*경고|목표\s*아키텍처|target\s*architecture|keep\s*99\.99|relax\s*availability)/iu.test(
    normalizedPrompt
  );
}

function hasGlobalDeploymentDecision(normalizedPrompt: string): boolean {
  return /(cloudfront\s*글로벌|api\/rds는\s*단일\s*리전|단일\s*리전|single\s*region|multi[-\s]*region|다중\s*리전|추후\s*다중\s*리전|future\s*multi[-\s]*region)/iu.test(
    normalizedPrompt
  );
}

function requiresGlobalDeploymentScopeDecision(normalizedPrompt: string): boolean {
  return /(global|worldwide|united\s+states|europe|글로벌|미국|유럽|1\s*second|1초|1珥)/iu.test(
    normalizedPrompt
  );
}

function hasRealtimeImplementationDecision(normalizedPrompt: string): boolean {
  return /(websocket|web\s*socket|sse|server-sent\s*events|polling|폴링|api\s*gateway|단방향\s*알림|연결\s*경로)/iu.test(
    normalizedPrompt
  );
}

function mentionsUnsupportedAutoScalingGroup(normalizedPrompt: string): boolean {
  return /(auto\s*scaling\s*group|\basg\b|autoscaling\s*group|오토\s*스케일링|자동\s*확장)/iu.test(
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
  return /(database:\s*(none|no)|no\s+database|database\s+not\s+required|데이터베이스.*필요\s*없음|필요\s*없음.*데이터베이스|정적\s*콘텐츠만)/iu.test(
    normalizedPrompt
  );
}

function requiresDatabase(normalizedPrompt: string): boolean {
  if (requiresNoDatabase(normalizedPrompt)) {
    return false;
  }

  return /(database|db\b|rds|postgres|postgresql|mysql|dynamodb|데이터베이스|사용자\s*정보|게시글|relational)/iu.test(
    normalizedPrompt
  );
}

function requiresNoBackend(normalizedPrompt: string): boolean {
  return /(backend:\s*(none|no)|no\s+backend|backend\s+not\s+required|백엔드.*필요\s*없음|필요\s*없음.*정적\s*사이트)/iu.test(
    normalizedPrompt
  );
}

function requiresSpaFrontend(normalizedPrompt: string): boolean {
  return /(spa|single\s*page|react|vue|angular)/iu.test(normalizedPrompt);
}

function requiresComplexBackend(normalizedPrompt: string): boolean {
  return /(complex\s+backend|complex\s+business|business\s+logic|spring\s*boot|django|microservice|복잡|비즈니스\s*로직|마이크로서비스)/iu.test(
    normalizedPrompt
  );
}

function requiresGlobalOrFastFrontend(normalizedPrompt: string): boolean {
  return /(global|worldwide|united\s+states|europe|글로벌|미국|유럽|1\s*second|1초|https:\s*required|ssl:\s*required|https.*필수|ssl.*필수)/iu.test(
    normalizedPrompt
  );
}

function requiresImageUpload(normalizedPrompt: string): boolean {
  if (/(file\s*upload:\s*(none|no)|no\s+file\s+upload|upload:\s*none|파일\s*업로드.*없음)/iu.test(normalizedPrompt)) {
    return false;
  }

  return /(image\s+upload|images?\s+only|profile\s+image|post\s+image|이미지|사진)/iu.test(normalizedPrompt);
}

function requiresRealtime(normalizedPrompt: string): boolean {
  if (/(realtime:\s*(none|no)|real-time:\s*(none|no)|no\s+realtime|no\s+real-time|실시간.*필요\s*없음)/iu.test(normalizedPrompt)) {
    return false;
  }

  return /(realtime|real-time|notification|chat|websocket|sse|실시간|알림|채팅)/iu.test(normalizedPrompt);
}

function requiresVeryHighAvailability(normalizedPrompt: string): boolean {
  return /(99\.99|no\s+downtime|zero\s+downtime|무중단|절대\s*안됨)/iu.test(normalizedPrompt);
}

function mentionsRealtimePath(text: string): boolean {
  return /(realtime|real-time|notification|websocket|sse|notify|실시간|알림|채팅)/iu.test(text);
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
