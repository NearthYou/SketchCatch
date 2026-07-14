import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createLiveObservationStoreContractInput,
  registerLiveObservationStoreContract
} from "./live-observation-store-contract.js";
import { createInMemoryLiveObservationStore } from "./in-memory-live-observation-store.js";

registerLiveObservationStoreContract({
  name: "in-memory LiveObservationStore",
  createHarness() {
    let currentTime = Date.parse("2026-07-11T00:00:00.000Z");

    return {
      store: createInMemoryLiveObservationStore({ now: () => currentTime }),
      setNow(value) {
        currentTime = value;
      },
      advanceBy(milliseconds) {
        currentTime += milliseconds;
      }
    };
  }
});

test("in-memory LiveObservationStore samples its clock once per operation", async () => {
  let clockCalls = 0;
  const now = Date.parse("2026-07-11T00:00:00.000Z");
  const input = createLiveObservationStoreContractInput();
  const store = createInMemoryLiveObservationStore({
    now: () => {
      clockCalls += 1;
      return now;
    }
  });

  await store.createSession(input);
  assert.equal(clockCalls, 1);
  const observer = await store.claimObserverLease({
    observationId: input.observationId,
    observerId: "11111111-1111-4111-8111-111111111111"
  });
  assert.equal(clockCalls, 2);
  assert.equal(observer.kind, "claimed");
  if (observer.kind !== "claimed") {
    assert.fail("Expected observer lease claim");
  }
  await store.commitObservation({
    observationId: input.observationId,
    observerId: "11111111-1111-4111-8111-111111111111",
    fencingToken: observer.lease.fencingToken,
    observation: {
      observedAt: new Date(now).toISOString(),
      payload: providerSnapshot(new Date(now).toISOString())
    }
  });
  assert.equal(clockCalls, 3);
  await store.readSession({ observationId: input.observationId });
  assert.equal(clockCalls, 4);
  await store.collectEvent({
    observationId: input.observationId,
    eventId: "00000000-0000-4000-8000-000000000001"
  });
  assert.equal(clockCalls, 5);
  await store.stopSession({
    observationId: input.observationId,
    deploymentId: input.manifest.provenance.deploymentId
  });
  assert.equal(clockCalls, 6);
});

function providerSnapshot(observedAt: string) {
  return {
    requests: 1,
    errorRate: 0,
    p95LatencyMs: 10,
    availability: 100,
    capacity: { desired: 1, running: 1, healthy: 1, max: 2 },
    logs: [{ timestamp: observedAt, message: "healthy" }],
    observedAt,
    state: "available" as const
  };
}
