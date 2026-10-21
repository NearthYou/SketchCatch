import assert from "node:assert/strict";
import test from "node:test";
import type { LiveObservationV2Snapshot } from "@sketchcatch/types";
import { createLiveObservationTelemetryModel } from "./live-observation-telemetry";

test("keeps immediate Store telemetry visible while provider metrics are unavailable", () => {
  const model = createLiveObservationTelemetryModel({
    aiState: "loading",
    architecture: null,
    snapshot: snapshot({ state: "unavailable" })
  });

  assert.deepEqual(model, {
    acceptedEventCount: 37,
    actualTaskCount: null,
    aiState: "loading",
    expectedTaskCount: null,
    pressureLevel: "high",
    pressurePercent: 78,
    projectedRequestsPerMinute: 468,
    providerState: "unavailable",
    rollingRequestsPerSecond: 7.8,
    sessionStatus: "active"
  });
});

test("preserves terminal session status alongside the final provider payload", () => {
  const value = snapshot({ state: "available" });
  value.status = "stopped";
  value.terminalAt = "2026-07-23T00:01:00.000Z";

  const model = createLiveObservationTelemetryModel({
    aiState: "ready",
    architecture: null,
    snapshot: value
  });

  assert.equal(model.providerState, "available");
  assert.equal(model.sessionStatus, "stopped");
});

function snapshot({
  state
}: {
  readonly state: "available" | "delayed" | "unavailable";
}): LiveObservationV2Snapshot {
  const observedAt = "2026-07-23T00:00:00.000Z";
  return {
    observationId: "observation-1",
    status: "active",
    live: {
      acceptedEventCount: 37,
      observedAt,
      pressureLevel: "high",
      pressurePercent: 78,
      projectedRequestsPerMinute: 468,
      rollingRequestsPerSecond: 7.8
    },
    latestObservation: {
      observedAt,
      payload: {
        availability: null,
        capacity: { desired: null, healthy: null, max: null, running: null },
        errorRate: null,
        logs: [],
        observedAt,
        p95LatencyMs: null,
        requests: null,
        state
      }
    },
    terminalAt: null
  };
}
