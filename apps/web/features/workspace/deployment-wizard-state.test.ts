import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getDeploymentWizardState,
  type DeploymentWizardStateInput
} from "./deployment-wizard-state";

function createInput(
  overrides: Partial<DeploymentWizardStateInput> = {}
): DeploymentWizardStateInput {
  return {
    approved: false,
    directApplyStatus: "not-started",
    gitCicdHandoffStatus: "not-created",
    plan: "missing",
    preparation: "pending",
    preflight: "idle",
    route: null,
    ...overrides
  };
}

test("wizard stops at Preflight when findings block deployment", () => {
  const state = getDeploymentWizardState(createInput({ preflight: "blocked" }));

  assert.equal(state.activeStepId, "preflight");
  assert.equal(state.steps.find((step) => step.id === "plan")?.state, "locked");
});

test("wizard cannot skip Prepare after Preflight passes", () => {
  const state = getDeploymentWizardState(createInput({ preflight: "passed" }));

  assert.equal(state.activeStepId, "prepare");
  assert.equal(state.steps.find((step) => step.id === "preflight")?.state, "complete");
  assert.equal(state.steps.find((step) => step.id === "plan")?.state, "locked");
});

test("wizard branches only after approved Plan", () => {
  const state = getDeploymentWizardState(
    createInput({ plan: "approved", preparation: "ready", preflight: "passed" })
  );

  assert.equal(state.activeStepId, "route");
  assert.equal(state.canChooseRoute, true);
});

test("Apply remains unavailable before the exact Plan is approved", () => {
  const state = getDeploymentWizardState(
    createInput({
      approved: false,
      plan: "ready",
      preparation: "ready",
      preflight: "passed",
      route: "direct"
    })
  );

  assert.equal(state.activeStepId, "approve");
  assert.equal(state.canRunDirectApply, false);
});

test("approved Plan can choose Git CI/CD without a Direct Apply result", () => {
  const state = getDeploymentWizardState(
    createInput({
      approved: true,
      directApplyStatus: "not-started",
      plan: "ready",
      preparation: "ready",
      preflight: "passed",
      route: "git-cicd"
    })
  );

  assert.equal(state.canCreateGitCicdHandoff, true);
});

test("wizard distinguishes a running execution from a finished result", () => {
  const running = getDeploymentWizardState(
    createInput({
      approved: true,
      directApplyStatus: "running",
      plan: "ready",
      preparation: "ready",
      preflight: "passed",
      route: "direct"
    })
  );
  const finished = getDeploymentWizardState(
    createInput({
      approved: true,
      directApplyStatus: "success",
      plan: "ready",
      preparation: "ready",
      preflight: "passed",
      route: "direct"
    })
  );

  assert.equal(running.executionPhase, "running");
  assert.equal(finished.executionPhase, "finished");
});
