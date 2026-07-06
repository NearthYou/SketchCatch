import assert from "node:assert/strict";
import { test } from "node:test";
import type { AiTerraformErrorExplanationResult, LlmCodeSuggestion, TerraformDiagnostic } from "@sketchcatch/types";
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

const trailingCommaDiagnostic: TerraformDiagnostic = {
  code: "terraform.trailing_comma",
  line: 2,
  message: "Trailing comma is not valid Terraform syntax.",
  severity: "error",
  sourceFileName: "main.tf"
};

test("createTerraformIssueChatSummary shows Terraform diagnosis instead of deterministic fallback wording", () => {
  const explanation = createExplanation({
    summary: "Terraform 오류를 기본 fallback 설명으로 분류했습니다.",
    llmSummary: "닫힌 block 뒤의 Terraform 코드를 확인해야 합니다."
  });

  assert.equal(
    createTerraformIssueChatSummary(explanation),
    "Terraform 진단: 닫힌 block 뒤의 Terraform 코드를 확인해야 합니다."
  );
});

test("createTerraformIssueFixPlan labels Terraform issue plans as rule-first diagnosis", () => {
  const explanation = createExplanation({
    summary: "Terraform 오류를 기본 fallback 설명으로 분류했습니다.",
    llmSummary: "닫힌 block 뒤의 Terraform 코드를 확인해야 합니다."
  });

  const fixPlan = createTerraformIssueFixPlan({
    diagnostic: unexpectedTokenDiagnostic,
    explanation
  });

  assert.equal(fixPlan.providerLabel, "Rule-first diagnosis");
  assert.doesNotMatch(fixPlan.summary, /fallback/);
});

test("createTerraformIssueFixPlan shows current and next code before enabling fixes", () => {
  const explanation = createExplanation({
    summary: "Terraform trailing comma를 수정해야 합니다.",
    llmSummary: "Trailing comma를 제거하면 됩니다."
  });

  const fixPlan = createTerraformIssueFixPlan({
    diagnostic: trailingCommaDiagnostic,
    explanation,
    terraformCode: 'resource "aws_s3_bucket" "logs" {\n  bucket = "logs",\n}'
  });

  assert.equal(fixPlan.canApply, true);
  assert.deepEqual(fixPlan.codePreview, {
    currentCode: '  bucket = "logs",',
    nextCode: '  bucket = "logs"',
    sourceLine: 2,
    source: "safe_fix"
  });
});

test("createTerraformIssueFixPlan requires rule suggestions to match the diagnostic line", () => {
  const explanation = {
    ...createExplanation({
      summary: "Terraform trailing comma瑜??섏젙?댁빞 ?⑸땲??",
      llmSummary: "Trailing comma瑜??쒓굅?섎㈃ ?⑸땲??"
    }),
    diagnosticExplanation: {
      errorType: "terraform.trailing_comma",
      plainExplanation: "The highlighted line has a trailing comma.",
      fixExplanation: "Remove the comma on the highlighted line.",
      codeFrame: [],
      canApply: true,
      line: 2,
      sourceFileName: "main.tf",
      codeSuggestion: {
        currentCode: '  bucket = "logs",',
        suggestedCode: '  bucket = "logs"',
        rationale: "Remove the trailing comma.",
        source: "rule" as const
      }
    }
  };

  const fixPlan = createTerraformIssueFixPlan({
    diagnostic: trailingCommaDiagnostic,
    explanation,
    terraformCode: 'resource "aws_s3_bucket" "logs" {\n  bucket = "logs"\n  bucket = "logs",\n}'
  });

  assert.equal(fixPlan.canApply, false);
  assert.equal(fixPlan.codePreview, undefined);
});

test("createTerraformIssueFixPlan prefers Amazon Q suggested code when it matches current Terraform", () => {
  const explanation = createExplanation({
    summary: "Terraform 코드를 수정해야 합니다.",
    llmSummary: "Amazon Q가 현재 코드 기준 수정안을 제안했습니다.",
    codeSuggestion: {
      currentCode: '  bucket = "logs",',
      suggestedCode: '  bucket = "logs"',
      rationale: "trailing comma를 제거하면 Terraform 문법 오류가 사라집니다."
    },
    wellArchitectedConclusion: "6개 기준 평가를 종합하면 작은 문법 수정 후 재검증하는 방식이 최선입니다."
  });

  const fixPlan = createTerraformIssueFixPlan({
    diagnostic: unexpectedTokenDiagnostic,
    explanation,
    terraformCode: 'resource "aws_s3_bucket" "logs" {\n  bucket = "logs",\n}'
  });

  assert.equal(fixPlan.canApply, true);
  assert.deepEqual(fixPlan.codePreview, {
    currentCode: '  bucket = "logs",',
    nextCode: '  bucket = "logs"',
    rationale: "trailing comma를 제거하면 Terraform 문법 오류가 사라집니다.",
    sourceLine: 13,
    source: "amazon_q"
  });
  assert.match(fixPlan.steps.join("\n"), /Amazon Q 제안/);
});

test("createTerraformIssueFixPlan enables AI deletion suggestions for invalid standalone Terraform code", () => {
  const diagnostic: TerraformDiagnostic = {
    code: "terraform.sync.block_header",
    line: 19,
    message: "Unsupported block type or invalid Terraform syntax.",
    severity: "error",
    sourceFileName: "main.tf"
  };
  const explanation = {
    ...createExplanation({
      summary: "Rule fallback could not explain the invalid Terraform line.",
      llmSummary: "Line 19 is not valid Terraform syntax because it is a bare token outside any block.",
      codeSuggestion: {
        currentCode: "xczxczxczxczxczcx\n",
        suggestedCode: "",
        rationale: "Delete the standalone token line. It is not a Terraform block, attribute, or expression, so removing it lets Terraform parse the next resource block."
      }
    }),
    diagnosticExplanation: {
      errorType: "terraform.sync.block_header",
      plainExplanation: "Terraform 진단을 바탕으로 수정 위치를 먼저 확인해야 합니다.",
      fixExplanation: "강조된 Terraform 코드를 확인해 수동으로 수정한 뒤 다시 검증하세요.",
      codeFrame: [],
      canApply: false,
      line: 19,
      sourceFileName: "main.tf"
    }
  };

  const fixPlan = createTerraformIssueFixPlan({
    diagnostic,
    explanation,
    terraformCode: [
      'resource "aws_security_group" "web" {',
      "}",
      "xczxczxczxczxczcx",
      'resource "aws_route_table" "public" {',
      "}"
    ].join("\n")
  });

  assert.equal(fixPlan.canApply, true);
  assert.equal(fixPlan.providerLabel, "AI 오류 수정");
  assert.equal(fixPlan.plainExplanation, "Line 19 is not valid Terraform syntax because it is a bare token outside any block.");
  assert.equal(
    fixPlan.fixExplanation,
    "Delete the standalone token line. It is not a Terraform block, attribute, or expression, so removing it lets Terraform parse the next resource block."
  );
  assert.deepEqual(fixPlan.codePreview, {
    currentCode: "xczxczxczxczxczcx\n",
    nextCode: "",
    rationale: "Delete the standalone token line. It is not a Terraform block, attribute, or expression, so removing it lets Terraform parse the next resource block.",
    sourceLine: 19,
    source: "amazon_q"
  });
});

test("createTerraformIssueFixPlan derives an AI deletion preview from a block-header explanation", () => {
  const diagnostic: TerraformDiagnostic = {
    code: "terraform.sync.block_header",
    line: 10,
    message: "Invalid Terraform block header.",
    severity: "error",
    sourceFileName: "main.tf"
  };
  const explanation = {
    ...createExplanation({
      summary: "Terraform 코드 파일 main.tf의 10번째 줄에 문제가 있습니다.",
      llmSummary: "Terraform 코드 파일 main.tf의 10번째 줄은 올바른 형식의 리소스 또는 데이터 블록이 아닙니다."
    }),
    diagnosticExplanation: {
      errorType: "terraform.sync.block_header",
      plainExplanation: "Terraform 코드 파일 main.tf의 10번째 줄에 문제가 있습니다.",
      fixExplanation: "강조된 Terraform 코드를 확인해 수동으로 수정한 뒤 다시 검증하세요.",
      codeFrame: [],
      canApply: false,
      line: 10,
      sourceFileName: "main.tf"
    }
  };

  const fixPlan = createTerraformIssueFixPlan({
    diagnostic,
    explanation,
    terraformCode: [
      'resource "aws_vpc" "vpc_main" {',
      '  cidr_block = "10.0.0.0/16"',
      "}",
      'resource "aws_internet_gateway" "internet_gateway" {',
      "  vpc_id = aws_vpc.vpc_main.id",
      "}",
      'resource "aws_route_table" "public_route_table" {',
      "  vpc_id = aws_vpc.vpc_main.id",
      "}",
      "ㄷㄱㅈㄷㄱㅈㄷㄱ",
      'resource "aws_subnet" "public_subnet" {',
      "  vpc_id = aws_vpc.vpc_main.id",
      "}"
    ].join("\n")
  });

  assert.equal(fixPlan.canApply, true);
  assert.equal(fixPlan.providerLabel, "AI 오류 수정");
  assert.equal(
    fixPlan.fixExplanation,
    "main.tf 10번째 줄의 `ㄷㄱㅈㄷㄱㅈㄷㄱ` 줄은 Terraform block header나 attribute가 아니므로 삭제해야 합니다."
  );
  assert.deepEqual(fixPlan.codePreview, {
    currentCode: "ㄷㄱㅈㄷㄱㅈㄷㄱ\n",
    nextCode: "",
    rationale: "main.tf 10번째 줄의 `ㄷㄱㅈㄷㄱㅈㄷㄱ` 줄은 Terraform block header나 attribute가 아니므로 삭제해야 합니다.",
    sourceLine: 10,
    source: "amazon_q"
  });
});

test("createTerraformIssueFixPlan still deletes standalone block-header lines without LLM suggestion metadata", () => {
  const diagnostic: TerraformDiagnostic = {
    code: "terraform.sync.block_header",
    line: 4,
    message: "Invalid Terraform block header.",
    severity: "error",
    sourceFileName: "main.tf"
  };
  const explanation = {
    ...createExplanation({
      summary: "Terraform 코드 파일 main.tf의 4번째 줄에 문제가 있습니다.",
      llmSummary: "unused"
    }),
    llmExplanation: undefined,
    diagnosticExplanation: {
      errorType: "terraform.sync.block_header",
      plainExplanation: "Terraform 코드 파일 main.tf의 4번째 줄에 문제가 있습니다.",
      fixExplanation: "강조된 Terraform 코드를 확인해 수동으로 수정한 뒤 다시 검증하세요.",
      codeFrame: [],
      canApply: false,
      line: 4,
      sourceFileName: "main.tf"
    }
  };

  const fixPlan = createTerraformIssueFixPlan({
    diagnostic,
    explanation,
    terraformCode: [
      'resource "aws_vpc" "vpc_main" {',
      '  cidr_block = "10.0.0.0/16"',
      "}",
      "ㄷㄱㅈㄷㄱㅈㄷㄱ",
      'resource "aws_subnet" "public_subnet" {',
      "}"
    ].join("\n")
  });

  assert.equal(fixPlan.canApply, true);
  assert.equal(fixPlan.providerLabel, "AI 오류 수정");
  assert.equal(
    fixPlan.fixExplanation,
    "main.tf 4번째 줄의 `ㄷㄱㅈㄷㄱㅈㄷㄱ` 줄은 Terraform block header나 attribute가 아니므로 삭제해야 합니다."
  );
  assert.deepEqual(fixPlan.codePreview, {
    currentCode: "ㄷㄱㅈㄷㄱㅈㄷㄱ\n",
    nextCode: "",
    rationale: "main.tf 4번째 줄의 `ㄷㄱㅈㄷㄱㅈㄷㄱ` 줄은 Terraform block header나 attribute가 아니므로 삭제해야 합니다.",
    sourceLine: 4,
    source: "amazon_q"
  });
});

test("createTerraformIssueFixPlan requires a code preview before enabling fixes", () => {
  const explanation = createExplanation({
    summary: "Terraform 진단을 확인해야 합니다.",
    llmSummary: "원본 Terraform 위치를 확인해야 합니다."
  });

  const fixPlan = createTerraformIssueFixPlan({
    diagnostic: unexpectedTokenDiagnostic,
    explanation,
    terraformCode: 'resource "aws_s3_bucket" "logs" {\n  bucket = "logs"\n}'
  });

  assert.equal(fixPlan.canApply, false);
  assert.equal(fixPlan.codePreview, undefined);
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

  assert.equal(fixPlan.providerLabel, "Rule-first diagnosis");
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
  readonly codeSuggestion?: LlmCodeSuggestion | undefined;
  readonly wellArchitectedConclusion?: string | undefined;
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
      codeSuggestion: input.codeSuggestion,
      wellArchitectedConclusion: input.wellArchitectedConclusion,
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
