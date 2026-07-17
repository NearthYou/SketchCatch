import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acknowledgeInitialCicdReturnCommand,
  cancelPendingCicdReturn,
  completePendingCicdReturn,
  createPendingCicdReturn,
  resolveInitialCicdReturnCommand
} from "./cicd-return-command";

test("opens CI/CD once and removes transient return parameters", () => {
  const result = resolveInitialCicdReturnCommand({
    currentProjectId: "project-1",
    requestedProjectId: "project-1",
    projectName: "demo",
    deploymentView: "cicd",
    readinessKey: "deployment_target"
  });

  assert.deepEqual(result, {
    projectId: "project-1",
    shouldOpenDeploymentConsole: true,
    activeScreen: "cicd",
    readinessKey: "deployment_target",
    cleanedHref: "/workspace?projectId=project-1&projectName=demo"
  });
});

test("keeps transient return parameters until the delayed console mount applies CI/CD refresh", () => {
  const command = resolveInitialCicdReturnCommand({
    currentProjectId: "project-1",
    requestedProjectId: "project-1",
    projectName: "demo",
    deploymentView: "cicd",
    readinessKey: "deployment_target"
  });

  assert.ok(command);
  assert.equal(
    acknowledgeInitialCicdReturnCommand({
      command,
      consoleState: null
    }),
    null
  );
  assert.equal(
    acknowledgeInitialCicdReturnCommand({
      command,
      consoleState: {
        projectId: "project-1",
        activeScreen: "cicd",
        readinessRefreshRequestId: 1
      }
    }),
    "/workspace?projectId=project-1&projectName=demo"
  );
});

test("ignores a return command for another project", () => {
  assert.equal(
    resolveInitialCicdReturnCommand({
      currentProjectId: "project-1",
      requestedProjectId: "project-2",
      projectName: "demo",
      deploymentView: "cicd",
      readinessKey: "deployment_target"
    }),
    null
  );
});

test("ignores unsupported deployment views and readiness keys", () => {
  for (const input of [
    { deploymentView: "deployment", readinessKey: "deployment_target" },
    { deploymentView: "cicd", readinessKey: "unknown" }
  ]) {
    assert.equal(
      resolveInitialCicdReturnCommand({
        currentProjectId: "project-1",
        requestedProjectId: "project-1",
        projectName: "demo",
        ...input
      }),
      null
    );
  }
});

test("returns to CI/CD and advances the refresh request after apply approval", () => {
  const result = completePendingCicdReturn({
    pending: createPendingCicdReturn("project-1"),
    approvedDeployment: {
      projectId: "project-1",
      currentPlanOperation: "apply"
    },
    currentRefreshRequestId: 4
  });

  assert.deepEqual(result, {
    activeScreen: "cicd",
    readinessRefreshRequestId: 5,
    pending: null
  });
});

test("does not consume the return for destroy approval or another project", () => {
  const pending = createPendingCicdReturn("project-1");

  for (const approvedDeployment of [
    { projectId: "project-1", currentPlanOperation: "destroy" as const },
    { projectId: "project-2", currentPlanOperation: "apply" as const }
  ]) {
    assert.equal(
      completePendingCicdReturn({
        pending,
        approvedDeployment,
        currentRefreshRequestId: 4
      }),
      null
    );
  }
});

test("does not consume a stale return after closing Direct and approving on a later visit", () => {
  const pendingAfterClose = cancelPendingCicdReturn(createPendingCicdReturn("project-1"));

  assert.equal(
    completePendingCicdReturn({
      pending: pendingAfterClose,
      approvedDeployment: {
        projectId: "project-1",
        currentPlanOperation: "apply"
      },
      currentRefreshRequestId: 4
    }),
    null
  );
});
