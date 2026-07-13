import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorkspaceStartSingleFlight } from "./workspace-start-single-flight";

test("workspace start single-flight creates and navigates only once while a request is pending", async () => {
  let releaseFirstStart: (() => void) | undefined;
  const firstStartPending = new Promise<void>((resolve) => {
    releaseFirstStart = resolve;
  });
  const singleFlight = createWorkspaceStartSingleFlight();
  let createCount = 0;
  let navigationCount = 0;

  const firstRun = singleFlight.run(async () => {
    createCount += 1;
    await firstStartPending;
    navigationCount += 1;
    return "opened";
  });
  const duplicateRun = await singleFlight.run(async () => {
    createCount += 1;
    navigationCount += 1;
    return "duplicate";
  });

  assert.deepEqual(duplicateRun, { status: "ignored" });
  assert.equal(singleFlight.isRunning(), true);
  assert.equal(createCount, 1);
  assert.equal(navigationCount, 0);

  releaseFirstStart?.();

  assert.deepEqual(await firstRun, { status: "completed", value: "opened" });
  assert.equal(singleFlight.isRunning(), false);
  assert.equal(createCount, 1);
  assert.equal(navigationCount, 1);
});

test("workspace start single-flight unlocks after a failed request", async () => {
  const singleFlight = createWorkspaceStartSingleFlight();

  await assert.rejects(
    singleFlight.run(async () => {
      throw new Error("create failed");
    }),
    /create failed/
  );

  assert.equal(singleFlight.isRunning(), false);
  assert.deepEqual(await singleFlight.run(async () => "retried"), {
    status: "completed",
    value: "retried"
  });
});
