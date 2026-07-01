import { test } from "node:test";
import assert from "node:assert/strict";
import { createProjectDeletePreview, type ProjectDeleteSnapshot } from "./project-deletion-service.js";

const projectId = "33333333-3333-4333-8333-333333333333";
const fixedDate = new Date("2026-06-24T00:00:00.000Z");

test("createProjectDeletePreview exposes both delete choices for one active deployment", () => {
  const preview = createProjectDeletePreview(
    createSnapshot({
      deployments: [
        createDeploymentSummary({
          id: "deployment-success",
          resourceCount: 2,
          status: "SUCCESS"
        })
      ]
    })
  );

  assert.equal(preview.mode, "active_resources");
  assert.equal(preview.activeDeploymentId, "deployment-success");
  assert.equal(preview.activeResourceCount, 2);
  assert.deepEqual(preview.availableActions, ["destroy_then_delete", "delete_project_only"]);
});

test("createProjectDeletePreview blocks deletion while a deployment is running", () => {
  const preview = createProjectDeletePreview(
    createSnapshot({
      deployments: [
        createDeploymentSummary({
          activeStage: "apply",
          id: "deployment-running",
          status: "RUNNING"
        })
      ]
    })
  );

  assert.equal(preview.mode, "blocked_running_deployment");
  assert.deepEqual(preview.availableActions, []);
});

test("createProjectDeletePreview blocks automatic destroy when multiple deployments need cleanup", () => {
  const preview = createProjectDeletePreview(
    createSnapshot({
      deployments: [
        createDeploymentSummary({
          id: "deployment-success",
          resourceCount: 1,
          status: "SUCCESS"
        }),
        createDeploymentSummary({
          id: "deployment-failed",
          stateObjectKey: "deployments/deployment-failed/state/terraform.tfstate",
          status: "FAILED"
        })
      ]
    })
  );

  assert.equal(preview.mode, "blocked_multiple_active_deployments");
  assert.deepEqual(preview.availableActions, ["delete_project_only"]);
});

test("createProjectDeletePreview treats current plan pointers as planned projects", () => {
  const preview = createProjectDeletePreview(
    createSnapshot({
      deployments: [
        createDeploymentSummary({
          currentPlanArtifactId: "plan-artifact-id",
          id: "deployment-planned",
          status: "PENDING"
        })
      ]
    })
  );

  assert.equal(preview.mode, "planned");
  assert.equal(preview.hasPlanHistory, true);
  assert.deepEqual(preview.availableActions, ["delete_project"]);
});

test("createProjectDeletePreview treats destroyed deployments as deployment history", () => {
  const preview = createProjectDeletePreview(
    createSnapshot({
      deployments: [
        createDeploymentSummary({
          id: "deployment-destroyed",
          status: "DESTROYED"
        })
      ]
    })
  );

  assert.equal(preview.mode, "deployment_history");
  assert.equal(preview.hasDeploymentHistory, true);
  assert.deepEqual(preview.availableActions, ["delete_project"]);
});

function createSnapshot(
  overrides: Partial<ProjectDeleteSnapshot> = {}
): ProjectDeleteSnapshot {
  return {
    deployments: [],
    planArtifacts: [],
    projectAssets: [],
    projectId,
    ...overrides
  };
}

function createDeploymentSummary(
  overrides: Partial<ProjectDeleteSnapshot["deployments"][number]> = {}
): ProjectDeleteSnapshot["deployments"][number] {
  return {
    activeStage: null,
    completedAt: null,
    createdAt: fixedDate,
    currentPlanArtifactId: null,
    failureStage: null,
    id: "deployment-id",
    resourceCount: 0,
    stateObjectKey: null,
    status: "PENDING",
    updatedAt: fixedDate,
    ...overrides
  };
}
