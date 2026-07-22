import assert from "node:assert/strict";
import { test } from "node:test";
import { LiveObservationStoreUnavailableError } from "./live-observation-store.js";
import {
  createRedisLiveObservationStore,
  type RedisLiveObservationStoreClient
} from "./redis-live-observation-store.js";

const OBSERVATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVALUATED_AT_MS = Date.parse("2026-07-22T00:00:00.000Z");

test("replaces an open Redis client after a command failure", async () => {
  let clientFactoryCalls = 0;
  let destroyedClients = 0;
  const clients: RedisLiveObservationStoreClient[] = [
    {
      isOpen: true,
      connect: async () => undefined,
      destroy: () => {
        destroyedClients += 1;
      },
      eval: async () => {
        throw new Error("transient connection failure");
      }
    },
    {
      isOpen: true,
      connect: async () => undefined,
      eval: async () => ["1", "not_found", String(EVALUATED_AT_MS)]
    }
  ];
  const store = createRedisLiveObservationStore({
    createClient: () => {
      const nextClient = clients[clientFactoryCalls];
      clientFactoryCalls += 1;
      assert.ok(nextClient, "unexpected Redis client creation");
      return nextClient;
    },
    keyNamespace: "unit_reconnect",
    redisUrl: "redis://localhost:6379"
  });

  await assert.rejects(
    store.readSession({ observationId: OBSERVATION_ID }),
    LiveObservationStoreUnavailableError
  );

  const recovered = await store.readSession({ observationId: OBSERVATION_ID });
  assert.equal(recovered.kind, "not_found");
  assert.equal(clientFactoryCalls, 2);
  assert.equal(destroyedClients, 1);
});
