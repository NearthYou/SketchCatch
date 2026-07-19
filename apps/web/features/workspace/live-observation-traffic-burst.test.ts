import assert from "node:assert/strict";
import test from "node:test";
import type { LiveObservationV2Snapshot } from "@sketchcatch/types";

import {
  getLiveObservationTrafficBurst,
  getLiveObservationTrafficCursor
} from "./live-observation.js";

test("starts a focused-flow burst when the public request counter increases", () => {
  const previous = snapshot({ acceptedEventCount: 2, observedAt: "2026-07-19T01:00:00.000Z" });
  const next = snapshot({ acceptedEventCount: 5, observedAt: "2026-07-19T01:00:00.000Z" });

  assert.deepEqual(
    getLiveObservationTrafficBurst(getLiveObservationTrafficCursor(previous), next),
    { overflowCount: 0, visibleParticleCount: 3 }
  );
});

test("starts a focused-flow burst from a fresh CloudWatch request observation", () => {
  const previous = snapshot({ requests: 0, observedAt: "2026-07-19T01:00:00.000Z" });
  const next = snapshot({ requests: 9, observedAt: "2026-07-19T01:01:00.000Z" });

  assert.deepEqual(
    getLiveObservationTrafficBurst(getLiveObservationTrafficCursor(previous), next),
    { overflowCount: 4, visibleParticleCount: 5 }
  );
});

test("bounds hundreds of requests to five representative particles", () => {
  const previous = snapshot({ acceptedEventCount: 0, observedAt: "2026-07-19T01:00:00.000Z" });
  const next = snapshot({ acceptedEventCount: 250, observedAt: "2026-07-19T01:00:01.000Z" });

  assert.deepEqual(
    getLiveObservationTrafficBurst(getLiveObservationTrafficCursor(previous), next),
    { overflowCount: 245, visibleParticleCount: 5 }
  );
});

test("does not replay the same provider observation or target a missing running task", () => {
  const previous = snapshot({ requests: 9, observedAt: "2026-07-19T01:01:00.000Z" });
  const sameObservation = snapshot({ requests: 9, observedAt: "2026-07-19T01:01:00.000Z" });
  const noRunningTask = snapshot({
    acceptedEventCount: 2,
    observedAt: "2026-07-19T01:02:00.000Z",
    running: 0
  });

  assert.equal(
    getLiveObservationTrafficBurst(getLiveObservationTrafficCursor(previous), sameObservation),
    null
  );
  assert.equal(
    getLiveObservationTrafficBurst(getLiveObservationTrafficCursor(previous), noRunningTask),
    null
  );
});

function snapshot({
  acceptedEventCount = 1,
  observedAt,
  requests = 0,
  running = 1
}: {
  readonly acceptedEventCount?: number;
  readonly observedAt: string;
  readonly requests?: number;
  readonly running?: number;
}): LiveObservationV2Snapshot {
  return {
    observationId: "observation-1",
    status: "active",
    live: {
      acceptedEventCount,
      observedAt,
      pressureLevel: "normal",
      pressurePercent: 10,
      projectedRequestsPerMinute: 6,
      rollingRequestsPerSecond: 0.1
    },
    latestObservation: {
      observedAt,
      payload: {
        availability: 100,
        capacity: { desired: running, healthy: running, max: 4, running },
        errorRate: 0,
        logs: [],
        observedAt,
        p95LatencyMs: 20,
        requests,
        state: "available"
      }
    },
    terminalAt: null
  };
}
