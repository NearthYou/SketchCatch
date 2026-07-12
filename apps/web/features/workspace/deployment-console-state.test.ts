import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getDirectDeploymentWizardCompatibility,
  getDirectDeploymentFlow,
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

test("unsaved changes make save the active Direct Deployment step", () => {
  const flow = getDirectDeploymentFlow(createInput({ hasUnsavedBaseline: true }));

  assert.equal(flow.activeStepId, "save");
  assert.equal(flow.steps[0]?.state, "active");
  assert.equal(flow.steps[1]?.state, "idle");
});

test("a never-run Preflight step is neutral and active after save", () => {
  const flow = getDirectDeploymentFlow(createInput());

  assert.equal(flow.activeStepId, "preflight");
  assert.equal(flow.steps[1]?.state, "active");
  assert.notEqual(flow.steps[1]?.state, "error");
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

  assert.equal(flow.activeStepId, "plan");
  assert.equal(flow.steps[2]?.state, "active");
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

  assert.equal(flow.activeStepId, "plan");
  assert.equal(flow.steps[1]?.state, "warning");
  assert.equal(flow.steps[2]?.state, "active");
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

  assert.equal(flow.activeStepId, "approve");
  assert.equal(flow.steps[3]?.state, "active");
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

  assert.equal(flow.activeStepId, "apply");
  assert.equal(flow.steps[4]?.state, "active");
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

  assert.equal(flow.activeStepId, "apply");
  assert.equal(flow.steps[4]?.state, "running");
});

test("blocked Preflight stops the flow without using idle error color", () => {
  const flow = getDirectDeploymentFlow(createInput({ preflightState: "blocked" }));

  assert.equal(flow.activeStepId, "preflight");
  assert.equal(flow.steps[1]?.state, "blocked");
  assert.equal(flow.steps[2]?.state, "idle");
});

test("destroy plans never produce the Direct Apply action", () => {
  const flow = getDirectDeploymentFlow(
    createInput({
      deployment: {
        approvedAt: "2026-07-11T00:00:00.000Z",
        currentPlanArtifactId: "destroy-plan",
        currentPlanOperation: "destroy",
        status: "SUCCESS"
      },
      preflightState: "passed"
    })
  );

  assert.equal(flow.activeStepId, "plan");
  assert.equal(flow.steps[2]?.state, "blocked");
  assert.match(flow.steps[2]?.statusLabel ?? "", /배포 기록/);
});

test("legacy Direct state maps into the six-step Wizard without approving a Plan implicitly", () => {
  const compatibility = getDirectDeploymentWizardCompatibility(
    createInput({
      deployment: {
        approvedAt: null,
        currentPlanArtifactId: "plan-1",
        currentPlanOperation: "apply",
        status: "PENDING"
      },
      preflightState: "passed"
    })
  );

  assert.equal(compatibility.preparation, "ready");
  assert.equal(compatibility.plan, "ready");
  assert.equal(compatibility.approved, false);
  assert.equal(compatibility.directApplyStatus, "not-started");
});
