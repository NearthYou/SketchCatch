import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createProjectBoardThumbnailLifecycle,
  type ProjectBoardThumbnailLifecycleState
} from "./project-board-thumbnail-lifecycle";

const projectId = "11111111-1111-4111-8111-111111111111";

test("initial server revision waits for Board readiness and backfills a missing thumbnail", async () => {
  const boardElement = {} as HTMLElement;
  const states: ProjectBoardThumbnailLifecycleState[] = [];
  const calls: string[] = [];
  const lifecycle = createProjectBoardThumbnailLifecycle({
    projectId,
    fetchProjectThumbnail: async (receivedProjectId) => {
      assert.equal(receivedProjectId, projectId);
      calls.push("check");
      return null;
    },
    captureAndUpload: async (input) => {
      calls.push("capture");
      assert.equal(input.projectId, projectId);
      assert.equal(input.revision, 7);
      assert.equal(input.element, boardElement);
      return { status: "uploaded", assetId: "asset-1" };
    },
    onStateChange: (state) => states.push(state)
  });

  const initialCapture = lifecycle.requestInitialServerRevision(7);
  await flushMicrotasks();
  assert.deepEqual(calls, []);

  lifecycle.setBoardElement(boardElement);
  await initialCapture;

  assert.deepEqual(calls, ["check", "capture"]);
  assert.deepEqual(states, ["checking", "capturing", "ready"]);
  assert.equal(lifecycle.getState(), "ready");
});

test("initial server revision keeps an existing thumbnail without capturing", async () => {
  const states: ProjectBoardThumbnailLifecycleState[] = [];
  const lifecycle = createProjectBoardThumbnailLifecycle({
    projectId,
    fetchProjectThumbnail: async () => new Blob(["existing"], { type: "image/webp" }),
    captureAndUpload: async () => assert.fail("an existing thumbnail must not be replaced"),
    onStateChange: (state) => states.push(state)
  });
  lifecycle.setBoardElement({} as HTMLElement);

  await lifecycle.requestInitialServerRevision(4);

  assert.deepEqual(states, ["checking", "ready"]);
});

test("freshly saved revision skips the existence check and remains awaited through capture", async () => {
  const captureGate = createDeferred<void>();
  let settled = false;
  let checkCount = 0;
  const lifecycle = createProjectBoardThumbnailLifecycle({
    projectId,
    fetchProjectThumbnail: async () => {
      checkCount += 1;
      return null;
    },
    captureAndUpload: async () => {
      await captureGate.promise;
      return { status: "uploaded", assetId: "asset-2" };
    }
  });
  lifecycle.setBoardElement({} as HTMLElement);

  const capture = lifecycle.requestSavedRevision(8).then(() => {
    settled = true;
  });
  await flushMicrotasks();

  assert.equal(lifecycle.getState(), "capturing");
  assert.equal(settled, false);
  assert.equal(checkCount, 0);

  captureGate.resolve();
  await capture;
  assert.equal(settled, true);
  assert.equal(lifecycle.getState(), "ready");
});

test("same saved revision coalesces into one capture and resolves every awaiter", async () => {
  const captureGate = createDeferred<void>();
  let captureCount = 0;
  const lifecycle = createProjectBoardThumbnailLifecycle({
    projectId,
    fetchProjectThumbnail: async () => assert.fail("fresh saves must not check"),
    captureAndUpload: async () => {
      captureCount += 1;
      await captureGate.promise;
      return { status: "uploaded", assetId: "asset-3" };
    }
  });
  lifecycle.setBoardElement({} as HTMLElement);

  const first = lifecycle.requestSavedRevision(9);
  const second = lifecycle.requestSavedRevision(9);
  await flushMicrotasks();
  assert.equal(captureCount, 1);

  captureGate.resolve();
  await Promise.all([first, second]);
  assert.equal(captureCount, 1);
});

test("newer revisions keep only the latest trailing capture and latest Board element", async () => {
  const firstElement = { id: "first" } as unknown as HTMLElement;
  const latestElement = { id: "latest" } as unknown as HTMLElement;
  const firstCaptureGate = createDeferred<void>();
  const trailingCaptureGate = createDeferred<void>();
  const captureInputs: Array<{ element: HTMLElement; revision: number }> = [];
  const states: ProjectBoardThumbnailLifecycleState[] = [];
  const lifecycle = createProjectBoardThumbnailLifecycle({
    projectId,
    fetchProjectThumbnail: async () => assert.fail("fresh saves must not check"),
    captureAndUpload: async ({ element, revision }) => {
      captureInputs.push({ element, revision });

      if (revision === 10) {
        await firstCaptureGate.promise;
      } else {
        await trailingCaptureGate.promise;
      }

      return { status: "uploaded", assetId: `asset-${revision}` };
    },
    onStateChange: (state) => states.push(state)
  });
  lifecycle.setBoardElement(firstElement);

  const first = lifecycle.requestSavedRevision(10);
  await flushMicrotasks();
  const superseded = lifecycle.requestSavedRevision(11);
  lifecycle.setBoardElement(latestElement);
  const latest = lifecycle.requestSavedRevision(12);
  firstCaptureGate.resolve();
  await first;
  await flushMicrotasks();

  assert.deepEqual(captureInputs, [
    { element: firstElement, revision: 10 },
    { element: latestElement, revision: 12 }
  ]);
  assert.equal(states.includes("ready"), false);

  trailingCaptureGate.resolve();
  await Promise.all([superseded, latest]);
  assert.equal(lifecycle.getState(), "ready");
});

test("a skipped canonical capture fails visibly and retry repeats the failed revision", async () => {
  const disconnectedElement = { isConnected: false } as HTMLElement;
  const states: ProjectBoardThumbnailLifecycleState[] = [];
  const revisions: number[] = [];
  let attempt = 0;
  const lifecycle = createProjectBoardThumbnailLifecycle({
    projectId,
    fetchProjectThumbnail: async () => assert.fail("fresh saves must not check"),
    captureAndUpload: async ({ revision }) => {
      attempt += 1;
      revisions.push(revision);
      return attempt === 1
        ? { status: "skipped" }
        : { status: "uploaded", assetId: "asset-retry" };
    },
    onStateChange: (state) => states.push(state)
  });
  lifecycle.setBoardElement(disconnectedElement);

  await assert.rejects(lifecycle.requestSavedRevision(13), /Board.*unavailable/i);
  assert.equal(lifecycle.getState(), "failed");

  await lifecycle.retry();
  assert.deepEqual(revisions, [13, 13]);
  assert.deepEqual(states, ["capturing", "failed", "capturing", "ready"]);
});

test("dispose rejects pending awaiters and ignores stale capture completion state", async () => {
  const captureGate = createDeferred<void>();
  const states: ProjectBoardThumbnailLifecycleState[] = [];
  const lifecycle = createProjectBoardThumbnailLifecycle({
    projectId,
    fetchProjectThumbnail: async () => assert.fail("fresh saves must not check"),
    captureAndUpload: async () => {
      await captureGate.promise;
      return { status: "uploaded", assetId: "asset-disposed" };
    },
    onStateChange: (state) => states.push(state)
  });
  lifecycle.setBoardElement({} as HTMLElement);

  const capture = lifecycle.requestSavedRevision(14);
  await flushMicrotasks();
  lifecycle.dispose();

  await assert.rejects(capture, /disposed/i);
  captureGate.resolve();
  await flushMicrotasks();
  assert.deepEqual(states, ["capturing"]);
  await assert.rejects(lifecycle.retry(), /disposed/i);
});

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
