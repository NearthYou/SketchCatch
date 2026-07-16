import type {
  AiTerraformCodeFrameLine,
  AiTerraformErrorExplanationResult,
  TerraformDiagnostic,
  TerraformSyncFileInput
} from "@sketchcatch/types";
import type { TerraformIssueRecord } from "./terraform-issues-state";
import { applyTerraformSafeFix, getTerraformSafeFix } from "./terraform-safe-fixes";

const TERRAFORM_ISSUE_ANALYSES_STORAGE_PREFIX = "sketchcatch:terraform-issue-analyses";
const MAX_STORED_TERRAFORM_ISSUE_ANALYSES = 120;

export type TerraformPreviewAiScope = {
  readonly key: string;
  readonly label: string;
  readonly terraformCode: string;
};

export type WorkspaceTerraformAiCodeContext = {
  readonly combinedTerraformCode: string;
  readonly files: readonly TerraformSyncFileInput[];
  readonly fingerprint: string;
  readonly reviewScope: TerraformPreviewAiScope;
};

export type WorkspaceTerraformAiContext = WorkspaceTerraformAiCodeContext & {
  readonly issues: readonly TerraformIssueRecord[];
};

export type WorkspaceAiContextInteraction = {
  readonly diagnosticKey?: string | undefined;
  readonly id: number;
  readonly scope: "draft" | "errors" | "preview";
};

export const EMPTY_WORKSPACE_TERRAFORM_AI_CONTEXT: WorkspaceTerraformAiContext = {
  combinedTerraformCode: "",
  files: [],
  fingerprint: createWorkspaceTerraformFingerprint([]),
  issues: [],
  reviewScope: {
    key: "empty",
    label: "현재 Terraform 코드",
    terraformCode: ""
  }
};

export type StoredTerraformIssueAnalysis = {
  readonly diagnosticKey: string;
  readonly explanation: AiTerraformErrorExplanationResult;
  readonly terraformFingerprint: string;
};

export type TerraformIssueAiRequest = {
  readonly id: number;
  readonly issue: TerraformIssueRecord;
  readonly terraformCode: string;
};

export type TerraformPreviewAiRequest = {
  readonly id: number;
  readonly label: string;
  readonly terraformCode: string;
};

export type TerraformSafeFixApplyRequest = {
  readonly expectedTerraformFingerprint: string;
  readonly id: number;
  readonly fixes: readonly TerraformSafeFixApplyItem[];
  readonly mode: "all" | "single";
};

export type TerraformSafeFixApplyItem = {
  readonly codePreview?: TerraformIssueCodePreview | undefined;
  readonly diagnostic: TerraformDiagnostic;
};

export type TerraformSafeFixApplyResult = {
  readonly requestId: number;
  readonly applied: boolean;
  readonly message: string;
};

export function createWorkspaceTerraformFingerprint(
  files: readonly TerraformSyncFileInput[]
): string {
  return JSON.stringify(
    [...files]
      .map(({ fileName, terraformCode }) => ({ fileName, terraformCode }))
      .sort((left, right) => left.fileName.localeCompare(right.fileName))
  );
}

export function resolveTerraformIssueCode({
  combinedTerraformCode,
  diagnostic,
  files
}: {
  readonly combinedTerraformCode: string;
  readonly diagnostic: TerraformDiagnostic;
  readonly files: readonly TerraformSyncFileInput[];
}): string {
  if (diagnostic.sourceFileName) {
    const sourceFile = files.find((file) => file.fileName === diagnostic.sourceFileName);

    if (sourceFile) {
      return sourceFile.terraformCode;
    }
  }

  if (files.length === 1 && files[0]) {
    return files[0].terraformCode;
  }

  return combinedTerraformCode;
}

export function createTerraformIssueAnalysesStorageKey(projectId: string): string {
  return `${TERRAFORM_ISSUE_ANALYSES_STORAGE_PREFIX}:${projectId}`;
}

export function readStoredTerraformIssueAnalyses(
  storage: Pick<Storage, "getItem">,
  projectId: string
): StoredTerraformIssueAnalysis[] {
  try {
    const payload = storage.getItem(createTerraformIssueAnalysesStorageKey(projectId));

    if (!payload) {
      return [];
    }

    const parsed: unknown = JSON.parse(payload);
    return Array.isArray(parsed) && parsed.every(isStoredTerraformIssueAnalysis) ? parsed : [];
  } catch {
    return [];
  }
}

export function storeTerraformIssueAnalyses(
  storage: Pick<Storage, "removeItem" | "setItem">,
  projectId: string,
  analyses: readonly StoredTerraformIssueAnalysis[]
): void {
  const storageKey = createTerraformIssueAnalysesStorageKey(projectId);

  try {
    if (analyses.length === 0) {
      storage.removeItem(storageKey);
      return;
    }

    storage.setItem(
      storageKey,
      JSON.stringify(analyses.slice(-MAX_STORED_TERRAFORM_ISSUE_ANALYSES))
    );
  } catch {
    // 분석 결과 복구가 막혀도 현재 session의 AI 작업은 계속합니다.
  }
}

function isStoredTerraformIssueAnalysis(value: unknown): value is StoredTerraformIssueAnalysis {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.diagnosticKey === "string" &&
    typeof value.terraformFingerprint === "string" &&
    isTerraformErrorExplanation(value.explanation)
  );
}

function isTerraformErrorExplanation(value: unknown): value is AiTerraformErrorExplanationResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.stage === "string" &&
    typeof value.category === "string" &&
    typeof value.severity === "string" &&
    typeof value.rawMessage === "string" &&
    typeof value.summary === "string" &&
    typeof value.likelyCause === "string" &&
    isStringArray(value.nextActions) &&
    Array.isArray(value.wellArchitectedGuidance) &&
    typeof value.consensusRecommendation === "string"
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
  readonly rationale?: string | undefined;
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
  const aiFixExplanation = codePreview?.source === "amazon_q"
    ? codePreview.rationale ?? aiCodeSuggestion?.rationale
    : undefined;
  const providerLabel = codePreview?.source === "amazon_q" ? "AI 오류 수정" : "Rule-first diagnosis";
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

  if (terraformCode.trim().length === 0) {
    return undefined;
  }

  if (codeSuggestion === undefined) {
    return createAmazonQTerraformLineDeletionPreview({
      diagnostic,
      terraformCode
    });
  }

  if (!terraformCode.includes(codeSuggestion.currentCode)) {
    return undefined;
  }

  return {
    currentCode: codeSuggestion.currentCode,
    nextCode: codeSuggestion.suggestedCode,
    rationale: codeSuggestion.rationale,
    sourceLine: diagnostic.line ?? 1,
    source: "amazon_q"
  };
}

function createAmazonQTerraformLineDeletionPreview({
  diagnostic,
  terraformCode
}: {
  readonly diagnostic: TerraformDiagnostic;
  readonly terraformCode: string;
}): TerraformIssueCodePreview | undefined {
  if (
    diagnostic.line === undefined ||
    !isStandaloneTerraformSyntaxDiagnostic(diagnostic)
  ) {
    return undefined;
  }

  const line = extractTerraformLine(terraformCode, diagnostic.line);

  if (line === undefined || line.trim().length === 0 || isLikelyTerraformBlockOrAttribute(line)) {
    return undefined;
  }

  const lineBreak = terraformCode.includes("\r\n") ? "\r\n" : "\n";
  const currentCode = terraformCode.includes(`${line}${lineBreak}`) ? `${line}${lineBreak}` : line;

  return {
    currentCode,
    nextCode: "",
    rationale: `${formatTerraformDiagnosticLocation(diagnostic)}의 \`${line.trim()}\` 줄은 Terraform block header나 attribute가 아니므로 삭제해야 합니다.`,
    sourceLine: diagnostic.line,
    source: "amazon_q"
  };
}

function isStandaloneTerraformSyntaxDiagnostic(diagnostic: TerraformDiagnostic): boolean {
  return diagnostic.code === "terraform.sync.block_header" || diagnostic.code === "terraform.unexpected_token";
}

function isLikelyTerraformBlockOrAttribute(line: string): boolean {
  const trimmed = line.trim();

  return (
    trimmed.startsWith("#") ||
    trimmed.startsWith("//") ||
    trimmed.endsWith("{") ||
    /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(trimmed)
  );
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
