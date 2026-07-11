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
      payload: { state: "available" }
    }
  });
  assert.equal(clockCalls, 3);
  await store.acquirePresenterBoostLease({
    observationId: input.observationId,
    leaseId: "33333333-3333-4333-8333-333333333333"
  });
  assert.equal(clockCalls, 4);
  await store.renewPresenterBoostLease({
    observationId: input.observationId,
    leaseId: "33333333-3333-4333-8333-333333333333"
  });
  assert.equal(clockCalls, 5);
  await store.releasePresenterBoostLease({
    observationId: input.observationId,
    leaseId: "33333333-3333-4333-8333-333333333333"
  });
  assert.equal(clockCalls, 6);
  await store.readSession({ observationId: input.observationId });
  assert.equal(clockCalls, 7);
  await store.collectEvent({
    observationId: input.observationId,
    eventId: "00000000-0000-4000-8000-000000000001"
  });
  assert.equal(clockCalls, 8);
  await store.stopSession({
    observationId: input.observationId,
    deploymentId: input.manifest.provenance.deploymentId
  });
  assert.equal(clockCalls, 9);
});
