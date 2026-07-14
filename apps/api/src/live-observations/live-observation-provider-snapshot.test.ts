import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseLiveObservationProviderSnapshot
} from "./live-observation-provider-snapshot.js";
import { parseStoreObservationCommitInput } from "./live-observation-store-values.js";

const AVAILABLE = {
  requests: 120,
  errorRate: 2.5,
  p95LatencyMs: 183,
  availability: 97.5,
  capacity: { desired: 2, running: 2, healthy: 2, max: 4 },
  logs: [
    {
      timestamp: "2026-07-11T00:00:00.000Z",
      message: "request completed"
    }
  ],
  observedAt: "2026-07-11T00:00:00.000Z",
  state: "available"
} as const;

test("parses the exact provider-neutral observation snapshot contract", () => {
  assert.deepEqual(parseLiveObservationProviderSnapshot(AVAILABLE), AVAILABLE);
});

test("rejects extra fields, impossible metrics, and available snapshots without evidence", () => {
  const invalidValues = [
    { ...AVAILABLE, provider: "aws" },
    { ...AVAILABLE, errorRate: 101 },
    { ...AVAILABLE, requests: -1 },
    { ...AVAILABLE, capacity: { ...AVAILABLE.capacity, healthy: 3 } },
    { ...AVAILABLE, observedAt: null },
    { ...AVAILABLE, logs: Array.from({ length: 51 }, () => AVAILABLE.logs[0]) }
  ];

  for (const value of invalidValues) {
    assert.throws(() => parseLiveObservationProviderSnapshot(value));
  }
});

test("keeps unavailable metrics null instead of fabricating values", () => {
  const unavailable = {
    requests: null,
    errorRate: null,
    p95LatencyMs: null,
    availability: null,
    capacity: { desired: null, running: null, healthy: null, max: null },
    logs: [],
    observedAt: null,
    state: "unavailable"
  } as const;

  assert.deepEqual(parseLiveObservationProviderSnapshot(unavailable), unavailable);
  assert.deepEqual(
    parseLiveObservationProviderSnapshot({
      ...unavailable,
      observedAt: "2026-07-11T00:00:00.000Z",
      state: "delayed"
    }),
    {
      ...unavailable,
      observedAt: "2026-07-11T00:00:00.000Z",
      state: "delayed"
    }
  );
  assert.throws(() =>
    parseLiveObservationProviderSnapshot({ ...AVAILABLE, state: "delayed" })
  );
});

test("Store observation commits accept only parsed common snapshot payloads", () => {
  const input = {
    observationId: "11111111-1111-4111-8111-111111111111",
    observerId: "22222222-2222-4222-8222-222222222222",
    fencingToken: 1,
    observation: {
      observedAt: "2026-07-11T00:00:00.000Z",
      payload: AVAILABLE
    }
  };

  assert.deepEqual(parseStoreObservationCommitInput(input).observation.payload, AVAILABLE);
  assert.throws(() =>
    parseStoreObservationCommitInput({
      ...input,
      observation: { ...input.observation, payload: { sequence: 1 } }
    })
  );
});
