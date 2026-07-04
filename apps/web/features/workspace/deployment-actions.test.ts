import assert from "node:assert/strict";
import { test } from "node:test";
import type { Deployment } from "@sketchcatch/types";
import {
  getDefaultDeploymentPanelMode,
  getDeploymentActionState,
  getDeploymentLogMessageTokens,
  getDeploymentLogTone,
  hasCompleteDeploymentApprovalSnapshot,
  shouldAutoRefreshDeployment,
  shouldShowDeploymentInfoValue
} from "./deployment-actions";

test("successful apply deployment offers cleanup planning but not direct destroy", () => {
  const state = getDeploymentActionState(
    createDeployment({
      approved: true,
      currentPlanOperation: "apply",
      stateObjectKey: "deployments/deployment-id/state/terraform.tfstate",
      status: "SUCCESS"
    }),
    "idle"
  );

  assert.equal(state.shouldShowApplyPlanButton, false);
  assert.equal(state.shouldShowApplyButton, false);
  assert.equal(state.shouldShowDestroyPlanButton, true);
  assert.equal(state.canRunDestroyPlan, true);
  assert.equal(state.shouldShowDestroyButton, false);
  assert.equal(state.canDestroy, false);
});

test("pending deployment without a current plan offers a Terraform plan action", () => {
  const state = getDeploymentActionState(createDeployment(), "idle");

  assert.equal(state.shouldShowApplyPlanButton, true);
  assert.equal(state.canRunApplyPlan, true);
});

test("deployment panel starts on setup when no deployment exists", () => {
  assert.equal(getDefaultDeploymentPanelMode([]), "setup");
});

test("deployment panel starts on records when deployments exist", () => {
  assert.equal(getDefaultDeploymentPanelMode([createDeployment()]), "records");
});

test("destroy plan waits for approval before showing destroy execution", () => {
  const state = getDeploymentActionState(
    createDeployment({
      blockedBy: "missing_approval",
      currentPlanArtifactId: "99999999-9999-4999-8999-999999999999",
      currentPlanOperation: "destroy",
      isBlocked: true,
      stateObjectKey: "deployments/deployment-id/state/terraform.tfstate",
      status: "SUCCESS"
    }),
    "idle"
  );

  assert.equal(state.shouldShowApprovePlanButton, true);
  assert.equal(state.canApprovePlan, true);
  assert.equal(state.approvePlanLabel, "Destroy Plan 승인");
  assert.equal(state.shouldShowApplyPlanButton, false);
  assert.equal(state.shouldShowDestroyButton, false);
});

test("destroy plan never falls back to the Terraform apply plan action", () => {
  const state = getDeploymentActionState(
    createDeployment({
      blockedBy: "missing_approval",
      currentPlanArtifactId: "99999999-9999-4999-8999-999999999999",
      currentPlanOperation: "destroy",
      isBlocked: true,
      status: "PENDING"
    }),
    "idle"
  );

  assert.equal(state.shouldShowApplyPlanButton, false);
  assert.equal(state.canRunApplyPlan, false);
  assert.equal(state.shouldShowApprovePlanButton, true);
});

test("current plan without an operation does not fall back to a Terraform plan rerun", () => {
  const state = getDeploymentActionState(
    createDeployment({
      blockedBy: "missing_approval",
      currentPlanArtifactId: "99999999-9999-4999-8999-999999999999",
      currentPlanOperation: null,
      isBlocked: true,
      status: "PENDING"
    }),
    "idle"
  );

  assert.equal(state.shouldShowApplyPlanButton, false);
  assert.equal(state.canRunApplyPlan, false);
  assert.equal(state.shouldShowApprovePlanButton, true);
});

test("running Terraform work hides stale plan rerun actions", () => {
  const state = getDeploymentActionState(
    createDeployment({
      currentPlanArtifactId: "99999999-9999-4999-8999-999999999999",
      currentPlanOperation: "destroy",
      status: "RUNNING"
    }),
    "idle"
  );

  assert.equal(state.shouldShowApplyPlanButton, false);
  assert.equal(state.shouldShowDestroyPlanButton, false);
});

test("approved destroy plan enables destroy and keeps apply hidden", () => {
  const state = getDeploymentActionState(
    createDeployment({
      approved: true,
      currentPlanArtifactId: "99999999-9999-4999-8999-999999999999",
      currentPlanOperation: "destroy",
      isBlocked: false,
      stateObjectKey: "deployments/deployment-id/state/terraform.tfstate",
      status: "SUCCESS"
    }),
    "idle"
  );

  assert.equal(state.shouldShowApplyButton, false);
  assert.equal(state.canApply, false);
  assert.equal(state.shouldShowDestroyButton, true);
  assert.equal(state.canDestroy, true);
});

test("approved apply waits for a complete approval snapshot", () => {
  const deployment = createDeployment({
    approved: true,
    approvedTfplanHash: null,
    currentPlanArtifactId: "99999999-9999-4999-8999-999999999999",
    currentPlanOperation: "apply",
    isBlocked: false,
    status: "PENDING"
  });
  const state = getDeploymentActionState(deployment, "idle");

  assert.equal(hasCompleteDeploymentApprovalSnapshot(deployment), false);
  assert.equal(state.shouldShowApplyButton, true);
  assert.equal(state.canApply, false);
});

test("failed apply with partial state offers cleanup planning", () => {
  const state = getDeploymentActionState(
    createDeployment({
      failureStage: "apply",
      stateObjectKey: "deployments/deployment-id/state/terraform.tfstate",
      status: "FAILED"
    }),
    "idle"
  );

  assert.equal(state.shouldShowApplyPlanButton, false);
  assert.equal(state.shouldShowDestroyPlanButton, true);
  assert.equal(state.canRunDestroyPlan, true);
});

test("auto-refreshes while Terraform work is running", () => {
  assert.equal(
    shouldAutoRefreshDeployment(
      createDeployment({
        status: "RUNNING"
      })
    ),
    true
  );
});

test("stops auto-refreshing after Terraform work reaches a stable state", () => {
  for (const status of ["SUCCESS", "FAILED", "CANCELLED", "DESTROYED", "PENDING"] as const) {
    assert.equal(
      shouldAutoRefreshDeployment(
        createDeployment({
          status
        })
      ),
      false
    );
  }
});

test("hides empty deployment info values from the detail list", () => {
  assert.equal(shouldShowDeploymentInfoValue(null), false);
  assert.equal(shouldShowDeploymentInfoValue(undefined), false);
  assert.equal(shouldShowDeploymentInfoValue(""), false);
  assert.equal(shouldShowDeploymentInfoValue("없음"), false);
});

test("keeps meaningful deployment info values in the detail list", () => {
  assert.equal(shouldShowDeploymentInfoValue("DESTROYED"), true);
  assert.equal(shouldShowDeploymentInfoValue("no"), true);
  assert.equal(shouldShowDeploymentInfoValue("Plan 필요"), true);
});

test("deployment log tone highlights only important log levels", () => {
  assert.equal(getDeploymentLogTone(createDeploymentLog({ level: "ERROR", stage: "apply" })), "error");
  assert.equal(getDeploymentLogTone(createDeploymentLog({ level: "WARN", stage: "plan" })), "warning");
  assert.equal(getDeploymentLogTone(createDeploymentLog({ level: "INFO", stage: "destroy" })), "default");
  assert.equal(getDeploymentLogTone(createDeploymentLog({ level: "INFO", stage: "apply" })), "default");
  assert.equal(getDeploymentLogTone(createDeploymentLog({ level: "INFO", stage: "plan" })), "default");
  assert.equal(getDeploymentLogTone(createDeploymentLog({ level: "INFO", stage: "init" })), "default");
});

test("deployment log message tokens highlight Terraform signals without coloring everything", () => {
  assert.deepEqual(
    getDeploymentLogMessageTokens(
      'aws_vpc.main: Creation complete after 11s [id=vpc-0e88956e55c0cb2b2]'
    ),
    [
      { text: "aws_vpc.main", tone: "resource" },
      { text: ": ", tone: "plain" },
      { text: "Creation complete", tone: "operation" },
      { text: " after 11s ", tone: "plain" },
      { text: "[id=vpc-0e88956e55c0cb2b2]", tone: "metadata" }
    ]
  );
  assert.deepEqual(
    getDeploymentLogMessageTokens('ec2_public_ip = "15.165.43.171"'),
    [
      { text: "ec2_public_ip", tone: "output" },
      { text: " = ", tone: "plain" },
      { text: '"15.165.43.171"', tone: "string" }
    ]
  );
});

function createDeployment(
  overrides: Partial<Deployment> & {
    readonly approved?: boolean;
    readonly currentPlanOperation?: "apply" | "destroy" | null;
  } = {}
): Deployment {
  const approved = overrides.approved ?? false;

  return {
    id: "44444444-4444-4444-8444-444444444444",
    projectId: "11111111-1111-4111-8111-111111111111",
    architectureId: "55555555-5555-4555-8555-555555555555",
    terraformArtifactId: "66666666-6666-4666-8666-666666666666",
    awsConnectionId: "33333333-3333-4333-8333-333333333333",
    currentPlanArtifactId: overrides.currentPlanArtifactId ?? null,
    currentPlanOperation: overrides.currentPlanOperation ?? null,
    stateObjectKey: overrides.stateObjectKey ?? null,
    resultWarningSummary: null,
    status: overrides.status ?? "PENDING",
    activeStage: null,
    planSummary: null,
    isBlocked: overrides.isBlocked ?? false,
    blockedBy: overrides.blockedBy ?? null,
    blockedReason: null,
    failureStage: overrides.failureStage ?? null,
    errorSummary: null,
    approvedAt: approved ? "2026-06-26T00:00:00.000Z" : null,
    approvedByUserId: approved ? "22222222-2222-4222-8222-222222222222" : null,
    approvedTerraformArtifactId: approved ? "66666666-6666-4666-8666-666666666666" : null,
    approvedPlanArtifactId: approved ? "99999999-9999-4999-8999-999999999999" : null,
    approvedTerraformArtifactHash: approved ? "a".repeat(64) : null,
    approvedTfplanHash: approved ? "b".repeat(64) : null,
    approvedAwsAccountId: approved ? "123456789012" : null,
    approvedAwsRegion: approved ? "ap-northeast-2" : null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
    ...overrides
  };
}

function createDeploymentLog(
  overrides: Partial<Parameters<typeof getDeploymentLogTone>[0]> = {}
): Parameters<typeof getDeploymentLogTone>[0] {
  return {
    level: "INFO",
    stage: "init",
    ...overrides
  };
}
