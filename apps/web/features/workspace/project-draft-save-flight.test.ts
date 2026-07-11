import { test } from "node:test";
import assert from "node:assert/strict";
import { runProjectDraftServerSaveFlight } from "./project-draft-save-flight";

test("runProjectDraftServerSaveFlight reuses the in-flight save promise", async () => {
  const flightRef: { current: Promise<string> | null } = { current: null };
  let releaseFirstSave: (value: string) => void = () => assert.fail("first save resolver was not captured");
  let saveCallCount = 0;

  const firstSave = runProjectDraftServerSaveFlight(flightRef, async () => {
    saveCallCount += 1;
    return new Promise<string>((resolve) => {
      releaseFirstSave = resolve;
    });
  });
  const duplicateSave = runProjectDraftServerSaveFlight(flightRef, async () => {
    saveCallCount += 1;
    return "duplicate";
  });

  assert.equal(duplicateSave, firstSave);
  assert.equal(saveCallCount, 1);

  releaseFirstSave("saved");

  assert.equal(await firstSave, "saved");
  assert.equal(await duplicateSave, "saved");
  assert.equal(flightRef.current, null);

  const nextSave = await runProjectDraftServerSaveFlight(flightRef, async () => {
    saveCallCount += 1;
    return "next";
  });

  assert.equal(nextSave, "next");
  assert.equal(saveCallCount, 2);
});

test("runProjectDraftServerSaveFlight clears the in-flight save after failure", async () => {
  const flightRef: { current: Promise<string> | null } = { current: null };
  const failure = new Error("server save failed");

  await assert.rejects(
    runProjectDraftServerSaveFlight(flightRef, async () => {
      throw failure;
    }),
    failure
  );

  assert.equal(flightRef.current, null);

  const retry = await runProjectDraftServerSaveFlight(flightRef, async () => "retry");

  assert.equal(retry, "retry");
});

test("runProjectDraftServerSaveFlight queues a follow-up save when the in-flight save becomes stale", async () => {
  const flightRef: { current: Promise<string> | null } = { current: null };
  let dirty = false;
  let saveCallCount = 0;
  let releaseFirstSave: (value: string) => void = () => assert.fail("first save resolver was not captured");

  const firstSave = runProjectDraftServerSaveFlight(flightRef, async () => {
    saveCallCount += 1;

    if (saveCallCount === 1) {
      return new Promise<string>((resolve) => {
        releaseFirstSave = resolve;
      });
    }

    dirty = false;
    return "second";
  });
  const queuedSave = runProjectDraftServerSaveFlight(
    flightRef,
    async () => {
      saveCallCount += 1;
      dirty = false;
      return "second";
    },
    {
      shouldRunAgainAfterInFlight: () => dirty
    }
  );

  dirty = true;
  releaseFirstSave("first");

  assert.equal(await firstSave, "first");
  assert.equal(await queuedSave, "second");
  assert.equal(saveCallCount, 2);
  assert.equal(dirty, false);
  assert.equal(flightRef.current, null);
});
