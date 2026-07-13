import { test } from "node:test";
import assert from "node:assert/strict";
import type { GitCicdPipelineRun } from "../../../../packages/types/src";
import {
  ACTIVE_CICD_POLL_INTERVAL_MS,
  IDLE_CICD_POLL_INTERVAL_MS,
  createPipelineNotificationKey,
  getCicdPipelineRunState,
  getCicdPollIntervalMs,
  getNotifiablePipelineRunTransitions,
  isCicdMonitoringDraftComplete,
  isCicdPipelineRunStale,
  isNotifiablePipelineTransition,
  isTerminalPipelineTransition
} from "./cicd-console-state";

test("CI/CD polling uses five seconds while any run is active and thirty seconds while idle", () => {
  assert.equal(ACTIVE_CICD_POLL_INTERVAL_MS, 5_000);
  assert.equal(IDLE_CICD_POLL_INTERVAL_MS, 30_000);
  assert.equal(getCicdPollIntervalMs([{ status: "running" }]), 5_000);
  assert.equal(
    getCicdPollIntervalMs([{ status: "succeeded" }, { status: "queued" }]),
    5_000
  );
  assert.equal(getCicdPollIntervalMs([{ status: "succeeded" }]), 30_000);
  assert.equal(getCicdPollIntervalMs([]), 30_000);
});

test("enabled monitoring requires a branch and explicit app and infrastructure paths", () => {
  assert.equal(
    isCicdMonitoringDraftComplete({
      enabled: true,
      monitorBranch: "main",
      appPath: { mode: "repository_root", path: "." },
      infraPath: { mode: "subdirectory", path: "infra" }
    }),
    true
  );
  assert.equal(
    isCicdMonitoringDraftComplete({
      enabled: true,
      monitorBranch: "main",
      appPath: { mode: "subdirectory", path: "" },
      infraPath: { mode: "repository_root", path: "." }
    }),
    false
  );
  assert.equal(
    isCicdMonitoringDraftComplete({
      enabled: true,
      monitorBranch: " ",
      appPath: { mode: "repository_root", path: "." },
      infraPath: { mode: "repository_root", path: "." }
    }),
    false
  );
  assert.equal(
    isCicdMonitoringDraftComplete({
      enabled: false,
      monitorBranch: "",
      appPath: { mode: "subdirectory", path: "" },
      infraPath: { mode: "subdirectory", path: "" }
    }),
    true
  );
});

test("terminal transition detection only reports a non-terminal run reaching a terminal status", () => {
  assert.equal(isTerminalPipelineTransition("running", "succeeded"), true);
  assert.equal(isTerminalPipelineTransition("queued", "failed"), true);
  assert.equal(isTerminalPipelineTransition("running", "cancelled"), true);
  assert.equal(isTerminalPipelineTransition("running", "running"), false);
  assert.equal(isTerminalPipelineTransition("succeeded", "failed"), false);
});

test("notifiable transitions include only non-terminal runs that succeed or fail", () => {
  assert.equal(isNotifiablePipelineTransition("running", "succeeded"), true);
  assert.equal(isNotifiablePipelineTransition("running", "failed"), true);
  assert.equal(isNotifiablePipelineTransition("running", "cancelled"), false);
  assert.equal(isNotifiablePipelineTransition("succeeded", "failed"), false);
});

test("notifiable run transitions are matched by run id and produce stable deduplication keys", () => {
  const previousRuns = [
    createPipelineRun({ id: "run-1", status: "running" }),
    createPipelineRun({ id: "run-2", status: "queued" }),
    createPipelineRun({ id: "run-3", status: "running" }),
    createPipelineRun({ id: "run-4", status: "succeeded" })
  ];
  const nextRuns = [
    createPipelineRun({ id: "run-1", status: "succeeded" }),
    createPipelineRun({ id: "run-2", status: "failed" }),
    createPipelineRun({ id: "run-3", status: "cancelled" }),
    createPipelineRun({ id: "run-4", status: "failed" }),
    createPipelineRun({ id: "run-5", status: "failed" })
  ];

  assert.deepEqual(
    getNotifiablePipelineRunTransitions(previousRuns, nextRuns).map((run) => run.id),
    ["run-1", "run-2"]
  );
  assert.equal(createPipelineNotificationKey("run-1", "succeeded"), "run-1:succeeded");
});

test("run state selects the first active run as current while preserving an explicit history selection", () => {
  const newestFinished = createPipelineRun({
    id: "run-finished",
    status: "succeeded",
    createdAt: "2026-07-13T03:00:00.000Z"
  });
  const active = createPipelineRun({
    id: "run-active",
    status: "running",
    createdAt: "2026-07-13T02:00:00.000Z"
  });
  const olderFinished = createPipelineRun({
    id: "run-older",
    status: "failed",
    createdAt: "2026-07-13T01:00:00.000Z"
  });

  const state = getCicdPipelineRunState(
    [newestFinished, active, olderFinished],
    olderFinished.id
  );

  assert.equal(state.currentRun?.id, active.id);
  assert.deepEqual(
    state.historyRuns.map((run) => run.id),
    [newestFinished.id, olderFinished.id]
  );
  assert.equal(state.selectedRun?.id, olderFinished.id);
});

test("run state falls back to the newest run and current selection when there is no active run", () => {
  const newest = createPipelineRun({ id: "run-newest", status: "cancelled" });
  const older = createPipelineRun({ id: "run-older", status: "failed" });

  const state = getCicdPipelineRunState([newest, older], "missing-run");

  assert.equal(state.currentRun?.id, newest.id);
  assert.deepEqual(state.historyRuns.map((run) => run.id), [older.id]);
  assert.equal(state.selectedRun?.id, newest.id);
  assert.deepEqual(getCicdPipelineRunState([], null), {
    currentRun: null,
    historyRuns: [],
    selectedRun: null
  });
});

test("only non-terminal runs older than sixty seconds are stale", () => {
  const now = Date.parse("2026-07-13T03:01:00.001Z");

  assert.equal(
    isCicdPipelineRunStale(
      createPipelineRun({ status: "running", lastRefreshedAt: "2026-07-13T03:00:00.000Z" }),
      now
    ),
    true
  );
  assert.equal(
    isCicdPipelineRunStale(
      createPipelineRun({ status: "running", lastRefreshedAt: "2026-07-13T03:00:00.001Z" }),
      now
    ),
    false
  );
  assert.equal(
    isCicdPipelineRunStale(
      createPipelineRun({ status: "succeeded", lastRefreshedAt: "2026-07-13T00:00:00.000Z" }),
      now
    ),
    false
  );
});

function createPipelineRun(
  overrides: Partial<GitCicdPipelineRun> = {}
): GitCicdPipelineRun {
  return {
    id: "run-1",
    projectId: "project-1",
    sourceRepositoryId: "repository-1",
    handoffId: null,
    commitSha: "a".repeat(40),
    commitMessage: "Deploy application",
    branch: "main",
    changeScope: "app",
    status: "running",
    statusMessage: null,
    pipelineRunUrl: null,
    appUrl: null,
    apiUrl: null,
    startedAt: "2026-07-13T03:00:00.000Z",
    finishedAt: null,
    lastRefreshedAt: "2026-07-13T03:00:00.000Z",
    createdAt: "2026-07-13T03:00:00.000Z",
    stages: [],
    ...overrides
  };
}
