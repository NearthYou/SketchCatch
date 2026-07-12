import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  AiPreDeploymentAnalysisResult,
  ArchitectureDiagnostic,
  TerraformDiagnostic
} from "@sketchcatch/types";
import {
  addArchitectureDiagnosticsToPreDeploymentAnalysis,
  addTerraformDiagnosticsToPreDeploymentAnalysis,
  createPreDeploymentAnalysisFromArchitectureDiagnostics,
  createPreDeploymentAnalysisFromTerraformDiagnostics
} from "./pre-deployment-diagnostics";

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
  const result = addTerraformDiagnosticsToPreDeploymentAnalysis(createAnalysis(), [
    {
      severity: "error",
      message: "Unsupported argument",
      code: "unsupported-argument",
      line: 30,
      resourceAddress: "aws_route_table.public"
    }
  ]);

  assert.match(result.summary, /오류 1개/);
  assert.equal(result.checklist[0]?.id, "terraform-diagnostics-check");
  assert.equal(result.checklist[0]?.status, "fail");
  assert.deepEqual(result.checklist[0]?.relatedFindingIds, [
    "terraform-diagnostic-0-unsupported-argument"
  ]);
  assert.equal(result.findings[0]?.category, "configuration");
  assert.equal(result.findings[0]?.severity, "high");
  assert.equal(result.findings[0]?.resourceId, "aws_route_table.public");
  assert.deepEqual(result.findings[0]?.sourceLocation, {
    fileName: "main.tf",
    line: 30,
    resourceAddress: "aws_route_table.public"
  });
  assert.equal(result.findings[0]?.title, "Terraform 코드 30번째 줄 확인 필요");
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

test("createPreDeploymentAnalysisFromTerraformDiagnostics creates diagnostics-only fail-fast analysis", () => {
  const result = createPreDeploymentAnalysisFromTerraformDiagnostics([
    {
      severity: "error",
      message: "Unsupported argument",
      code: "unsupported-argument",
      sourceFileName: "security.tf",
      line: 4
    }
  ]);

  assert.match(result.summary, /오류 1개/);
  assert.equal(result.totalMonthlyEstimate.pricingAssumption.includes("fail-fast"), true);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.sourceLocation?.fileName, "security.tf");
  assert.equal(result.checklist[0]?.status, "fail");
});

test("architecture errors block pre-deployment check before remote analysis", () => {
  const result = createPreDeploymentAnalysisFromArchitectureDiagnostics([
    createArchitectureDiagnostic("error")
  ]);

  assert.match(result.summary, /설계 오류 1개/);
  assert.equal(result.findings[0]?.resourceId, "ec2-web");
  assert.equal(result.findings[0]?.severity, "high");
  assert.equal(result.checklist[0]?.status, "fail");
});

test("architecture warnings stay visible beside existing safety findings", () => {
  const result = addArchitectureDiagnosticsToPreDeploymentAnalysis(createAnalysis(), [
    createArchitectureDiagnostic("warning")
  ]);

  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.severity, "medium");
  assert.equal(result.checklist[0]?.status, "warning");
  assert.match(result.findings[0]?.recommendation ?? "", /Subnet/);
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

// Architecture rule 결과를 Safety Gate 테스트에서 재사용할 최소 형태로 만듭니다.
function createArchitectureDiagnostic(
  severity: ArchitectureDiagnostic["severity"]
): ArchitectureDiagnostic {
  return {
    code: "architecture.aws.ec2.subnet_context_missing",
    message: "EC2는 Subnet 안에 있어야 합니다.",
    relatedNodeIds: [],
    remediation: [{ action: "focus-resource", label: "Subnet 안으로 이동" }],
    resourceNodeId: "ec2-web",
    ruleId: "aws.ec2.subnet-context",
    severity,
    source: "architecture-rule",
    summary: "EC2 Subnet 배치 필요"
  };
}
