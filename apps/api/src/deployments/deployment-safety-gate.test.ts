import { test } from "node:test";
import assert from "node:assert/strict";
import type { CheckFinding, DeploymentPlanSummary, DeploymentPlanWarning } from "@sketchcatch/types";
import { evaluateDeploymentSafetyGate } from "./deployment-safety-gate.js";

test("evaluateDeploymentSafetyGate records high risk findings without blocking plan state", () => {
  const summary = evaluateDeploymentSafetyGate({
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

  assert.equal(summary.blocked, false);
  assert.deepEqual(
    summary.warnings.map((warning) => warning.id),
    [
      "pre_deployment_check:security-open-ssh-sg-1",
      "terraform_plan:DESTRUCTIVE_CHANGE:apply"
    ]
  );
  assert.equal(summary.warnings[0]?.blocksApproval, true);
  assert.deepEqual(summary.warnings[0]?.sourceLocation, {
    fileName: "main.tf",
    line: 15,
    column: 1,
    resourceAddress: "aws_security_group.sg_app",
    terraformBlockType: "resource",
    terraformBlockName: "sg_app"
  });
  assert.equal(summary.warnings[1]?.code, "DESTRUCTIVE_CHANGE");
});

test("evaluateDeploymentSafetyGate leaves medium and low warnings approvable after acknowledgement", () => {
  const summary = evaluateDeploymentSafetyGate({
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

  assert.equal(summary.blocked, false);
  assert.equal(summary.warnings.every((warning) => !warning.blocksApproval), true);
  assert.equal(summary.warnings.every((warning) => warning.requiresAcknowledgement), true);
});

test("evaluateDeploymentSafetyGate creates stable ids for unsupported resource warnings", () => {
  const input = {
    operation: "destroy" as const,
    planSummary: createPlanSummary(),
    unsupportedResourceTypes: ["aws_lambda_function"]
  };

  const first = evaluateDeploymentSafetyGate(input);
  const second = evaluateDeploymentSafetyGate(input);

  assert.equal(
    first.warnings[0]?.id,
    "terraform_plan:UNSUPPORTED_RESOURCE:destroy:aws_lambda_function"
  );
  assert.deepEqual(first.warnings, second.warnings);
});

test("evaluateDeploymentSafetyGate keeps cost risk warnings without blocking plan state", () => {
  const summary = evaluateDeploymentSafetyGate({
    operation: "apply",
    planSummary: createPlanSummary(),
    warnings: [
      createWarning({
        id: "cost_risk:expensive-resource",
        level: "high",
        source: "cost_risk",
        code: "UNSUPPORTED_RESOURCE",
        message: "Monthly estimate is above the allowed budget",
        blocksApproval: true,
        requiresAcknowledgement: false
      })
    ]
  });

  assert.equal(summary.blocked, false);
  assert.equal(summary.warnings[0]?.blocksApproval, true);
  assert.equal(summary.warnings[0]?.source, "cost_risk");
});

test("evaluateDeploymentSafetyGate deduplicates warnings by stable id", () => {
  const summary = evaluateDeploymentSafetyGate({
    operation: "apply",
    planSummary: createPlanSummary({
      warnings: [
        createWarning({
          id: "pre_deployment_check:configuration-review-subnet-1",
          level: "medium",
          code: "UNKNOWN_TERRAFORM_ACTION",
          message: "Existing stale warning",
          blocksApproval: false,
          requiresAcknowledgement: true
        })
      ]
    }),
    findings: [
      createFinding({
        id: "configuration-review-subnet-1",
        category: "configuration",
        severity: "medium",
        title: "Subnet review",
        recommendation: "Review generated subnet CIDR"
      })
    ]
  });

  assert.deepEqual(
    summary.warnings.map((warning) => warning.id),
    ["pre_deployment_check:configuration-review-subnet-1"]
  );
  assert.equal(summary.warnings[0]?.message, "Subnet review: Review generated subnet CIDR");
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

function createWarning(overrides: Partial<DeploymentPlanWarning> = {}): DeploymentPlanWarning {
  return {
    id: "pre_deployment_check:warning-1",
    level: "medium",
    category: "configuration",
    source: "pre_deployment_check",
    code: "UNKNOWN_TERRAFORM_ACTION",
    message: "Review warning",
    requiresAcknowledgement: true,
    blocksApproval: false,
    ...overrides
  };
}
