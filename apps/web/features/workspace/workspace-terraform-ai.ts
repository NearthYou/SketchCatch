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
  readonly summary: string;
  readonly steps: readonly string[];
};

export function createTerraformIssueChatSummary(
  explanation: AiTerraformErrorExplanationResult
): string {
  return explanation.llmExplanation?.summary ?? explanation.summary;
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
  const providerLabel =
    explanation.llmExplanation?.providerMetadata?.provider === "amazon_q"
      ? "Amazon Q Assistance"
      : "AI 수정 계획";

  return {
    canApply: safeFix.applicable,
    providerLabel,
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

