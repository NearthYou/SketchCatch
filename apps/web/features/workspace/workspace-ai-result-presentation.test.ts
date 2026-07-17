import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type {
  AiProviderAttempt,
  AiTerraformErrorExplanationResult,
  AiTerraformPreviewExplanationResult,
  LlmExplanation,
  TerraformDiagnostic
} from "@sketchcatch/types";
import {
  createAiProviderAttemptPresentation,
  createTerraformIssuePresentation,
  createTerraformPreviewPresentation,
  createWorkspaceAiExplanationBadge,
  formatTerraformReviewContext
} from "./workspace-ai-result-presentation";

const workbenchResultSource = readWorkbenchResultSource();

const preview = {
  checklist: [],
  consensusRecommendation:
    "결론: 현재 rule 기반 평가에는 즉시 차단할 위험은 크지 않습니다. Plan을 확인하세요.",
  detectedResources: [
    {
      explanation: "VPC를 생성합니다.",
      label: "sketchcatch_vpc_eks_container_app",
      terraformType: "aws_vpc"
    },
    {
      explanation: "Subnet을 생성합니다.",
      label: "sketchcatch_subnet_a_eks_container_app",
      terraformType: "aws_subnet"
    }
  ],
  findings: [
    {
      category: "security",
      description: "외부 접근 범위를 확인해야 합니다.",
      id: "security-1",
      recommendation: "공개 접근이 필요한지 확인하세요.",
      resourceId: "aws_vpc.sketchcatch_vpc_eks_container_app",
      severity: "medium",
      title: "공개 접근 범위 확인"
    }
  ],
  summary:
    "IaC Preview 기준으로 VPC · sketchcatch_vpc_eks_container_app(aws_vpc), Subnet · sketchcatch_subnet_a_eks_container_app(aws_subnet)을 설정합니다.",
  wellArchitectedGuidance: [
    {
      observation: "공개 접근 설정이 포함되어 있습니다.",
      pillar: "security",
      recommendation: "공개 접근이 필요한지 확인하세요.",
      title: "보안 에이전트"
    },
    {
      observation: "운영 절차를 확인해야 합니다.",
      pillar: "operational_excellence",
      recommendation: "배포 전에 Plan을 검토하세요.",
      title: "운영 우수성 에이전트"
    }
  ]
} satisfies AiTerraformPreviewExplanationResult;

const diagnostic = {
  code: "terraform.sync.block_header",
  line: 14,
  message: "Unsupported block type for data.aws_eks_cluster_auth.sketchcatch",
  resourceAddress: "data.aws_eks_cluster_auth.sketchcatch",
  severity: "warning",
  sourceFileName: "providers.tf"
} satisfies TerraformDiagnostic;

const explanation = {
  category: "syntax",
  consensusRecommendation: "문제가 있는 줄을 수정하세요.",
  diagnosticExplanation: {
    canApply: false,
    codeFrame: [{ isErrorLine: true, lineNumber: 14, text: "broken token" }],
    errorType: "terraform.sync.block_header",
    fixExplanation: "잘못된 토큰을 삭제하세요.",
    line: 14,
    plainExplanation: "data.aws_eks_cluster_auth.sketchcatch 구문이 잘못되었습니다.",
    sourceFileName: "providers.tf"
  },
  likelyCause: "Terraform block 경계가 올바르지 않습니다.",
  nextActions: ["providers.tf 14번 줄을 수정하세요."],
  rawMessage: diagnostic.message,
  severity: "medium",
  stage: "validate",
  summary: "Terraform validate 오류가 발생했습니다.",
  wellArchitectedGuidance: []
} satisfies AiTerraformErrorExplanationResult;

const providerAttempts = [
  {
    fallbackReason: "provider_error",
    provider: "amazon_q",
    service: "amazon_q_business",
    status: "failed"
  },
  {
    fallbackReason: "credit_not_confirmed",
    provider: "bedrock",
    service: "bedrock_runtime",
    status: "skipped"
  },
  {
    provider: "fallback",
    service: "rule_fallback",
    status: "succeeded"
  }
] satisfies AiProviderAttempt[];

const providerMetadata = {
  attempts: providerAttempts,
  billingMode: "aws_credit_only",
  cacheHit: false,
  cacheKey: "must-not-be-presented",
  estimatedUsage: {
    inputCharacters: 120,
    inputTokensEstimate: 30
  },
  generatedAt: "2026-07-15T00:00:00.000Z",
  provider: "fallback",
  routeTarget: "terraform_preview_explanation",
  service: "rule_fallback"
} as const;

test("fallback 결과도 사용자에게는 완료된 분석으로 표시한다", () => {
  const fallbackExplanation = {
    fallbackUsed: true,
    highlights: [],
    nextActions: [],
    providerMetadata,
    summary: "규칙 기반 분석 결과입니다.",
    target: "terraform_preview_explanation"
  } satisfies LlmExplanation;

  const badge = createWorkspaceAiExplanationBadge(fallbackExplanation);

  assert.equal(badge, "분석 완료");
  assert.doesNotMatch(badge, /기본|fallback/i);
});

test("provider 시도 이력은 순서를 유지한 안전한 한국어 라벨만 만든다", () => {
  const attemptsWithPrivateFields = providerAttempts.map((attempt, index) => ({
    ...attempt,
    rawError: index === 0 ? "AccessKey=secret-value" : "private provider error"
  })) as AiProviderAttempt[];

  const result = createAiProviderAttemptPresentation(attemptsWithPrivateFields);

  assert.equal(providerAttempts[2]?.status, "succeeded");
  assert.deepEqual(result, [
    "1차 · Amazon Q · 실패 · 제공자 응답 오류",
    "2차 · Amazon Bedrock · 건너뜀 · AWS 크레딧 사용 확인 필요",
    "3차 · 규칙 기반 분석 · 성공"
  ]);
  assert.doesNotMatch(JSON.stringify(result), /AccessKey|secret-value|private provider error/);
});

test("에이전트 리뷰는 내부 주소 대신 리소스 수와 사용자 행동을 요약한다", () => {
  const result = createTerraformPreviewPresentation({
    ...preview,
    llmExplanation: {
      fallbackUsed: true,
      highlights: [],
      nextActions: [],
      providerMetadata,
      summary: "규칙 기반 검토 결과입니다.",
      target: "terraform_preview_explanation"
    }
  });
  const visibleResult = JSON.stringify({
    checks: result.checks,
    nextStep: result.nextStep,
    summary: result.summary
  });

  assert.match(result.summary, /2개/);
  assert.doesNotMatch(visibleResult, /sketchcatch_|aws_vpc|IaC Preview|resource 블록|cidr_blocks/);
  assert.deepEqual(
    result.checks.map((item) => item.label),
    [
      "운영",
      "보안",
      "안정성",
      "성능",
      "비용",
      "지속 가능성"
    ]
  );
  assert.equal(result.nextStep, "확인할 점을 검토한 뒤 배포 계획을 다시 확인하세요.");
  assert.match(result.technical.rawSummary, /sketchcatch_vpc/);
  assert.deepEqual(result.technical.providerAttempts, [
    "1차 · Amazon Q · 실패 · 제공자 응답 오류",
    "2차 · Amazon Bedrock · 건너뜀 · AWS 크레딧 사용 확인 필요",
    "3차 · 규칙 기반 분석 · 성공"
  ]);
});

test("에이전트 리뷰는 원문에 내부 표현이 있어도 쉬운 안내만 먼저 보여준다", () => {
  const result = createTerraformPreviewPresentation({
    ...preview,
    consensusRecommendation:
      "high finding: resource 블록의 cidr_blocks와 aws_vpc.sketchcatch_vpc를 확인하세요.",
    findings: [
      {
        ...preview.findings[0]!,
        recommendation: "instance_class와 cidr_blocks를 수정하세요.",
        title: "resource aws_vpc.sketchcatch_vpc high finding"
      }
    ],
    wellArchitectedGuidance: [
      {
        ...preview.wellArchitectedGuidance[1]!,
        observation: "module.network.aws_vpc 내부 참조를 확인하세요.",
        recommendation: "resource 블록을 수정하세요."
      }
    ]
  });
  const visibleResult = JSON.stringify({
    checks: result.checks,
    nextStep: result.nextStep,
    summary: result.summary
  });

  assert.doesNotMatch(
    visibleResult,
    /high finding|resource 블록|cidr_blocks|instance_class|aws_vpc|module\.network/
  );
  assert.match(result.technical.rawRecommendation, /cidr_blocks/);
});

test("오류 분석은 오류 유형과 위치를 제목에 표시하고 원문은 기술 정보에 둔다", () => {
  const result = createTerraformIssuePresentation({
    diagnostic,
    explanation: {
      ...explanation,
      llmExplanation: {
        fallbackUsed: true,
        highlights: [],
        nextActions: [],
        providerMetadata: {
          ...providerMetadata,
          routeTarget: "terraform_error_explanation"
        },
        summary: "규칙 기반 오류 분석 결과입니다.",
        target: "terraform_error_explanation"
      }
    },
    terraformCode: "broken token"
  });

  assert.equal(result.title, "terraform.sync.block_header(14줄)");
  assert.equal(result.summary, "");
  assert.equal(result.location, "providers.tf 14번째 줄");
  assert.doesNotMatch(result.summary, /data\.aws|terraform\.sync/);
  assert.equal(result.technical.rawMessage, diagnostic.message);
  assert.equal(result.technical.errorType, "terraform.sync.block_header");
  assert.equal(result.technical.providerLabel, "규칙 기반 분석");
  assert.equal(
    result.technical.providerNotice,
    "1차 · Amazon Q · 실패 · 제공자 응답 오류 → 2차 · Amazon Bedrock · 건너뜀 · AWS 크레딧 사용 확인 필요 → 3차 · 규칙 기반 분석 · 성공"
  );
});

test("리뷰 문맥은 반복 접두어를 제거한다", () => {
  assert.equal(formatTerraformReviewContext("현재 파일 · main.tf"), "main.tf 기준");
  assert.equal(formatTerraformReviewContext("전체 Terraform"), "전체 Terraform 기준");
  assert.equal(
    formatTerraformReviewContext("리소스 코드 · aws_vpc.sketchcatch_vpc"),
    "선택한 리소스 기준"
  );
  assert.equal(
    formatTerraformReviewContext("강조 코드 · module.network.aws_subnet.private"),
    "선택한 코드 기준"
  );
});

test("Workbench 결과는 기존 표시 모델만 재사용하고 레거시 카드 UI를 재사용하지 않는다", () => {
  assert.match(workbenchResultSource, /createTerraformPreviewPresentation/);
  assert.match(workbenchResultSource, /createTerraformIssuePresentation/);
  assert.match(workbenchResultSource, /WorkspaceAiWorkbenchTerraformPreviewResult/);
  assert.match(workbenchResultSource, /WorkspaceAiWorkbenchTerraformIssueResult/);
  assert.doesNotMatch(
    workbenchResultSource,
    /WorkspaceAiPanelPieces|aiStructuredResult|aiResultLead|workspace\.module\.css/
  );
});

function readWorkbenchResultSource(): string {
  try {
    return readFileSync(new URL("WorkspaceAiWorkbenchResults.tsx", import.meta.url), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}
