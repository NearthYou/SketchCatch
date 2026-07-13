import assert from "node:assert/strict";
import { test } from "node:test";
import type { Deployment, GitCicdPipelineRun } from "@sketchcatch/types";
import {
  ACTIVE_WORKSPACE_OBSERVER_INTERVAL_MS,
  IDLE_WORKSPACE_OBSERVER_INTERVAL_MS,
  createInitialWorkspaceDeploymentObservation,
  getWorkspaceDeploymentObserverIntervalMs,
  observeWorkspaceDeploymentSnapshots
} from "./workspace-deployment-observer";

test("initial terminal snapshots establish a baseline without notifying", () => {
  const result = observeWorkspaceDeploymentSnapshots(
    createInitialWorkspaceDeploymentObservation(),
    {
      deployments: [createDeployment("SUCCESS", "apply")],
      pipelineRuns: [createPipelineRun("succeeded")]
    }
  );

  assert.deepEqual(result.directTransitions, []);
  assert.deepEqual(result.pipelineTransitions, []);
});

test("observer reports apply and pipeline success or failure transitions after the baseline", () => {
  const baseline = observeWorkspaceDeploymentSnapshots(
    createInitialWorkspaceDeploymentObservation(),
    {
      deployments: [createDeployment("RUNNING", "apply")],
      pipelineRuns: [createPipelineRun("running")]
    }
  ).state;
  const result = observeWorkspaceDeploymentSnapshots(baseline, {
    deployments: [createDeployment("SUCCESS", "apply")],
    pipelineRuns: [createPipelineRun("failed")]
  });

  assert.deepEqual(result.directTransitions.map((item) => item.status), ["SUCCESS"]);
  assert.deepEqual(result.pipelineTransitions.map((item) => item.status), ["failed"]);
});

test("transient fetch failures preserve the last successful baseline", () => {
  const baseline = observeWorkspaceDeploymentSnapshots(
    createInitialWorkspaceDeploymentObservation(),
    {
      deployments: [createDeployment("RUNNING", "apply")],
      pipelineRuns: [createPipelineRun("running")]
    }
  ).state;
  const failedPoll = observeWorkspaceDeploymentSnapshots(baseline, {});
  const recovered = observeWorkspaceDeploymentSnapshots(failedPoll.state, {
    deployments: [createDeployment("FAILED", "apply")],
    pipelineRuns: [createPipelineRun("succeeded")]
  });

  assert.equal(failedPoll.state, baseline);
  assert.deepEqual(recovered.directTransitions.map((item) => item.status), ["FAILED"]);
  assert.deepEqual(recovered.pipelineTransitions.map((item) => item.status), ["succeeded"]);
});

test("observer polls quickly only while Direct or CI/CD work is active", () => {
  const activeDirect = observeWorkspaceDeploymentSnapshots(
    createInitialWorkspaceDeploymentObservation(),
    { deployments: [createDeployment("RUNNING", "apply")], pipelineRuns: [] }
  ).state;
  const activePipeline = observeWorkspaceDeploymentSnapshots(
    createInitialWorkspaceDeploymentObservation(),
    { deployments: [], pipelineRuns: [createPipelineRun("running")] }
  ).state;
  const idle = observeWorkspaceDeploymentSnapshots(
    createInitialWorkspaceDeploymentObservation(),
    {
      deployments: [createDeployment("SUCCESS", "apply")],
      pipelineRuns: [createPipelineRun("succeeded")]
    }
  ).state;

  assert.equal(getWorkspaceDeploymentObserverIntervalMs(activeDirect), ACTIVE_WORKSPACE_OBSERVER_INTERVAL_MS);
  assert.equal(getWorkspaceDeploymentObserverIntervalMs(activePipeline), ACTIVE_WORKSPACE_OBSERVER_INTERVAL_MS);
  assert.equal(getWorkspaceDeploymentObserverIntervalMs(idle), IDLE_WORKSPACE_OBSERVER_INTERVAL_MS);
});

function createDeployment(
  status: Deployment["status"],
  operation: Deployment["currentPlanOperation"]
): Deployment {
  return {
    id: "deployment-1",
    projectId: "project-1",
    architectureId: "architecture-1",
    terraformArtifactId: "artifact-1",
    awsConnectionId: "connection-1",
    liveProfile: "practice",
    scope: "infrastructure",
    targetKind: null,
    source: "direct",
    releaseId: null,
    currentPlanArtifactId: "plan-1",
    currentPlanOperation: operation,
    stateObjectKey: null,
    resultWarningSummary: null,
    status,
    activeStage: null,
    planSummary: null,
    failureStage: null,
    errorSummary: null,
    approvedAt: null,
    approvedByUserId: null,
    approvedTerraformArtifactId: null,
    approvedPlanArtifactId: null,
    approvedTerraformArtifactHash: null,
    approvedTfplanHash: null,
    approvedAwsAccountId: null,
    approvedAwsRegion: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    createdAt: "2026-07-13T03:00:00.000Z",
    updatedAt: "2026-07-13T03:00:00.000Z",
    isBlocked: false,
    blockedBy: null,
    blockedReason: null
  };
}

function createPipelineRun(status: GitCicdPipelineRun["status"]): GitCicdPipelineRun {
  return {
    id: "run-1",
    projectId: "project-1",
    sourceRepositoryId: "repository-1",
    handoffId: null,
    commitSha: "a13f9c2d4e5f6789",
    commitMessage: "Deploy",
    branch: "main",
    changeScope: "app_and_infra",
    status,
    statusMessage: null,
    pipelineRunUrl: null,
    appUrl: null,
    apiUrl: null,
    startedAt: null,
    finishedAt: null,
    upstreamOrderingToken: "2026-07-13T03:00:00.000Z|SketchCatch App:1:1",
    logRevision: "SketchCatch App:1:1",
    lastRefreshedAt: "2026-07-13T03:00:00.000Z",
    createdAt: "2026-07-13T03:00:00.000Z",
    stages: []
  };
}
