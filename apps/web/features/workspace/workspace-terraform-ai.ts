import type { AiTerraformErrorExplanationResult, TerraformDiagnostic } from "@sketchcatch/types";
import type { TerraformIssueRecord } from "./terraform-issues-state";
import { getTerraformSafeFix } from "./terraform-safe-fixes";

export type TerraformIssueAiRequest = {
  readonly id: number;
  readonly issue: TerraformIssueRecord;
};

export type TerraformSafeFixApplyRequest = {
  readonly id: number;
  readonly diagnostic: TerraformDiagnostic;
};

export type TerraformSafeFixApplyResult = {
  readonly requestId: number;
  readonly applied: boolean;
  readonly message: string;
};

export type TerraformIssueFixPlan = {
  readonly canApply: boolean;
  readonly providerLabel: string;
  readonly providerNotice?: string | undefined;
  readonly summary: string;
  readonly steps: readonly string[];
};

export function createTerraformIssueChatSummary(
  explanation: AiTerraformErrorExplanationResult
): string {
  return `Amazon Q Assistance: ${selectTerraformIssueSummary(explanation)}`;
}

export function createTerraformIssueFixPlan({
  diagnostic,
  explanation
}: {
  readonly diagnostic: TerraformDiagnostic;
  readonly explanation: AiTerraformErrorExplanationResult;
}): TerraformIssueFixPlan {
  const safeFix = getTerraformSafeFix(diagnostic);
  const location = formatTerraformDiagnosticLocation(diagnostic);
  const providerLabel = "Amazon Q Assistance";

  return {
    canApply: safeFix.applicable,
    providerLabel,
    providerNotice: createTerraformIssueProviderNotice(explanation),
    summary: createTerraformIssueChatSummary(explanation),
    steps: safeFix.applicable
      ? [
          `${location}의 Terraform 진단 위치를 확인합니다.`,
          `${safeFix.label}: ${safeFix.description}`,
          "수정안을 적용한 뒤 Terraform 재검증, 저장, 다이어그램 동기화를 다시 실행합니다."
        ]
      : [
          `${location}의 원본 Terraform 코드를 확인합니다.`,
          explanation.likelyCause,
          "자동 적용 대신 코드를 직접 수정한 뒤 Terraform 재검증과 저장을 다시 실행합니다."
        ]
  };
}

function formatTerraformDiagnosticLocation(diagnostic: TerraformDiagnostic): string {
  const fileName = diagnostic.sourceFileName ?? "Terraform 파일";

  if (diagnostic.line === undefined) {
    return fileName;
  }

  return `${fileName} ${diagnostic.line}번째 줄`;
}

function selectTerraformIssueSummary(explanation: AiTerraformErrorExplanationResult): string {
  const candidates = [
    explanation.llmExplanation?.summary,
    explanation.summary,
    explanation.likelyCause,
    explanation.consensusRecommendation
  ];

  return (
    candidates.find((candidate) => candidate !== undefined && !includesInternalFallbackWording(candidate)) ??
    "Terraform 진단을 바탕으로 수정 위치와 적용 가능 여부를 검토했습니다."
  );
}

function includesInternalFallbackWording(value: string): boolean {
  return /fallback|기본 fallback|1차 제공 fallback/i.test(value);
}

function createTerraformIssueProviderNotice(
  explanation: AiTerraformErrorExplanationResult
): string | undefined {
  const llmExplanation = explanation.llmExplanation;

  if (llmExplanation === undefined) {
    return "Amazon Q 호출 상태: 응답 정보 없음";
  }

  if (!llmExplanation.fallbackUsed) {
    return undefined;
  }

  return `Amazon Q 호출 상태: ${getAmazonQFallbackReasonLabel(llmExplanation.fallbackReason)}`;
}

function getAmazonQFallbackReasonLabel(reason: string | undefined): string {
  switch (reason) {
    case "missing_api_key":
      return "API key 없음";
    case "provider_not_configured":
      return "Amazon Q provider 설정 없음";
    case "credit_not_confirmed":
      return "AWS AI credit 확인 필요";
    case "daily_limit_exceeded":
      return "일일 호출 한도 초과";
    case "timeout":
      return "응답 시간 초과";
    case "rate_limited":
      return "호출 빈도 제한";
    case "invalid_request":
      return "요청 형식 오류";
    case "auth_error":
      return "인증 오류";
    case "provider_error":
      return "provider 오류";
    case "invalid_response":
      return "응답 형식 보정 필요";
    case undefined:
      return "fallback 사유 미상";
  }

  return "fallback 사유 미상";
}

