import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type {
  AiProviderMetadata,
  AiSafetyExplanation,
  CheckFinding,
  LlmExplanationFallbackReason
} from "@sketchcatch/types";
import {
  createNormalizedAiCacheKey,
  estimateAiUsage,
  maskSecretsForAi
} from "./aiProviderSafety.js";

const SAFETY_EXPLANATION_ROUTE_TARGET = "safety_finding_explanation";
const DEFAULT_OPENAI_MODEL = "gpt-5.5";
const OPENAI_TIMEOUT_MS = 10_000;
const OPENAI_MAX_RETRIES = 0;
const SAFETY_EXPLANATION_MAX_LENGTH = 700;
const SAFETY_EXPLANATION_STEP_MAX_COUNT = 5;

const aiSafetyExplanationSchema = z.object({
  riskSummary: z.string(),
  whyDangerous: z.string(),
  recommendedFix: z.string(),
  terraformHint: z.string().nullable(),
  verificationSteps: z.array(z.string()),
  fallbackUsed: z.literal(false)
});

const aiSafetyExplanationTextFormat = zodTextFormat(
  aiSafetyExplanationSchema,
  "ai_safety_explanation"
);

export type OpenAiSafetyParseRequest = {
  readonly model: string;
  readonly instructions: string;
  readonly input: string;
  readonly text: {
    readonly format: unknown;
  };
};

export type OpenAiSafetyParseResponse = {
  readonly output_parsed: unknown;
};

export type OpenAiSafetyResponsesClient = {
  readonly responses: {
    readonly parse: (request: OpenAiSafetyParseRequest) => Promise<OpenAiSafetyParseResponse>;
  };
};

export type OpenAiSafetyClientOptions = {
  readonly apiKey: string;
  readonly timeout: number;
  readonly maxRetries: number;
};

export type CreateConfiguredOpenAiSafetyFindingExplanationOptions = {
  readonly apiKey?: string | undefined;
  readonly model?: string | undefined;
  readonly createClient?: ((options: OpenAiSafetyClientOptions) => OpenAiSafetyResponsesClient) | undefined;
};

export type CreateOpenAiSafetyFindingExplanationOptions = {
  readonly apiKey?: string | undefined;
  readonly client: OpenAiSafetyResponsesClient;
  readonly model?: string | undefined;
};

export type CreateSafetyFindingExplanation = (
  finding: CheckFinding
) => Promise<AiSafetyExplanation>;

type SafetyFindingTemplate = {
  readonly keywords: readonly string[];
  readonly riskSummary: string;
  readonly whyDangerous: string;
  readonly recommendedFix: string;
  readonly terraformHint?: string | undefined;
  readonly verificationSteps: readonly string[];
};

const SAFETY_FINDING_TEMPLATES: readonly SafetyFindingTemplate[] = [
  {
    keywords: ["metadata service", "imds", "http_tokens", "session token", "세션 토큰"],
    riskSummary: "EC2 인스턴스 메타데이터 서비스(IMDS)가 v2 세션 토큰을 요구하지 않습니다.",
    whyDangerous:
      "IMDS v1은 세션 토큰 없이 메타데이터에 접근할 수 있어 SSRF나 내부 네트워크 접근 경로가 생겼을 때 임시 자격 증명 노출 위험이 커집니다.",
    recommendedFix:
      "`aws_instance` 리소스의 `metadata_options`에서 `http_tokens = \"required\"`를 설정하세요.",
    terraformHint:
      'metadata_options 블록을 추가하고 `http_tokens = "required"`를 지정하세요.',
    verificationSteps: [
      "`metadata_options.http_tokens`가 `required`인지 확인합니다.",
      "Terraform validation과 배포 전 검사를 다시 실행합니다.",
      "IMDSv2 관련 finding이 사라졌는지 확인합니다."
    ]
  },
  {
    keywords: ["s3_versioning", "aws-0090", "버전 관리", "versioning"],
    riskSummary: "S3 버킷 버전 관리가 활성화되어 있지 않습니다.",
    whyDangerous:
      "버전 관리가 없으면 객체를 실수로 덮어쓰거나 삭제했을 때 이전 버전을 복구하기 어렵습니다.",
    recommendedFix:
      "`aws_s3_bucket_versioning` 리소스에서 `versioning_configuration.status = \"Enabled\"`를 설정하세요.",
    terraformHint:
      "S3 버킷을 참조하는 `aws_s3_bucket_versioning` 리소스와 `versioning_configuration` 블록을 추가하세요.",
    verificationSteps: [
      "버킷의 Versioning 상태가 Enabled인지 확인합니다.",
      "배포 전 검사를 다시 실행해 AWS-0090 finding이 사라졌는지 확인합니다."
    ]
  },
  {
    keywords: ["s3_kms_encryption", "aws-0132", "고객 관리형 kms", "customer managed key"],
    riskSummary: "S3 버킷 암호화에 고객 관리형 KMS 키가 사용되지 않습니다.",
    whyDangerous:
      "고객 관리형 KMS 키가 없으면 키 정책, 접근 제어, 감사와 키 수명주기를 조직 요구사항에 맞게 직접 관리하기 어렵습니다.",
    recommendedFix:
      "`aws_s3_bucket_server_side_encryption_configuration`에서 SSE-KMS와 고객 관리형 KMS 키를 설정하세요.",
    terraformHint:
      "`sse_algorithm = \"aws:kms\"`와 `kms_master_key_id`를 명시하세요.",
    verificationSteps: [
      "S3 기본 암호화가 SSE-KMS를 사용하는지 확인합니다.",
      "고객 관리형 KMS key ARN이 연결되어 있는지 확인합니다.",
      "배포 전 검사를 다시 실행해 AWS-0132 finding이 사라졌는지 확인합니다."
    ]
  },
  {
    keywords: ["public_ssh", "open-ssh", "ssh", "0.0.0.0/0", "::/0"],
    riskSummary: "SSH 접근이 전체 인터넷에 노출되어 있습니다.",
    whyDangerous:
      "인터넷의 누구나 인스턴스에 SSH 로그인을 시도할 수 있습니다. 키, 사용자, 호스트 설정 중 하나라도 약하면 배포 검토 전에 서버가 침해될 수 있습니다.",
    recommendedFix:
      "SSH ingress를 신뢰할 수 있는 관리자 CIDR로 제한하거나 SSH를 제거하고 AWS Systems Manager Session Manager를 사용하세요.",
    terraformHint:
      'aws_security_group ingress 규칙에서 cidr_blocks = ["0.0.0.0/0"]를 신뢰할 수 있는 CIDR로 바꾸거나 SSH 규칙을 제거하세요.',
    verificationSteps: [
      "22번 포트가 0.0.0.0/0 또는 ::/0에 열려 있지 않은지 확인합니다.",
      "Terraform validation과 배포 전 검사를 다시 실행합니다.",
      "배포 검토를 시작하기 전에 해당 finding이 사라졌는지 확인합니다."
    ]
  },
  {
    keywords: ["storage_encrypted", "encrypt", "encryption", "암호화"],
    riskSummary: "RDS DB 인스턴스 암호화가 활성화되어 있지 않습니다.",
    whyDangerous:
      "저장 데이터가 암호화되지 않으면 스냅샷, 백업, 스토리지 계층에서 데이터 보호 수준이 낮아집니다.",
    recommendedFix:
      "`storage_encrypted = true`를 설정하고 필요하면 `kms_key_id`로 관리형 KMS 키를 지정하세요.",
    terraformHint:
      "`aws_db_instance` 또는 관련 RDS 리소스에 `storage_encrypted = true`를 추가하세요.",
    verificationSteps: [
      "`storage_encrypted`가 true인지 확인합니다.",
      "필요한 경우 승인된 KMS 키가 지정되어 있는지 확인합니다.",
      "배포 전 검사를 다시 실행합니다."
    ]
  },
  {
    keywords: ["backup_retention", "backup retention", "backup_retention_period", "보존 기간", "백업 보존"],
    riskSummary: "RDS 백업 보존 기간이 너무 짧게 설정되어 있습니다.",
    whyDangerous:
      "백업 보존 기간이 짧으면 장애, 실수, 침해 이후 복구 가능한 시점이 부족해 데이터 복구 선택지가 줄어듭니다.",
    recommendedFix:
      "`backup_retention_period`를 2일 이상 또는 운영 복구 정책에 맞는 기간으로 설정하세요.",
    terraformHint:
      "`aws_db_instance` 또는 `aws_rds_cluster`에 `backup_retention_period`를 명시하세요.",
    verificationSteps: [
      "`backup_retention_period`가 1보다 큰 값인지 확인합니다.",
      "운영 복구 정책에서 요구하는 보존 기간과 일치하는지 확인합니다.",
      "배포 전 검사를 다시 실행합니다."
    ]
  },
  {
    keywords: ["public_rds", "public-rds", "publiclyaccessible", "publicly_accessible", "public network", "public database", "퍼블릭"],
    riskSummary: "데이터베이스가 퍼블릭 네트워크에서 접근 가능할 수 있습니다.",
    whyDangerous:
      "퍼블릭 DB 엔드포인트는 인증 정보 대입 공격, 무차별 대입 공격, 의도치 않은 데이터 노출의 공격면을 넓힙니다.",
    recommendedFix:
      "public 접근을 끄고 DB를 private subnet에 두며 보안 그룹 접근을 애플리케이션 계층으로 제한하세요.",
    terraformHint:
      "`publicly_accessible = false`를 설정하고 DB subnet group이 private subnet을 사용하도록 구성하세요.",
    verificationSteps: [
      "`publicly_accessible`이 false인지 확인합니다.",
      "DB subnet group이 private subnet을 사용하는지 확인합니다.",
      "배포 전 검사를 다시 실행합니다."
    ]
  },
  {
    keywords: [
      "s3_public_access",
      "aws-0086",
      "aws-0087",
      "aws-0091",
      "aws-0093",
      "public_s3",
      "public-s3",
      "bucket policy",
      "public acl"
    ],
    riskSummary: "S3 버킷 객체가 공개될 수 있습니다.",
    whyDangerous:
      "공개 ACL이나 과도한 bucket policy는 업로드 파일, Terraform 산출물, 사용자 데이터를 익명 사용자에게 노출할 수 있습니다.",
    recommendedFix:
      "공개 ACL과 공개 bucket policy statement를 제거하고 S3 Block Public Access를 활성화하세요.",
    terraformHint:
      "aws_s3_bucket_public_access_block에서 block_public_acls, block_public_policy, ignore_public_acls, restrict_public_buckets를 true로 설정하세요.",
    verificationSteps: [
      "공개 ACL이나 Principal \"*\" 허용 정책이 남아 있지 않은지 확인합니다.",
      "S3 Block Public Access가 활성화되어 있는지 확인합니다.",
      "배포 전 검사를 다시 실행합니다."
    ]
  },
  {
    keywords: ["iam_wildcard", "iam", "wildcard", "permission"],
    riskSummary: "IAM 정책이 과도하게 넓은 권한을 부여합니다.",
    whyDangerous:
      "와일드카드 action이나 resource는 역할이 오용되거나 탈취됐을 때 관련 없는 클라우드 리소스까지 변경하게 만들 수 있습니다.",
    recommendedFix:
      "와일드카드 action과 resource를 이 아키텍처에 필요한 최소 action 목록과 resource ARN으로 바꾸세요.",
    terraformHint:
      "aws_iam_policy_document 또는 inline policy JSON에서 Action = \"*\"와 Resource = \"*\"를 피하세요.",
    verificationSteps: [
      "IAM 정책 action이 명시적으로 제한되어 있는지 확인합니다.",
      "resource 범위가 필요한 ARN으로 제한되어 있는지 확인합니다.",
      "배포 전 검사를 다시 실행합니다."
    ]
  },
  {
    keywords: ["cost", "expensive", "비용"],
    riskSummary: "이 리소스는 월간 실습 비용을 증가시킬 수 있습니다.",
    whyDangerous:
      "큰 instance class나 항상 켜져 있는 managed service는 반복 실습 배포 중 예상치 못한 비용을 만들 수 있습니다.",
    recommendedFix:
      "지원 가능한 가장 작은 instance class를 사용하고, free-tier에 가까운 기본값을 선호하며, 검증 후 사용하지 않는 환경은 정리하세요.",
    verificationSteps: [
      "비용 추정과 fallback 가정을 검토합니다.",
      "선택한 instance class가 의도된 값인지 확인합니다.",
      "변경 후 비용 검토를 다시 실행합니다."
    ]
  }
];

const DEFAULT_SAFETY_FINDING_TEMPLATE: SafetyFindingTemplate = {
  keywords: [],
  riskSummary: "이 항목은 배포 전에 수동 검토가 필요합니다.",
  whyDangerous:
    "결정적 safety rule이 보안, 안정성, 구성, 비용에 영향을 줄 수 있는 조건을 발견했습니다.",
  recommendedFix: "finding 설명과 권장 수정을 검토한 뒤 Terraform 또는 아키텍처를 수정하고 다시 배포하세요.",
  verificationSteps: [
    "권장 변경 사항을 적용합니다.",
    "Terraform validation을 실행합니다.",
    "배포 전 검사를 다시 실행합니다."
  ]
};

export function createConfiguredOpenAiSafetyFindingExplanation(
  options: CreateConfiguredOpenAiSafetyFindingExplanationOptions = {}
): CreateSafetyFindingExplanation {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

  if (apiKey === undefined || apiKey.trim().length === 0) {
    return async (finding) => createFallbackSafetyFindingExplanation(finding, "missing_api_key");
  }

  const createClient = options.createClient ?? createDefaultOpenAiSafetyResponsesClient;
  const client = createClient({
    apiKey,
    timeout: OPENAI_TIMEOUT_MS,
    maxRetries: OPENAI_MAX_RETRIES
  });

  return createOpenAiSafetyFindingExplanation({
    apiKey,
    client,
    model: options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL
  });
}

export function createOpenAiSafetyFindingExplanation(
  options: CreateOpenAiSafetyFindingExplanationOptions
): CreateSafetyFindingExplanation {
  return async (finding) => {
    if (options.apiKey === undefined || options.apiKey.trim().length === 0) {
      return createFallbackSafetyFindingExplanation(finding, "missing_api_key");
    }

    const payload = createSafetyFindingPayload(finding);
    const model = options.model ?? DEFAULT_OPENAI_MODEL;

    try {
      const response = await options.client.responses.parse({
        model,
        instructions: createSafetyFindingInstructions(),
        input: JSON.stringify(payload),
        text: {
          format: aiSafetyExplanationTextFormat
        }
      });

      return validateOpenAiSafetyExplanation(finding, payload, model, response.output_parsed);
    } catch (error) {
      return createFallbackSafetyFindingExplanation(finding, classifyOpenAiError(error));
    }
  };
}

export function createFallbackSafetyFindingExplanation(
  finding: CheckFinding,
  fallbackReason: LlmExplanationFallbackReason = "missing_api_key"
): AiSafetyExplanation {
  const template = selectSafetyFindingTemplate(finding);
  const output = {
    riskSummary: template.riskSummary,
    whyDangerous: template.whyDangerous,
    recommendedFix: template.recommendedFix,
    terraformHint: template.terraformHint,
    verificationSteps: [...template.verificationSteps]
  };

  return {
    ...output,
    fallbackUsed: true,
    fallbackReason,
    providerMetadata: createFallbackProviderMetadata(finding, output)
  };
}

function createDefaultOpenAiSafetyResponsesClient(options: OpenAiSafetyClientOptions): OpenAiSafetyResponsesClient {
  const client = new OpenAI({
    apiKey: options.apiKey,
    timeout: options.timeout,
    maxRetries: options.maxRetries
  });

  return {
    responses: {
      parse: async (request) => {
        const response = await client.responses.parse({
          model: request.model,
          instructions: request.instructions,
          input: request.input,
          text: {
            format: aiSafetyExplanationTextFormat,
            verbosity: "low"
          },
          store: false
        });

        return { output_parsed: response.output_parsed };
      }
    }
  };
}

function createSafetyFindingInstructions(): string {
  return [
    "You explain deployment safety findings for SketchCatch.",
    "Respond in Korean.",
    "Do not decide severity, approval, blocked state, or whether deployment can continue.",
    "Only explain why the deterministic finding is risky and how to fix it.",
    "Do not claim deployment is safe or guaranteed.",
    "Do not include secrets or account-specific values."
  ].join("\n");
}

function createSafetyFindingPayload(finding: CheckFinding) {
  return maskSecretsForAi({
    id: finding.id,
    category: finding.category,
    severity: finding.severity,
    resourceId: finding.resourceId ?? null,
    riskFamily: finding.riskFamily ?? null,
    trivyRuleIds: finding.trivyRuleIds ?? [],
    title: finding.title,
    description: finding.description,
    recommendation: finding.recommendation,
    sourceLocation: finding.sourceLocation ?? null
  });
}

function validateOpenAiSafetyExplanation(
  finding: CheckFinding,
  payload: unknown,
  model: string,
  value: unknown
): AiSafetyExplanation {
  const fallback = createFallbackSafetyFindingExplanation(finding, "invalid_response");
  const parsed = aiSafetyExplanationSchema.safeParse(value);

  if (!parsed.success) {
    return fallback;
  }

  const riskSummary = normalizeExplanationText(parsed.data.riskSummary);
  const whyDangerous = normalizeExplanationText(parsed.data.whyDangerous);
  const recommendedFix = normalizeExplanationText(parsed.data.recommendedFix);
  const terraformHint =
    parsed.data.terraformHint === null
      ? undefined
      : normalizeExplanationText(parsed.data.terraformHint);
  const verificationSteps = normalizeVerificationSteps(parsed.data.verificationSteps);

  if (
    riskSummary === null ||
    whyDangerous === null ||
    recommendedFix === null ||
    (parsed.data.terraformHint !== null && terraformHint === null) ||
    verificationSteps.length === 0
  ) {
    return fallback;
  }

  const normalizedTerraformHint: string | undefined = terraformHint ?? undefined;
  const output: Omit<AiSafetyExplanation, "fallbackUsed" | "fallbackReason" | "providerMetadata"> = {
    riskSummary,
    whyDangerous,
    recommendedFix,
    verificationSteps,
    ...(normalizedTerraformHint === undefined ? {} : { terraformHint: normalizedTerraformHint })
  };

  return {
    ...output,
    fallbackUsed: false,
    providerMetadata: createOpenAiProviderMetadata(finding, payload, output, model)
  };
}

function selectSafetyFindingTemplate(finding: CheckFinding): SafetyFindingTemplate {
  const normalizedFinding = [
    finding.id,
    finding.category,
    finding.severity,
    finding.resourceId ?? "",
    finding.riskFamily ?? "",
    ...(finding.trivyRuleIds ?? []),
    finding.title,
    finding.description,
    finding.recommendation
  ]
    .join(" ")
    .toLowerCase();

  return (
    SAFETY_FINDING_TEMPLATES.find((template) =>
      template.keywords.some((keyword) => normalizedFinding.includes(keyword))
    ) ?? DEFAULT_SAFETY_FINDING_TEMPLATE
  );
}

function normalizeExplanationText(value: string): string | null {
  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed.length > SAFETY_EXPLANATION_MAX_LENGTH || containsBlockedGuarantee(trimmed)) {
    return null;
  }

  return trimmed;
}

function normalizeVerificationSteps(values: readonly string[]): string[] {
  const steps: string[] = [];

  for (const value of values) {
    const normalized = normalizeExplanationText(value);

    if (normalized === null) {
      continue;
    }

    steps.push(normalized);

    if (steps.length >= SAFETY_EXPLANATION_STEP_MAX_COUNT) {
      break;
    }
  }

  return steps;
}

function containsBlockedGuarantee(value: string): boolean {
  const normalized = value.toLowerCase();

  return [
    "deployment is guaranteed",
    "security is guaranteed",
    "safe to deploy",
    "배포가 보장",
    "보안이 보장",
    "배포해도 안전"
  ].some((phrase) => normalized.includes(phrase.toLowerCase()));
}

function createFallbackProviderMetadata(
  finding: CheckFinding,
  output: Omit<AiSafetyExplanation, "fallbackUsed" | "fallbackReason" | "providerMetadata">
): AiProviderMetadata {
  const payload = maskSecretsForAi({
    finding,
    output
  });

  return {
    provider: "fallback",
    service: "rule_fallback",
    routeTarget: SAFETY_EXPLANATION_ROUTE_TARGET,
    cacheHit: false,
    cacheKey: createNormalizedAiCacheKey({
      provider: "fallback",
      routeTarget: SAFETY_EXPLANATION_ROUTE_TARGET,
      payload
    }),
    estimatedUsage: estimateAiUsage(payload, JSON.stringify(output).length),
    billingMode: "disabled",
    generatedAt: new Date().toISOString()
  };
}

function createOpenAiProviderMetadata(
  finding: CheckFinding,
  payload: unknown,
  output: Omit<AiSafetyExplanation, "fallbackUsed" | "fallbackReason" | "providerMetadata">,
  model: string
): AiProviderMetadata {
  const metadataPayload = {
    finding,
    payload,
    output
  };

  return {
    provider: "openai",
    service: "openai_responses",
    model,
    routeTarget: SAFETY_EXPLANATION_ROUTE_TARGET,
    cacheHit: false,
    cacheKey: createNormalizedAiCacheKey({
      provider: "openai",
      model,
      routeTarget: SAFETY_EXPLANATION_ROUTE_TARGET,
      payload: metadataPayload
    }),
    estimatedUsage: estimateAiUsage(metadataPayload, JSON.stringify(output).length),
    billingMode: "standard",
    generatedAt: new Date().toISOString()
  };
}

function classifyOpenAiError(error: unknown): LlmExplanationFallbackReason {
  if (error instanceof Error && error.name === "APIConnectionTimeoutError") {
    return "timeout";
  }

  if (error instanceof Error && error.name === "RateLimitError") {
    return "rate_limited";
  }

  if (error instanceof Error && error.name === "BadRequestError") {
    return "invalid_request";
  }

  if (error instanceof Error && error.name === "AuthenticationError") {
    return "auth_error";
  }

  return "provider_error";
}
