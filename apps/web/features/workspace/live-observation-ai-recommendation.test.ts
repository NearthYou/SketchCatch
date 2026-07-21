import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureJson, LiveObservationV2Snapshot } from "@sketchcatch/types";

import { createLiveObservationDesignSimulationRequest } from "./live-observation-ai-recommendation";

const architecture: ArchitectureJson = { edges: [], nodes: [] };

test("builds an AI simulation request from elevated live traffic", () => {
  const request = createLiveObservationDesignSimulationRequest(architecture, snapshot("high"));

  assert.deepEqual(request?.liveObservation, {
    acceptedEventCount: 7,
    pressureLevel: "high",
    pressurePercent: 70,
    projectedRequestsPerMinute: 42
  });
  assert.equal(request?.architectureJson, architecture);
});

test("does not request an AI improvement while live traffic is normal", () => {
  assert.equal(
    createLiveObservationDesignSimulationRequest(architecture, snapshot("normal")),
    null
  );
});

function snapshot(
  pressureLevel: LiveObservationV2Snapshot["live"]["pressureLevel"]
): LiveObservationV2Snapshot {
  return {
    observationId: "00000000-0000-4000-8000-000000000001",
    status: "active",
    live: {
      acceptedEventCount: 7,
      rollingRequestsPerSecond: 0.7,
      projectedRequestsPerMinute: 42,
      pressurePercent: 70,
      pressureLevel,
      observedAt: "2026-07-21T00:00:00.000Z"
    },
    latestObservation: null,
    terminalAt: null
  };
}
