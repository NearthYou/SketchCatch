import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getDirectDeploymentFlow,
  shouldStartQueuedApplyPlan,
  type DirectDeploymentFlowInput
} from "./deployment-console-state";

const idleActions = {
  canApply: false,
  canApprovePlan: false,
  canRunApplyPlan: false,
  shouldShowApplyButton: false,
  shouldShowApprovePlanButton: false,
  shouldShowApplyPlanButton: false
};

function createInput(
  overrides: Partial<DirectDeploymentFlowInput> = {}
): DirectDeploymentFlowInput {
  return {
    actions: idleActions,
    deployment: null,
    hasUnsavedBaseline: false,
    preflightState: "idle",
    requestState: "idle",
    ...overrides
  };
}

test("Direct Deployment exposes exactly validation, approval, and deployment", () => {
  const flow = getDirectDeploymentFlow(createInput({ hasUnsavedBaseline: true }));

  assert.deepEqual(flow.steps.map((step) => step.id), ["validation", "approval", "deployment"]);
  assert.equal(flow.activeStepId, "validation");
  assert.equal(flow.steps[0]?.state, "active");
  assert.equal(flow.steps[1]?.state, "idle");
});

test("a never-run Preflight step is neutral and active after save", () => {
  const flow = getDirectDeploymentFlow(createInput());

  assert.equal(flow.activeStepId, "validation");
  assert.equal(flow.steps[0]?.state, "active");
  assert.notEqual(flow.steps[0]?.state, "error");
});

test("a created deployment without a plan advances to Plan", () => {
  const flow = getDirectDeploymentFlow(
    createInput({
      actions: { ...idleActions, canRunApplyPlan: true, shouldShowApplyPlanButton: true },
      deployment: {
        approvedAt: null,
        currentPlanArtifactId: null,
        currentPlanOperation: null,
        status: "PENDING"
      },
      preflightState: "passed"
    })
  );

  assert.equal(flow.activeStepId, "validation");
  assert.equal(flow.steps[0]?.state, "active");
});

test("a warning Preflight still advances a created deployment to Plan", () => {
  const flow = getDirectDeploymentFlow(
    createInput({
      actions: { ...idleActions, canRunApplyPlan: true, shouldShowApplyPlanButton: true },
      deployment: {
        approvedAt: null,
        currentPlanArtifactId: null,
        currentPlanOperation: null,
        status: "PENDING"
      },
      preflightState: "warning"
    })
  );

  assert.equal(flow.activeStepId, "validation");
  assert.equal(flow.steps[0]?.state, "warning");
});

test("an unapproved apply plan advances to approval", () => {
  const flow = getDirectDeploymentFlow(
    createInput({
      actions: { ...idleActions, canApprovePlan: true, shouldShowApprovePlanButton: true },
      deployment: {
        approvedAt: null,
        currentPlanArtifactId: "plan-1",
        currentPlanOperation: "apply",
        status: "PENDING"
      },
      preflightState: "passed"
    })
  );

  assert.equal(flow.activeStepId, "approval");
  assert.equal(flow.steps[1]?.state, "active");
});

test("an approved apply plan advances to Apply", () => {
  const flow = getDirectDeploymentFlow(
    createInput({
      actions: { ...idleActions, canApply: true, shouldShowApplyButton: true },
      deployment: {
        approvedAt: "2026-07-11T00:00:00.000Z",
        currentPlanArtifactId: "plan-1",
        currentPlanOperation: "apply",
        status: "PENDING"
      },
      preflightState: "passed"
    })
  );

  assert.equal(flow.activeStepId, "deployment");
  assert.equal(flow.steps[2]?.state, "active");
});

test("running apply reports a running final step", () => {
  const flow = getDirectDeploymentFlow(
    createInput({
      actions: { ...idleActions, shouldShowApplyButton: true },
      deployment: {
        approvedAt: "2026-07-11T00:00:00.000Z",
        currentPlanArtifactId: "plan-1",
        currentPlanOperation: "apply",
        status: "RUNNING"
      },
      preflightState: "passed",
      requestState: "loading"
    })
  );

  assert.equal(flow.activeStepId, "deployment");
  assert.equal(flow.steps[2]?.state, "running");
});

test("blocked Preflight stops the flow without using idle error color", () => {
  const flow = getDirectDeploymentFlow(createInput({ preflightState: "blocked" }));

  assert.equal(flow.activeStepId, "validation");
  assert.equal(flow.steps[0]?.state, "blocked");
  assert.equal(flow.steps[1]?.state, "idle");
});

test("destroy uses the same approval and deployment phases", () => {
  const flow = getDirectDeploymentFlow(
    createInput({
      deployment: {
        approvedAt: null,
        currentPlanArtifactId: "destroy-plan",
        currentPlanOperation: "destroy",
        status: "SUCCESS"
      },
      preflightState: "passed"
    })
  );

  assert.equal(flow.activeStepId, "approval");
  assert.equal(flow.steps[1]?.state, "active");
});

test("a queued deployment starts its apply plan after init returns to PENDING", () => {
  assert.equal(
    shouldStartQueuedApplyPlan({
      deployment: {
        id: "deployment-1",
        currentPlanArtifactId: null,
        status: "PENDING"
      },
      queuedDeploymentId: "deployment-1",
      requestState: "idle"
    }),
    true
  );
  assert.equal(
    shouldStartQueuedApplyPlan({
      deployment: {
        id: "deployment-1",
        currentPlanArtifactId: "plan-1",
        status: "PENDING"
      },
      queuedDeploymentId: "deployment-1",
      requestState: "idle"
    }),
    false
  );
  assert.equal(
    shouldStartQueuedApplyPlan({
      deployment: {
        id: "deployment-1",
        currentPlanArtifactId: null,
        status: "RUNNING"
      },
      queuedDeploymentId: "deployment-1",
      requestState: "idle"
    }),
    false
  );
});
