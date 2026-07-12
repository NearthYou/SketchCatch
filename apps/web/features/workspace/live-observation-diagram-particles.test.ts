import assert from "node:assert/strict";
import test from "node:test";
import {
  LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS,
  getLiveObservationDiagramBurstLifetimeMs,
  getLiveObservationDiagramParticleDelayMs
} from "./live-observation-diagram-particles";

test("one logical request occupies only one connector segment at a time", () => {
  const firstStart = getLiveObservationDiagramParticleDelayMs(0, 0);
  const secondStart = getLiveObservationDiagramParticleDelayMs(1, 0);
  const thirdStart = getLiveObservationDiagramParticleDelayMs(2, 0);

  assert.equal(firstStart, 0);
  assert.equal(secondStart, LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS);
  assert.equal(thirdStart, LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS * 2);
  assert.ok(firstStart + LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS <= secondStart);
  assert.ok(secondStart + LIVE_OBSERVATION_DIAGRAM_SEGMENT_DURATION_MS <= thirdStart);
});

test("separate requests keep a short readable stagger", () => {
  assert.equal(getLiveObservationDiagramParticleDelayMs(0, 0), 0);
  assert.equal(getLiveObservationDiagramParticleDelayMs(0, 1), 180);
  assert.equal(getLiveObservationDiagramParticleDelayMs(2, 1), 1_300);
});

test("burst lifetime includes the final segment and final request", () => {
  assert.equal(getLiveObservationDiagramBurstLifetimeMs(0, 4), 0);
  assert.equal(getLiveObservationDiagramBurstLifetimeMs(5, 0), 0);
  assert.equal(getLiveObservationDiagramBurstLifetimeMs(5, 1), 3_040);
  assert.equal(getLiveObservationDiagramBurstLifetimeMs(5, 4), 3_580);
});
