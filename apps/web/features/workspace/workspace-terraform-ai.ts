import type {
  AiTerraformCodeFrameLine,
  AiTerraformErrorExplanationResult,
  TerraformDiagnostic
} from "@sketchcatch/types";
import type { TerraformIssueRecord } from "./terraform-issues-state";
import { applyTerraformSafeFix, getTerraformSafeFix } from "./terraform-safe-fixes";

export type TerraformIssueAiRequest = {
  readonly id: number;
  readonly issue: TerraformIssueRecord;
  readonly terraformCode: string;
};

export type TerraformSafeFixApplyRequest = {
  readonly id: number;
  readonly codePreview?: TerraformIssueCodePreview | undefined;
  readonly diagnostic: TerraformDiagnostic;
};

export type TerraformSafeFixApplyResult = {
  readonly requestId: number;
  readonly applied: boolean;
  readonly message: string;
};

export type TerraformIssueFixPlan = {
  readonly canApply: boolean;
  readonly codePreview?: TerraformIssueCodePreview | undefined;
  readonly codeFrame: readonly AiTerraformCodeFrameLine[];
  readonly errorType: string;
  readonly fixExplanation: string;
  readonly location: string;
  readonly plainExplanation: string;
  readonly providerLabel: string;
  readonly providerNotice?: string | undefined;
  readonly summary: string;
  readonly steps: readonly string[];
};

export type TerraformIssueCodePreview = {
  readonly currentCode: string;
  readonly nextCode: string;
  readonly sourceLine: number;
  readonly source: "amazon_q" | "safe_fix";
};

export function createTerraformIssueChatSummary(
  explanation: AiTerraformErrorExplanationResult
): string {
  return `Terraform 진단: ${selectTerraformIssueSummary(explanation)}`;
}

export function createTerraformIssueFixPlan({
  diagnostic,
  explanation,
  terraformCode = ""
}: {
  readonly diagnostic: TerraformDiagnostic;
  readonly explanation: AiTerraformErrorExplanationResult;
  readonly terraformCode?: string | undefined;
}): TerraformIssueFixPlan {
  const safeFix = getTerraformSafeFix(diagnostic);
  const location = formatTerraformDiagnosticLocation(diagnostic);
  const diagnosticExplanation = explanation.diagnosticExplanation;
  const codePreview = createTerraformIssueCodePreview({
    diagnostic,
    explanation,
    safeFixApplicable: safeFix.applicable,
    terraformCode
  });
  const aiCodeSuggestion = explanation.llmExplanation?.codeSuggestion;
  const aiFixExplanation = codePreview?.source === "amazon_q" ? aiCodeSuggestion?.rationale : undefined;
  const providerLabel = codePreview?.source === "amazon_q" ? "AI suggested fix" : "Rule-first diagnosis";
  const helpfulLlmSummary = selectHelpfulTerraformIssueLlmSummary(explanation);

  return {
    canApply: codePreview !== undefined,
    codePreview,
    codeFrame: diagnosticExplanation?.codeFrame ?? [],
    errorType: diagnosticExplanation?.errorType ?? diagnostic.code ?? "terraform.unknown",
    fixExplanation:
      aiFixExplanation ??
      diagnosticExplanation?.fixExplanation ??
      (safeFix.applicable ? safeFix.description : explanation.consensusRecommendation),
    location,
    plainExplanation:
      helpfulLlmSummary ??
      diagnosticExplanation?.plainExplanation ??
      explanation.summary,
    providerLabel,
    providerNotice: createTerraformIssueProviderNotice(explanation),
    summary: createTerraformIssueChatSummary(explanation),
    steps: codePreview
      ? [
          `${location}의 현재 코드와 수정할 코드를 비교합니다.`,
          codePreview.source === "amazon_q"
            ? `Amazon Q 제안: ${explanation.llmExplanation?.codeSuggestion?.rationale ?? "현재 코드 기준으로 수정 코드를 제안했습니다."}`
            : `${safeFix.label}: ${safeFix.description}`,
          "수정 버튼을 누르면 표시된 수정할 코드가 적용되고 Terraform 재검증과 저장을 다시 실행합니다."
        ]
      : [
          `${location}의 원본 Terraform 코드를 확인합니다.`,
          explanation.likelyCause,
          "자동 수정안이 없으면 코드를 직접 수정한 뒤 Terraform 재검증과 저장을 다시 실행합니다."
        ]
  };
}

function createTerraformIssueCodePreview({
  diagnostic,
  explanation,
  safeFixApplicable,
  terraformCode
}: {
  readonly diagnostic: TerraformDiagnostic;
  readonly explanation: AiTerraformErrorExplanationResult;
  readonly safeFixApplicable: boolean;
  readonly terraformCode: string;
}): TerraformIssueCodePreview | undefined {
  const rulePreview = createRuleTerraformIssueCodePreview({
    diagnostic,
    explanation,
    safeFixApplicable,
    terraformCode
  });

  return (
    rulePreview ??
    createAmazonQTerraformIssueCodePreview({
      diagnostic,
      explanation,
      terraformCode
    })
  );
}

function createRuleTerraformIssueCodePreview({
  diagnostic,
  explanation,
  safeFixApplicable,
  terraformCode
}: {
  readonly diagnostic: TerraformDiagnostic;
  readonly explanation: AiTerraformErrorExplanationResult;
  readonly safeFixApplicable: boolean;
  readonly terraformCode: string;
}): TerraformIssueCodePreview | undefined {
  const diagnosticSuggestion = explanation.diagnosticExplanation?.codeSuggestion;
  const suggestionLine = explanation.diagnosticExplanation?.line ?? diagnostic.line ?? 1;

  if (
    diagnosticSuggestion?.source === "rule" &&
    extractTerraformLine(terraformCode, suggestionLine) === diagnosticSuggestion.currentCode
  ) {
    return {
      currentCode: diagnosticSuggestion.currentCode,
      nextCode: diagnosticSuggestion.suggestedCode,
      sourceLine: suggestionLine,
      source: "safe_fix"
    };
  }

  if (!safeFixApplicable || terraformCode.trim().length === 0 || diagnostic.line === undefined) {
    return undefined;
  }

  const fixedCode = applyTerraformSafeFix({
    code: terraformCode,
    diagnostic
  });

  if (!fixedCode.applied) {
    return undefined;
  }

  const currentCode = extractTerraformLine(terraformCode, diagnostic.line);
  const nextCode = extractTerraformLine(fixedCode.code, diagnostic.line);

  if (currentCode === undefined || nextCode === undefined || currentCode === nextCode) {
    return undefined;
  }

  return {
    currentCode,
    nextCode,
    sourceLine: diagnostic.line,
    source: "safe_fix"
  };
}

function createAmazonQTerraformIssueCodePreview({
  diagnostic,
  explanation,
  terraformCode
}: {
  readonly diagnostic: TerraformDiagnostic;
  readonly explanation: AiTerraformErrorExplanationResult;
  readonly terraformCode: string;
}): TerraformIssueCodePreview | undefined {
  const codeSuggestion = explanation.llmExplanation?.codeSuggestion;

  if (codeSuggestion === undefined || terraformCode.trim().length === 0) {
    return undefined;
  }

  if (!terraformCode.includes(codeSuggestion.currentCode)) {
    return undefined;
  }

  return {
    currentCode: codeSuggestion.currentCode,
    nextCode: codeSuggestion.suggestedCode,
    sourceLine: diagnostic.line ?? 1,
    source: "amazon_q"
  };
}

function extractTerraformLine(code: string, lineNumber: number): string | undefined {
  return code.split(/\r?\n/)[lineNumber - 1];
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

function selectHelpfulTerraformIssueLlmSummary(
  explanation: AiTerraformErrorExplanationResult
): string | undefined {
  const summary = explanation.llmExplanation?.summary;

  if (
    summary === undefined ||
    explanation.llmExplanation?.fallbackUsed ||
    includesInternalFallbackWording(summary)
  ) {
    return undefined;
  }

  return summary;
}

function includesInternalFallbackWording(value: string): boolean {
  if (
    /could not find relevant information|cannot find relevant information|sorry, i could not|not enough information/i.test(
      value
    )
  ) {
    return true;
  }

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

