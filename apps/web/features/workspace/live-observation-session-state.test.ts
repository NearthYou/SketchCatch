import assert from "node:assert/strict";
import test from "node:test";
import type {
  LiveObservationV2Session,
  LiveObservationV2Snapshot
} from "@sketchcatch/types";
import {
  createLiveObservationSessionState,
  readLiveObservationSessionState,
  retainLiveObservationSession,
  retainLiveObservationSnapshot
} from "./live-observation-session-state";

const session: LiveObservationV2Session = {
  audienceUrl: "https://example.com/observe/observation-1",
  createdAt: "2026-07-17T00:00:00.000Z",
  deploymentId: "deployment-1",
  expiresAt: "2026-07-17T00:10:00.000Z",
  id: "observation-1",
  status: "active"
};
const snapshot: LiveObservationV2Snapshot = {
  latestObservation: null,
  live: {
    acceptedEventCount: 1,
    observedAt: "2026-07-17T00:00:01.000Z",
    pressureLevel: "normal",
    pressurePercent: 1,
    projectedRequestsPerMinute: 6,
    rollingRequestsPerSecond: 0.1
  },
  observationId: "observation-1",
  status: "active",
  terminalAt: null
};

test("Live Observation re-entry restores the active session and latest snapshot per project", () => {
  let state = createLiveObservationSessionState("project-1");

  state = retainLiveObservationSession(state, "project-1", session);
  state = retainLiveObservationSnapshot(state, "project-1", snapshot);

  assert.deepEqual(readLiveObservationSessionState(state, "project-1"), {
    session,
    snapshot
  });
  assert.deepEqual(readLiveObservationSessionState(state, "project-2"), {
    session: null,
    snapshot: null
  });
});
