import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearMockRequestFlowBurst,
  createInitialMockRequestFlowState,
  getMockRequestFlowTargetIndexes,
  replayMockRequestFlow
} from "./live-observation-mock-preview";

test("mock replay turns the local 100 to 108 delta into five particles and a +3 overflow", () => {
  const replayed = replayMockRequestFlow(createInitialMockRequestFlowState());

  assert.deepEqual(replayed.burst, {
    overflowCount: 3,
    sequence: 1,
    visibleParticleCount: 5
  });
  assert.equal(replayed.visible, true);
});

test("mock replay alternates its five particles across two targets", () => {
  const replayed = replayMockRequestFlow(createInitialMockRequestFlowState());

  assert.deepEqual(getMockRequestFlowTargetIndexes(replayed.burst), [0, 1, 0, 1, 0]);
});

test("each mock replay advances the burst sequence", () => {
  const firstReplay = replayMockRequestFlow(createInitialMockRequestFlowState());
  const secondReplay = replayMockRequestFlow(firstReplay);

  assert.equal(firstReplay.sequence, 1);
  assert.equal(secondReplay.sequence, 2);
  assert.equal(secondReplay.burst?.sequence, 2);
});

test("mock cleanup ignores an older sequence and clears only the matching burst", () => {
  const firstReplay = replayMockRequestFlow(createInitialMockRequestFlowState());
  const secondReplay = replayMockRequestFlow(firstReplay);
  const afterStaleCleanup = clearMockRequestFlowBurst(
    secondReplay,
    firstReplay.burst?.sequence ?? 0
  );
  const afterMatchingCleanup = clearMockRequestFlowBurst(
    afterStaleCleanup,
    secondReplay.burst?.sequence ?? 0
  );

  assert.strictEqual(afterStaleCleanup, secondReplay);
  assert.equal(afterMatchingCleanup.burst, null);
  assert.equal(afterMatchingCleanup.visible, true);
  assert.equal(afterMatchingCleanup.sequence, 2);
});
