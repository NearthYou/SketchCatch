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
    summary: result.summary,
    summaryItems: result.summaryItems
  });

  assert.match(result.summary, /2개/);
  assert.doesNotMatch(visibleResult, /sketchcatch_|aws_vpc|IaC Preview|resource 블록|cidr_blocks/);
  assert.deepEqual(
    result.checks.map((item) => item.label),
    ["운영", "보안", "안정성", "성능", "비용", "지속 가능성"]
  );
  assert.deepEqual(
    result.checks.map((item) => item.severity),
    ["low", "medium", "low", "low", "low", "low"]
  );
  assert.equal(result.nextStep, "확인할 점을 검토한 뒤 배포 계획을 다시 확인하세요.");
  assert.match(result.technical.rawSummary, /sketchcatch_vpc/);
});

test("에이전트 리뷰 요약은 잘된 점과 문제를 담은 앞 두 문장만 간결하게 보여준다", () => {
  const integratedReview =
    "현재 구성은 VPC와 서브넷을 분리하고 외부 접근 범위를 제한해 기본적인 네트워크 경계를 명확하게 만든 점이 좋습니다. 특히 공개 영역과 내부 영역의 역할이 구분되어 있어 이후 보안 정책을 확장하기 쉬운 구조입니다. 다만 저장 데이터 암호화, 접근 로그, 장애 복구 기준이 코드에 명시되지 않아 운영 중 문제 발생 시 원인을 추적하거나 서비스를 복구하기 어렵습니다. 배포 전에는 암호화 설정과 로그 보존 기간을 추가하고, 장애 시 복구할 수 있는 백업 정책까지 Terraform에 명확히 선언하는 것이 필요합니다.";
  const result = createTerraformPreviewPresentation({
    ...preview,
    llmExplanation: {
      fallbackUsed: false,
      highlights: [],
      nextActions: [],
      summary: "Amazon Q 검토 완료",
      target: "terraform_preview_explanation",
      wellArchitectedConclusion: integratedReview
    }
  });

  assert.equal(
    result.summary,
    "현재 구성은 VPC와 서브넷을 분리하고 외부 접근 범위를 제한해 기본적인 네트워크 경계를 명확하게 만든 점이 좋습니다. 다만 저장 데이터 암호화, 접근 로그, 장애 복구 기준이 코드에 명시되지 않아 운영 중 문제 발생 시 원인을 추적하거나 서비스를 복구하기 어렵습니다."
  );
  assert.ok(result.summary.length <= 320);
  assert.doesNotMatch(result.summary, /\n|잘한 점:|문제점:/u);
  assert.match(result.summary, /좋습니다/);
  assert.match(result.summary, /다만/);
  assert.deepEqual(
    result.summaryItems.map((item) => item.label),
    ["잘된 점", "잘된 점", "주요 문제"]
  );
});

test("에이전트 리뷰는 Amazon Q의 기준별 지적도 위험 색상 판정에 반영한다", () => {
  const result = createTerraformPreviewPresentation({
    ...preview,
    findings: [],
    llmExplanation: {
      fallbackUsed: false,
      highlights: [
        "[보통] 운영 우수성 | 판단: validate와 plan 절차가 준비되어 있습니다. | 확인: 배포 승인 전에 두 검사를 실행하세요.",
        "[보통] 보안 | 판단: 외부 접근 범위를 제한했습니다. | 확인: Security Group ingress가 필요한 CIDR만 허용하는지 확인하세요.",
        "[심각] 안정성 | 판단: desired_count=1로 task 장애 시 서비스가 중단됩니다. | 확인: desired_count를 2 이상으로 설정하고 서로 다른 AZ에 배치하세요.",
        "[보통] 성능 효율성 | 판단: 현재 Fargate 크기가 초기 부하에 적합합니다. | 확인: CPU와 메모리 사용률 경보를 연결하세요.",
        "[확인 필요] 비용 최적화 | 판단: 비용 추적 태그가 없어 유휴 비용을 구분하기 어렵습니다. | 확인: 프로젝트와 만료 시점 태그를 추가하세요.",
        "[보통] 지속 가능성 | 판단: 정리 절차가 준비되어 있습니다. | 확인: 세션 종료 후 destroy 실행 여부를 기록하세요."
      ],
      nextActions: [],
      summary: "Amazon Q 검토 완료",
      target: "terraform_preview_explanation",
      wellArchitectedConclusion: "구성의 장점과 보완점을 확인했습니다."
    }
  });

  assert.deepEqual(
    result.checks.map((item) => item.severity),
    ["low", "low", "high", "low", "medium", "low"]
  );
  assert.equal(
    result.checks[2]?.summary,
    "실행 중인 ECS 작업이 1개뿐이라, 해당 작업에 장애가 생기면 서비스가 중단됩니다."
  );
  assert.equal(
    result.checks[2]?.action,
    "ECS 작업을 2개 이상 실행하고 서로 다른 가용 영역(AZ)에 배치하세요."
  );
  assert.equal(
    result.checks[4]?.summary,
    "비용 추적 태그가 없어 유휴 비용을 구분하기 어렵습니다."
  );
  assert.equal(result.summaryItems[0]?.label, "잘된 점");
  assert.match(result.summaryItems[0]?.text ?? "", /운영.*validate와 plan/u);
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
    summary: result.summary,
    summaryItems: result.summaryItems
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
