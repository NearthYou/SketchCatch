import assert from "node:assert/strict";
import { test } from "node:test";
import type { AiTerraformErrorExplanationResult, TerraformDiagnostic } from "@sketchcatch/types";
import {
  createTerraformIssueChatSummary,
  createTerraformIssueFixPlan
} from "./workspace-terraform-ai";

const unexpectedTokenDiagnostic: TerraformDiagnostic = {
  code: "terraform.unexpected_token",
  line: 13,
  message: "닫힌 block 뒤에 알 수 없는 Terraform 코드가 붙어 있습니다.",
  severity: "error",
  sourceFileName: "main.tf"
};

test("createTerraformIssueChatSummary shows Amazon Q instead of deterministic fallback wording", () => {
  const explanation = createExplanation({
    summary: "Terraform 오류를 기본 fallback 설명으로 분류했습니다.",
    llmSummary: "닫힌 block 뒤의 Terraform 코드를 확인해야 합니다."
  });

  assert.equal(
    createTerraformIssueChatSummary(explanation),
    "Amazon Q Assistance: 닫힌 block 뒤의 Terraform 코드를 확인해야 합니다."
  );
});

test("createTerraformIssueFixPlan labels Terraform issue plans as Amazon Q Assistance", () => {
  const explanation = createExplanation({
    summary: "Terraform 오류를 기본 fallback 설명으로 분류했습니다.",
    llmSummary: "닫힌 block 뒤의 Terraform 코드를 확인해야 합니다."
  });

  const fixPlan = createTerraformIssueFixPlan({
    diagnostic: unexpectedTokenDiagnostic,
    explanation
  });

  assert.equal(fixPlan.providerLabel, "Amazon Q Assistance");
  assert.doesNotMatch(fixPlan.summary, /fallback/);
});

test("createTerraformIssueFixPlan explains why Amazon Q used fallback", () => {
  const explanation = createExplanation({
    summary: "Terraform 오류를 기본 fallback 설명으로 분류했습니다.",
    llmSummary: "Terraform 진단을 바탕으로 수정 위치를 확인해야 합니다."
  });

  const fixPlan = createTerraformIssueFixPlan({
    diagnostic: unexpectedTokenDiagnostic,
    explanation: {
      ...explanation,
      llmExplanation: explanation.llmExplanation
        ? {
            ...explanation.llmExplanation,
            fallbackUsed: true,
            fallbackReason: "credit_not_confirmed"
          }
        : undefined
    }
  });

  assert.equal(fixPlan.providerLabel, "Amazon Q Assistance");
  assert.equal(fixPlan.providerNotice, "Amazon Q 호출 상태: AWS AI credit 확인 필요");
});

test("createTerraformIssueFixPlan explains missing Amazon Q provider configuration", () => {
  const explanation = createExplanation({
    summary: "Terraform 오류를 기본 fallback 설명으로 분류했습니다.",
    llmSummary: "Terraform 진단을 바탕으로 수정 위치를 확인해야 합니다."
  });

  const fixPlan = createTerraformIssueFixPlan({
    diagnostic: unexpectedTokenDiagnostic,
    explanation: {
      ...explanation,
      llmExplanation: explanation.llmExplanation
        ? {
            ...explanation.llmExplanation,
            fallbackUsed: true,
            fallbackReason: "provider_not_configured"
          }
        : undefined
    }
  });

  assert.equal(fixPlan.providerNotice, "Amazon Q 호출 상태: Amazon Q provider 설정 없음");
});

function createExplanation(input: {
  readonly summary: string;
  readonly llmSummary: string;
}): AiTerraformErrorExplanationResult {
  return {
    stage: "validate",
    category: "syntax",
    severity: "medium",
    rawMessage: unexpectedTokenDiagnostic.message,
    summary: input.summary,
    likelyCause: "리소스 block을 닫은 뒤 남은 attribute가 바깥에 붙어 있을 수 있습니다.",
    nextActions: ["main.tf 13번째 줄을 확인하세요."],
    wellArchitectedGuidance: [],
    consensusRecommendation: "자동 수정 대신 원본 위치를 확인하세요.",
    safeFix: {
      applicable: false,
      code: "terraform.unexpected_token",
      label: "수동 수정 필요",
      description: "의미 판단이 필요합니다."
    },
    llmExplanation: {
      target: "terraform_error_explanation",
      summary: input.llmSummary,
      highlights: ["main.tf:13을 확인하세요."],
      nextActions: ["수정 후 Terraform 재검증을 실행하세요."],
      fallbackUsed: false,
      providerMetadata: {
        provider: "amazon_q",
        service: "amazon_q_business",
        model: "test-q-app",
        routeTarget: "terraform_error_explanation",
        cacheHit: false,
        cacheKey: "terraform-issue-test",
        estimatedUsage: {
          inputCharacters: 10,
          inputTokensEstimate: 3
        },
        billingMode: "aws_credit_only",
        generatedAt: new Date(0).toISOString()
      }
    }
  };
}
