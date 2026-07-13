import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Deployment } from "@sketchcatch/types";
import {
  createInitialWorkspaceNotificationState,
  getNotifiableDirectDeploymentTransitions,
  reduceWorkspaceNotifications,
  shouldCreateBrowserNotification,
  type WorkspaceNotificationEvent
} from "./workspace-notifications";

const samePipelineEvent: WorkspaceNotificationEvent = {
  type: "pipeline_terminal",
  runId: "run-1",
  status: "succeeded",
  title: "배포 완료",
  body: "SketchCatch · main · a13f9c2 · 성공"
};

test("only succeeded and failed terminal events enqueue an in-app notification", () => {
  const initial = createInitialWorkspaceNotificationState();
  const running = reduceWorkspaceNotifications(initial, {
    ...samePipelineEvent,
    status: "running"
  });
  const cancelled = reduceWorkspaceNotifications(initial, {
    ...samePipelineEvent,
    status: "cancelled"
  });
  const succeeded = reduceWorkspaceNotifications(initial, samePipelineEvent);
  const failed = reduceWorkspaceNotifications(initial, {
    ...samePipelineEvent,
    runId: "run-2",
    status: "failed"
  });

  assert.equal(running.items.length, 0);
  assert.equal(cancelled.items.length, 0);
  assert.equal(succeeded.items.length, 1);
  assert.equal(failed.items.length, 1);
});

test("the same run and status notification key enqueues only once", () => {
  const next = reduceWorkspaceNotifications(
    createInitialWorkspaceNotificationState(),
    samePipelineEvent
  );

  assert.equal(next.items.length, 1);
  assert.equal(next.notifiedKeys[0], "run-1:succeeded");
  assert.equal(reduceWorkspaceNotifications(next, samePipelineEvent).items.length, 1);
});

test("denied or unsupported browser notifications still enqueue the in-app item", () => {
  const denied = reduceWorkspaceNotifications(
    createInitialWorkspaceNotificationState(),
    samePipelineEvent
  );
  const unsupported = reduceWorkspaceNotifications(
    createInitialWorkspaceNotificationState(),
    samePipelineEvent
  );

  assert.equal(shouldCreateBrowserNotification("denied"), false);
  assert.equal(shouldCreateBrowserNotification("unsupported"), false);
  assert.equal(denied.items.length, 1);
  assert.equal(unsupported.items.length, 1);
});

test("browser notification permission is requested only by the explicit control", () => {
  const hostSource = readFileSync(
    new URL("WorkspaceNotificationHost.tsx", import.meta.url),
    "utf8"
  );

  assert.match(hostSource, />\s*브라우저 알림 켜기\s*</);
  assert.match(hostSource, /onClick=\{requestBrowserNotificationPermission\}/);
  assert.doesNotMatch(
    hostSource,
    /useEffect\(\s*(?:async\s*)?\(\)\s*=>\s*(?:void\s*)?requestBrowserNotificationPermission/
  );
});

test("browser Notification failures cannot interrupt the in-app fallback", () => {
  const hostSource = readFileSync(
    new URL("WorkspaceNotificationHost.tsx", import.meta.url),
    "utf8"
  );

  assert.match(hostSource, /try \{[^]*new window\.Notification[^]*\} catch \{/);
});

test("Direct notifications include only selected apply success or failure transitions", () => {
  const running = createDeployment("RUNNING", "apply");

  assert.deepEqual(
    getNotifiableDirectDeploymentTransitions(
      [running],
      [createDeployment("SUCCESS", "apply")],
      running.id
    ).map((deployment) => deployment.status),
    ["SUCCESS"]
  );
  assert.deepEqual(
    getNotifiableDirectDeploymentTransitions(
      [running],
      [createDeployment("FAILED", "apply")],
      running.id
    ).map((deployment) => deployment.status),
    ["FAILED"]
  );
  assert.deepEqual(
    getNotifiableDirectDeploymentTransitions(
      [],
      [createDeployment("SUCCESS", "apply")],
      running.id
    ),
    []
  );
  assert.deepEqual(
    getNotifiableDirectDeploymentTransitions(
      [createDeployment("RUNNING", "destroy")],
      [createDeployment("FAILED", "destroy")],
      running.id
    ),
    []
  );
  assert.deepEqual(
    getNotifiableDirectDeploymentTransitions(
      [createDeployment("RUNNING", null)],
      [createDeployment("SUCCESS", null)],
      running.id
    ),
    []
  );
  assert.deepEqual(
    getNotifiableDirectDeploymentTransitions(
      [running],
      [createDeployment("CANCELLED", "apply")],
      running.id
    ),
    []
  );
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
