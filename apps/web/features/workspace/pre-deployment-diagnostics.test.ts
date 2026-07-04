import assert from "node:assert/strict";
import { test } from "node:test";
import type { AiPreDeploymentAnalysisResult, TerraformDiagnostic } from "@sketchcatch/types";
import { addTerraformDiagnosticsToPreDeploymentAnalysis } from "./pre-deployment-diagnostics";

test("addTerraformDiagnosticsToPreDeploymentAnalysis keeps clean analysis unchanged", () => {
  const analysis = createAnalysis();

  assert.equal(
    addTerraformDiagnosticsToPreDeploymentAnalysis(analysis, [
      {
        severity: "info",
        message: "Terraform 코드 형식이 정상입니다."
      }
    ]),
    analysis
  );
});

test("addTerraformDiagnosticsToPreDeploymentAnalysis turns terraform errors into failed preflight findings", () => {
  const result = addTerraformDiagnosticsToPreDeploymentAnalysis(
    createAnalysis(),
    [
      {
        severity: "error",
        message: "Unsupported argument",
        code: "unsupported-argument",
        line: 3,
        resourceAddress: "aws_route_table.public"
      }
    ],
    [
      {
        fileName: "network.tf",
        code: `resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  unsupported = true
}`
      }
    ]
  );

  assert.match(result.summary, /오류 1개/);
  assert.equal(result.checklist[0]?.id, "terraform-diagnostics-check");
  assert.equal(result.checklist[0]?.status, "fail");
  assert.deepEqual(result.checklist[0]?.relatedFindingIds, [
    "terraform-diagnostic-0-unsupported-argument"
  ]);
  assert.equal(result.findings[0]?.category, "configuration");
  assert.equal(result.findings[0]?.severity, "high");
  assert.equal(result.findings[0]?.resourceId, "aws_route_table.public");
  assert.equal(result.findings[0]?.title, "Terraform 코드 3번째 줄 확인 필요");
  assert.deepEqual(result.findings[0]?.sourceLocation, {
    fileName: "network.tf",
    line: 3,
    column: 1,
    resourceAddress: "aws_route_table.public",
    terraformBlockType: "resource",
    terraformBlockName: "public"
  });
  assert.equal(result.suggestions[0]?.findingId, result.findings[0]?.id);
  assert.equal(result.suggestions[0]?.action, "manual_review");
});

test("addTerraformDiagnosticsToPreDeploymentAnalysis keeps warning-only diagnostics as warning preflight findings", () => {
  const warningDiagnostic: TerraformDiagnostic = {
    severity: "warning",
    message: "Deprecated argument",
    nodeId: "s3-bucket"
  };

  const result = addTerraformDiagnosticsToPreDeploymentAnalysis(createAnalysis(), [
    warningDiagnostic
  ]);

  assert.match(result.summary, /경고 1개/);
  assert.equal(result.checklist[0]?.status, "warning");
  assert.equal(result.findings[0]?.severity, "medium");
  assert.equal(result.findings[0]?.resourceId, "s3-bucket");
});

function createAnalysis(): AiPreDeploymentAnalysisResult {
  return {
    summary: "배포 전 검사에서 문제가 발견되지 않았습니다.",
    totalMonthlyEstimate: {
      amount: 0,
      currency: "USD",
      pricingAssumption: "테스트 fixture"
    },
    resourceCostEstimates: [],
    findings: [],
    checklist: [],
    suggestions: []
  };
}
