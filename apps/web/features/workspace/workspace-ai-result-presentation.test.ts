import assert from "node:assert/strict";
import test from "node:test";
import type {
  AiTerraformErrorExplanationResult,
  AiTerraformPreviewExplanationResult,
  TerraformDiagnostic
} from "@sketchcatch/types";
import {
  createTerraformIssuePresentation,
  createTerraformPreviewPresentation,
  formatTerraformReviewContext
} from "./workspace-ai-result-presentation";
import { selectTerraformIssueCodeContext } from "./workspace-terraform-ai";
import { applyTerraformSafeFix, getTerraformSafeFix } from "./terraform-safe-fixes";

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

test("에이전트 리뷰는 내부 주소 대신 리소스 수와 사용자 행동을 요약한다", () => {
  const result = createTerraformPreviewPresentation(preview);
  const visibleResult = JSON.stringify({
    checks: result.checks,
    nextStep: result.nextStep,
    summary: result.summary
  });

  assert.match(result.summary, /2개/);
  assert.doesNotMatch(visibleResult, /sketchcatch_|aws_vpc|IaC Preview|resource 블록|cidr_blocks/);
  assert.deepEqual(
    result.checks.map((item) => item.label),
    ["보안", "운영"]
  );
  assert.equal(result.nextStep, "확인할 점을 검토한 뒤 배포 계획을 다시 확인하세요.");
  assert.match(result.technical.rawSummary, /sketchcatch_vpc/);
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

test("오류 분석은 쉬운 제목과 행동을 먼저 제공하고 원문은 기술 정보에 둔다", () => {
  const result = createTerraformIssuePresentation({
    diagnostic,
    explanation,
    terraformCode: "broken token"
  });

  assert.equal(result.title, "Terraform 코드 형식을 확인해 주세요");
  assert.equal(result.summary, "코드 형식이 올바르지 않아 검증을 계속할 수 없습니다.");
  assert.equal(result.location, "providers.tf 14번째 줄");
  assert.doesNotMatch(result.summary, /data\.aws|terraform\.sync/);
  assert.equal(result.technical.rawMessage, diagnostic.message);
  assert.equal(result.technical.errorType, "terraform.sync.block_header");
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

test("오류 분석은 다중 Terraform 파일에서 진단 파일의 코드만 사용한다", () => {
  const terraformCode = selectTerraformIssueCodeContext(
    [
      {
        fileName: "providers.tf",
        code: 'terraform {\n  required_providers {\n    aws = {\n      source = "hashicorp/aws"\n    }\n  }\n}'
      },
      {
        fileName: "main.tf",
        code: 'resource "aws_s3_bucket" "s3_bucket" {\n  force_destroy = false\n}sdasd'
      }
    ],
    {
      severity: "error",
      code: "terraform.unexpected_token",
      message: "닫힌 block 뒤에 알 수 없는 Terraform 코드가 붙어 있습니다.",
      sourceFileName: "main.tf",
      line: 3
    }
  );

  assert.equal(
    terraformCode,
    'resource "aws_s3_bucket" "s3_bucket" {\n  force_destroy = false\n}sdasd'
  );
});

test("닫힌 block 뒤 토큰은 닫는 중괄호를 보존해서 수정한다", () => {
  const unexpectedTokenDiagnostic = {
    severity: "error",
    code: "terraform.unexpected_token",
    message: "닫힌 block 뒤에 알 수 없는 Terraform 코드가 붙어 있습니다.",
    sourceFileName: "main.tf",
    line: 3
  } satisfies TerraformDiagnostic;

  assert.equal(getTerraformSafeFix(unexpectedTokenDiagnostic).applicable, true);
  assert.deepEqual(
    applyTerraformSafeFix({
      code: 'resource "aws_s3_bucket" "s3_bucket" {\n  force_destroy = false\n}sdasd',
      diagnostic: unexpectedTokenDiagnostic
    }),
    {
      applied: true,
      code: 'resource "aws_s3_bucket" "s3_bucket" {\n  force_destroy = false\n}',
      message: "Terraform 안전 수정안을 적용했습니다."
    }
  );
});

test("독립된 알 수 없는 코드 줄은 의도를 단정해 자동 삭제하지 않는다", () => {
  const standaloneTokenDiagnostic = {
    severity: "error",
    code: "terraform.unexpected_token",
    message: "알 수 없는 Terraform 코드 줄입니다. resource/data block 또는 attribute 형식으로 작성하세요.",
    sourceFileName: "main.tf",
    line: 1
  } satisfies TerraformDiagnostic;

  assert.equal(getTerraformSafeFix(standaloneTokenDiagnostic).applicable, false);
  assert.equal(
    createTerraformIssuePresentation({
      diagnostic: standaloneTokenDiagnostic,
      explanation: {
        ...explanation,
        diagnosticExplanation: {
          ...explanation.diagnosticExplanation,
          codeFrame: [{ isErrorLine: true, lineNumber: 1, text: "sdasd" }],
          errorType: "terraform.unexpected_token",
          line: 1,
          sourceFileName: "main.tf"
        }
      },
      terraformCode: "sdasd"
    }).canApply,
    false
  );
});
