import { test } from "node:test";
import assert from "node:assert/strict";
import type { CheckFinding, DeploymentPlanSummary } from "@sketchcatch/types";
import { evaluateDeploymentSafetyGate } from "./deployment-safety-gate.js";

test("evaluateDeploymentSafetyGate blocks high risk findings and destructive apply plans", () => {
  const result = evaluateDeploymentSafetyGate({
    operation: "apply",
    planSummary: createPlanSummary({
      deleteCount: 1
    }),
    findings: [
      createFinding({
        id: "security-open-ssh-sg-1",
        resourceId: "sg-1",
        severity: "high",
        sourceLocation: {
          fileName: "main.tf",
          line: 15,
          column: 1,
          resourceAddress: "aws_security_group.sg_app",
          terraformBlockType: "resource",
          terraformBlockName: "sg_app"
        }
      })
    ]
  });

  assert.equal(result.block.blockedBy, "risk_analysis");
  assert.equal(result.requiredAcknowledgementWarningIds.length, 0);
  assert.deepEqual(
    result.summary.warnings.map((warning) => warning.id),
    [
      "pre_deployment_check:security-open-ssh-sg-1",
      "terraform_plan:DESTRUCTIVE_CHANGE:apply"
    ]
  );
  assert.equal(result.summary.warnings[0]?.blocksApproval, true);
  assert.deepEqual(result.summary.warnings[0]?.sourceLocation, {
    fileName: "main.tf",
    line: 15,
    column: 1,
    resourceAddress: "aws_security_group.sg_app",
    terraformBlockType: "resource",
    terraformBlockName: "sg_app"
  });
  assert.equal(result.summary.warnings[1]?.code, "DESTRUCTIVE_CHANGE");
});

test("evaluateDeploymentSafetyGate leaves medium and low warnings approvable after acknowledgement", () => {
  const result = evaluateDeploymentSafetyGate({
    operation: "apply",
    planSummary: createPlanSummary(),
    findings: [
      createFinding({
        id: "configuration-review-subnet-1",
        category: "configuration",
        severity: "medium"
      }),
      createFinding({
        id: "security-review-s3-1",
        severity: "low"
      })
    ]
  });

  assert.equal(result.block.blockedBy, "missing_approval");
  assert.deepEqual(result.requiredAcknowledgementWarningIds, [
    "pre_deployment_check:configuration-review-subnet-1",
    "pre_deployment_check:security-review-s3-1"
  ]);
  assert.equal(result.summary.warnings.every((warning) => !warning.blocksApproval), true);
  assert.equal(result.summary.warnings.every((warning) => warning.requiresAcknowledgement), true);
});

test("evaluateDeploymentSafetyGate creates stable ids for unsupported resource warnings", () => {
  const input = {
    operation: "destroy" as const,
    planSummary: createPlanSummary(),
    unsupportedResourceTypes: ["aws_lambda_function"]
  };

  const first = evaluateDeploymentSafetyGate(input);
  const second = evaluateDeploymentSafetyGate(input);

  assert.equal(first.block.blockedBy, "risk_analysis");
  assert.equal(
    first.summary.warnings[0]?.id,
    "terraform_plan:UNSUPPORTED_RESOURCE:destroy:aws_lambda_function"
  );
  assert.deepEqual(first.summary.warnings, second.summary.warnings);
});

function createPlanSummary(
  overrides: Partial<DeploymentPlanSummary> = {}
): DeploymentPlanSummary {
  return {
    createCount: 0,
    updateCount: 0,
    deleteCount: 0,
    replaceCount: 0,
    blocked: false,
    warnings: [],
    ...overrides
  };
}

function createFinding(overrides: Partial<CheckFinding> = {}): CheckFinding {
  return {
    id: "security-open-ssh-sg-1",
    category: "security",
    severity: "high",
    resourceId: "resource-1",
    title: "Public SSH",
    description: "0.0.0.0/0",
    recommendation: "Restrict CIDR",
    ...overrides
  };
}
