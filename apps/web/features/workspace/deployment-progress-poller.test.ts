import assert from "node:assert/strict";
import test from "node:test";
import type { DeploymentProgressSnapshot, DeploymentStatus } from "@sketchcatch/types";
import { DeploymentProgressPoller } from "./deployment-progress-poller";

test("poller ignores a late snapshot from the previous deployment", async () => {
  const first = deferred<DeploymentProgressSnapshot>();
  const second = deferred<DeploymentProgressSnapshot>();
  const requests = [first, second];
  const snapshots: string[] = [];
  const poller = new DeploymentProgressPoller({
    fetchSnapshot: async () => {
      const request = requests.shift();
      assert(request);
      return request.promise;
    },
    schedule: () => {
      throw new Error("running snapshots should not schedule before resolution");
    },
    cancelSchedule: () => undefined
  });

  poller.start(
    "deployment-a",
    (snapshot) => snapshots.push(snapshot.deploymentId),
    () => undefined
  );
  poller.start(
    "deployment-b",
    (snapshot) => snapshots.push(snapshot.deploymentId),
    () => undefined
  );
  first.resolve(createProgressSnapshot({ deploymentId: "deployment-a", status: "SUCCESS" }));
  second.resolve(createProgressSnapshot({ deploymentId: "deployment-b", status: "SUCCESS" }));
  await flushPromises();

  assert.deepEqual(snapshots, ["deployment-b"]);
});

test("poller stops scheduling after a terminal snapshot", async () => {
  const scheduled: Array<() => void> = [];
  const poller = new DeploymentProgressPoller({
    fetchSnapshot: async () => createProgressSnapshot({ status: "SUCCESS" }),
    schedule: (callback) => {
      scheduled.push(callback);
      return callback;
    },
    cancelSchedule: () => undefined
  });

  poller.start("deployment-a", () => undefined, () => undefined);
  await flushPromises();

  assert.equal(scheduled.length, 0);
});

test("poller schedules the next request only after the active request resolves", async () => {
  const request = deferred<DeploymentProgressSnapshot>();
  const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
  let fetchCount = 0;
  const poller = new DeploymentProgressPoller({
    fetchSnapshot: async () => {
      fetchCount += 1;
      return request.promise;
    },
    schedule: (callback, delayMs) => {
      scheduled.push({ callback, delayMs });
      return callback;
    },
    cancelSchedule: () => undefined
  });

  poller.start("deployment-a", () => undefined, () => undefined);
  await flushPromises();
  assert.equal(fetchCount, 1);
  assert.equal(scheduled.length, 0);

  request.resolve(createProgressSnapshot({ status: "RUNNING" }));
  await flushPromises();

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0]?.delayMs, 1_000);
});

test("poller retries a transient error without exposing an aborted request", async () => {
  const errors: string[] = [];
  const scheduled: Array<() => void> = [];
  const poller = new DeploymentProgressPoller({
    fetchSnapshot: async () => {
      throw new Error("temporary progress failure");
    },
    schedule: (callback) => {
      scheduled.push(callback);
      return callback;
    },
    cancelSchedule: () => undefined
  });

  poller.start(
    "deployment-a",
    () => undefined,
    (error) => errors.push(error instanceof Error ? error.message : String(error))
  );
  await flushPromises();

  assert.deepEqual(errors, ["temporary progress failure"]);
  assert.equal(scheduled.length, 1);
});

test("stopping the poller aborts the in-flight request", async () => {
  let capturedSignal: AbortSignal | undefined;
  const request = deferred<DeploymentProgressSnapshot>();
  const poller = new DeploymentProgressPoller({
    fetchSnapshot: async (_deploymentId, signal) => {
      capturedSignal = signal;
      return request.promise;
    }
  });

  poller.start("deployment-a", () => undefined, () => undefined);
  poller.stop();

  assert.equal(capturedSignal?.aborted, true);
  request.resolve(createProgressSnapshot({ status: "SUCCESS" }));
  await flushPromises();
});

function createProgressSnapshot(
  overrides: Partial<DeploymentProgressSnapshot> & { status?: DeploymentStatus } = {}
): DeploymentProgressSnapshot {
  return {
    activeStage: null,
    deploymentId: "deployment-a",
    failureStage: null,
    measurement: { kind: "indeterminate" },
    status: "PENDING",
    updatedAt: "2026-07-20T10:00:00.000Z",
    ...overrides
  };
}

function deferred<T>() {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    reject: rejectPromise,
    resolve: resolvePromise
  };
}

async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}
