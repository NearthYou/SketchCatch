import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { createClient } from "redis";
import {
  createLiveObservationStoreContractInput,
  registerLiveObservationStoreContract
} from "./live-observation-store-contract.js";
import { LiveObservationStoreUnavailableError } from "./live-observation-store.js";
import {
  createRedisLiveObservationStore,
  createRedisLiveObservationStoreKeys,
  type RedisLiveObservationStoreClient
} from "./redis-live-observation-store.js";
import { createRedisLiveObservationStoreForTest } from "./redis-live-observation-store-test-support.js";

const configuredRedisUrl = process.env.LIVE_OBSERVATION_REDIS_TEST_URL;
const START_MS = Date.parse("2026-07-11T00:00:00.000Z");
const SECOND_OBSERVATION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FIRST_OBSERVER_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_OBSERVER_ID = "22222222-2222-4222-8222-222222222222";

if (!configuredRedisUrl) {
  throw new Error("LIVE_OBSERVATION_REDIS_TEST_URL is required");
}
const redisUrl: string = configuredRedisUrl;

function createConfiguredClient(url: string) {
  return createClient({
    disableOfflineQueue: true,
    socket: { reconnectStrategy: false },
    url
  });
}

type NodeRedisClient = ReturnType<typeof createConfiguredClient>;

const exactCleanupKeys = new Set<string>();
const ownedClients = new Set<NodeRedisClient>();
let adminClient: NodeRedisClient | undefined;

function namespace(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function ownClient(): NodeRedisClient {
  const client = createConfiguredClient(redisUrl);
  client.on("error", () => undefined);
  ownedClients.add(client);
  return client;
}

function asTrackedStoreClient(client: NodeRedisClient): RedisLiveObservationStoreClient {
  let connecting: Promise<unknown> | undefined;
  return {
    get isOpen() {
      return client.isOpen;
    },
    connect: async () => {
      if (client.isOpen) return client;
      connecting ??= client.connect();
      try {
        return await connecting;
      } finally {
        connecting = undefined;
      }
    },
    eval: (script, options) => {
      for (const key of options.keys) exactCleanupKeys.add(key);
      return client.eval(script, {
        arguments: [...options.arguments],
        keys: [...options.keys]
      });
    },
    on: () => undefined
  };
}

function storeClientFactory(): {
  client: NodeRedisClient;
  seam: RedisLiveObservationStoreClient;
} {
  const client = ownClient();
  return { client, seam: asTrackedStoreClient(client) };
}

async function admin(): Promise<NodeRedisClient> {
  if (!adminClient) adminClient = ownClient();
  if (!adminClient.isOpen) await adminClient.connect();
  return adminClient;
}

async function redisTimeMs(client: NodeRedisClient): Promise<number> {
  const reply = await client.sendCommand(["TIME"]);
  assert.ok(Array.isArray(reply));
  const seconds = Number(reply[0]);
  const microseconds = Number(reply[1]);
  assert.equal(Number.isSafeInteger(seconds), true);
  assert.equal(Number.isSafeInteger(microseconds), true);
  return seconds * 1_000 + Math.floor(microseconds / 1_000);
}

async function pexpiretime(client: NodeRedisClient, key: string): Promise<number> {
  return Number(await client.sendCommand(["PEXPIRETIME", key]));
}

after(async () => {
  try {
    const cleanup = await admin();
    const keys = [...exactCleanupKeys];
    for (let offset = 0; offset < keys.length; offset += 100) {
      await cleanup.del(keys.slice(offset, offset + 100));
    }
  } finally {
    await Promise.allSettled(
      [...ownedClients].map(async (client) => {
        if (client.isOpen) await client.close();
      })
    );
  }
});

const contractClient = ownClient();
const contractSeam = asTrackedStoreClient(contractClient);

registerLiveObservationStoreContract({
  name: "Redis 8 LiveObservationStore",
  createHarness() {
    let currentTime = START_MS;
    return {
      store: createRedisLiveObservationStoreForTest({
        createClient: () => contractSeam,
        keyNamespace: namespace("contract"),
        now: () => currentTime,
        redisUrl
      }),
      setNow(value) {
        currentTime = value;
      },
      advanceBy(milliseconds) {
        currentTime += milliseconds;
      }
    };
  }
});

test("dedicated integration requires Redis server major version 8", async () => {
  const info = await (await admin()).info("server");
  const match = /^redis_version:(\d+)\./m.exec(info);
  assert.ok(match, "Redis INFO must expose redis_version");
  assert.equal(match[1], "8");
});


test("reads a session whose manifest includes the audience application URL", async () => {
  const keyNamespace = namespace("audience_application_url");
  const { seam } = storeClientFactory();
  const store = createRedisLiveObservationStoreForTest({
    createClient: () => seam,
    keyNamespace,
    now: () => START_MS,
    redisUrl
  });
  const input = createLiveObservationStoreContractInput();
  input.manifest.endpoints.audienceApplicationUrl = "https://application.example.com";

  assert.equal((await store.createSession(input)).kind, "created");
  const read = await store.readSession({ observationId: input.observationId });

  assert.equal(read.kind, "active");
  if (read.kind !== "active") assert.fail("Expected active session");
  assert.equal(
    read.session.manifest.endpoints.audienceApplicationUrl,
    "https://application.example.com"
  );
});
test("production store uses Redis TIME and exact absolute active expiries", async () => {
  const keyNamespace = namespace("production_ttl");
  const { seam } = storeClientFactory();
  const store = createRedisLiveObservationStore({
    createClient: () => seam,
    keyNamespace,
    redisUrl
  });
  const input = createLiveObservationStoreContractInput();
  const keys = createRedisLiveObservationStoreKeys(keyNamespace, input.observationId);
  const redis = await admin();
  const before = await redisTimeMs(redis);
  const created = await store.createSession(input);
  const afterCreate = await redisTimeMs(redis);
  assert.equal(created.kind, "created");
  if (created.kind !== "created") assert.fail("Expected created");
  const evaluatedAtMs = Date.parse(created.evaluatedAt);
  assert.ok(evaluatedAtMs >= before && evaluatedAtMs <= afterCreate);

  const expiresAtMs = Date.parse(created.session.expiresAt);
  const claimKey = keys.deployment(input.manifest.provenance.deploymentId);
  const expectedExpiries = [expiresAtMs, expiresAtMs, expiresAtMs + 60_000];
  const actualExpiries = await Promise.all([
    pexpiretime(redis, keys.session),
    pexpiretime(redis, claimKey),
    pexpiretime(redis, keys.terminal)
  ]);
  assert.deepEqual(actualExpiries, expectedExpiries);

  assert.equal((await store.readSession({ observationId: input.observationId })).kind, "active");
  assert.equal(
    (
      await store.collectEvent({
        eventId: "00000000-0000-4000-8000-000000000001",
        observationId: input.observationId
      })
    ).kind,
    "accepted"
  );
  const observer = await store.claimObserverLease({
    observationId: input.observationId,
    observerId: FIRST_OBSERVER_ID
  });
  assert.equal(observer.kind, "claimed");
  if (observer.kind !== "claimed") assert.fail("Expected observer claim");
  assert.equal(
    (
      await store.commitObservation({
        fencingToken: observer.lease.fencingToken,
        observation: {
          observedAt: new Date(evaluatedAtMs).toISOString(),
          payload: providerSnapshot(new Date(evaluatedAtMs).toISOString(), "available")
        },
        observationId: input.observationId,
        observerId: FIRST_OBSERVER_ID
      })
    ).kind,
    "committed"
  );
  assert.deepEqual(
    await Promise.all([
      pexpiretime(redis, keys.session),
      pexpiretime(redis, claimKey),
      pexpiretime(redis, keys.terminal)
    ]),
    expectedExpiries
  );
});

test("two clients serialize every contested transition", async () => {
  const keyNamespace = namespace("concurrency");
  const first = storeClientFactory();
  const second = storeClientFactory();
  const firstStore = createRedisLiveObservationStore({
    createClient: () => first.seam,
    keyNamespace,
    redisUrl
  });
  const secondStore = createRedisLiveObservationStore({
    createClient: () => second.seam,
    keyNamespace,
    redisUrl
  });
  const firstInput = createLiveObservationStoreContractInput();
  const secondInput = structuredClone(firstInput);
  secondInput.observationId = SECOND_OBSERVATION_ID;
  const creates = await Promise.all([
    firstStore.createSession(firstInput),
    secondStore.createSession(secondInput)
  ]);
  assert.deepEqual(creates.map((result) => result.kind).sort(), ["active_exists", "created"]);
  const active = creates.find((result) => result.kind === "created");
  assert.ok(active && active.kind === "created");
  const observationId = active.session.observationId;

  const eventId = "00000000-0000-4000-8000-000000000001";
  const events = await Promise.all([
    firstStore.collectEvent({ eventId, observationId }),
    secondStore.collectEvent({ eventId, observationId })
  ]);
  assert.deepEqual(events.map((result) => result.kind).sort(), ["accepted", "duplicate"]);
  const read = await firstStore.readSession({ observationId });
  assert.equal(read.kind, "active");
  if (read.kind === "active") assert.equal(read.session.live.acceptedEventCount, 1);

  const observers = await Promise.all([
    firstStore.claimObserverLease({ observationId, observerId: FIRST_OBSERVER_ID }),
    secondStore.claimObserverLease({ observationId, observerId: SECOND_OBSERVER_ID })
  ]);
  assert.deepEqual(observers.map((result) => result.kind).sort(), ["claimed", "contended"]);
  const claimedIndex = observers.findIndex((result) => result.kind === "claimed");
  const claimed = observers[claimedIndex];
  assert.ok(claimed && claimed.kind === "claimed");
  const observerId = claimedIndex === 0 ? FIRST_OBSERVER_ID : SECOND_OBSERVER_ID;

  const serializedSnapshot = providerSnapshot(claimed.evaluatedAt, "serialized");
  const [commit, stop] = await Promise.all([
    firstStore.commitObservation({
      fencingToken: claimed.lease.fencingToken,
      observation: {
        observedAt: claimed.evaluatedAt,
        payload: serializedSnapshot
      },
      observationId,
      observerId
    }),
    secondStore.stopSession({
      deploymentId: firstInput.manifest.provenance.deploymentId,
      observationId
    })
  ]);
  assert.equal(stop.kind, "stopped");
  assert.ok(commit.kind === "committed" || commit.kind === "gone");
  if (stop.kind === "stopped") {
    assert.deepEqual(
      stop.session.finalObservation?.payload ?? null,
      commit.kind === "committed" ? serializedSnapshot : null
    );
  }
});

test("stop retains only a sixty-second minimal terminal and logical purge is exact", async () => {
  const keyNamespace = namespace("stop_terminal");
  let now = START_MS;
  const { seam } = storeClientFactory();
  const store = createRedisLiveObservationStoreForTest({
    createClient: () => seam,
    keyNamespace,
    now: () => now,
    redisUrl
  });
  const input = createLiveObservationStoreContractInput();
  const keys = createRedisLiveObservationStoreKeys(keyNamespace, input.observationId);
  const claimKey = keys.deployment(input.manifest.provenance.deploymentId);
  const redis = await admin();
  assert.equal((await store.createSession(input)).kind, "created");

  const activeFields = await redis.hGetAll(keys.session);
  assert.equal(activeFields.observationId, input.observationId);
  assert.deepEqual(Object.keys(activeFields).sort(), [
    "acceptedEventCount",
    "capabilityKid",
    "codecVersion",
    "createdAtMs",
    "deploymentId",
    "expiresAtMs",
    "latestObservationJson",
    "latestObservationJsonSha1",
    "latestObservedAtMs",
    "manifestJson",
    "manifestJsonSha1",
    "observationId",
    "observerFencingToken",
    "pressureTarget",
    "tokenVersion"
  ]);
  assert.equal(JSON.stringify(activeFields).includes("reviewer-probe-token"), false);
  assert.equal(JSON.stringify(activeFields).includes("Authorization"), false);
  const shadow = await redis.hGetAll(keys.terminal);
  assert.deepEqual(Object.keys(shadow).sort(), terminalFieldNames());
  assert.equal(shadow.manifestJson, undefined);
  assert.equal(shadow.capabilityKid, undefined);

  const stopped = await store.stopSession({
    deploymentId: input.manifest.provenance.deploymentId,
    observationId: input.observationId
  });
  assert.equal(stopped.kind, "stopped");
  assert.equal(await redis.exists(keys.session), 0);
  assert.equal(await redis.get(claimKey), null);
  const stoppedExpiry = await pexpiretime(redis, keys.terminal);
  const physicalNow = await redisTimeMs(redis);
  assert.ok(stoppedExpiry > physicalNow + 59_000 && stoppedExpiry <= physicalNow + 60_000);

  const terminal = await redis.hGetAll(keys.terminal);
  assert.deepEqual(Object.keys(terminal).sort(), terminalFieldNames());
  for (const forbidden of [
    "manifestJson",
    "capabilityKid",
    "tokenVersion",
    "event:",
    "bucket:",
    "observerId",
    "observerFencingToken",
    "observerLeaseExpiresAtMs"
  ]) {
    assert.equal(
      Object.keys(terminal).some((field) => field.startsWith(forbidden)),
      false
    );
  }

  assert.equal(
    (
      await store.collectEvent({
        eventId: "00000000-0000-4000-8000-000000000002",
        observationId: input.observationId
      })
    ).kind,
    "gone"
  );
  now += 60_000;
  assert.equal(
    (
      await store.collectEvent({
        eventId: "00000000-0000-4000-8000-000000000003",
        observationId: input.observationId
      })
    ).kind,
    "not_found"
  );
  assert.equal(await redis.exists(keys.terminal), 0);
});

test("same-shape stored JSON corruption fails closed before mutation", async () => {
  const keyNamespace = namespace("corrupt_json");
  const { seam } = storeClientFactory();
  const store = createRedisLiveObservationStoreForTest({
    createClient: () => seam,
    keyNamespace,
    now: () => START_MS,
    redisUrl
  });
  const input = createLiveObservationStoreContractInput();
  const keys = createRedisLiveObservationStoreKeys(keyNamespace, input.observationId);
  const claimKey = keys.deployment(input.manifest.provenance.deploymentId);
  const redis = await admin();
  assert.equal((await store.createSession(input)).kind, "created");

  const corruptManifest = structuredClone(input.manifest);
  corruptManifest.endpoints.trafficUrl =
    "https://traffic.example.com/events?token=reviewer-probe-token";
  (corruptManifest.adapter.payload as Record<string, string>).loadBalancerArn =
    "arn:aws:iam::123456789012:role/reviewer-probe";
  await redis.hSet(keys.session, "manifestJson", JSON.stringify(corruptManifest));
  await assertUnavailable(() =>
    store.collectEvent({
      eventId: "00000000-0000-4000-8000-000000000004",
      observationId: input.observationId
    })
  );
  await assertUnavailable(() =>
    store.claimObserverLease({
      observationId: input.observationId,
      observerId: FIRST_OBSERVER_ID
    })
  );
  assert.equal(await redis.hGet(keys.session, "acceptedEventCount"), "0");
  assert.equal(await redis.hGet(keys.session, "event:00000000-0000-4000-8000-000000000004"), null);
  assert.equal(await redis.hGet(keys.session, "observerId"), null);

  await redis.hSet(keys.session, "manifestJson", JSON.stringify(input.manifest));
  const observer = await store.claimObserverLease({
    observationId: input.observationId,
    observerId: FIRST_OBSERVER_ID
  });
  assert.equal(observer.kind, "claimed");
  if (observer.kind !== "claimed") assert.fail("Expected observer claim");
  assert.equal(
    (
      await store.commitObservation({
        fencingToken: observer.lease.fencingToken,
        observation: {
          observedAt: new Date(START_MS).toISOString(),
          payload: providerSnapshot(new Date(START_MS).toISOString(), "available")
        },
        observationId: input.observationId,
        observerId: FIRST_OBSERVER_ID
      })
    ).kind,
    "committed"
  );
  const corruptObservationJson = JSON.stringify({
    observedAt: "2026-99-99T99:99:99.999Z",
    payload: { roleArn: "arn:aws:iam::123456789012:role/reviewer-probe" }
  });
  await redis.hSet(keys.session, "latestObservationJson", corruptObservationJson);
  await redis.hSet(keys.terminal, "finalObservationJson", corruptObservationJson);
  await assertUnavailable(() =>
    store.stopSession({
      deploymentId: input.manifest.provenance.deploymentId,
      observationId: input.observationId
    })
  );
  assert.equal(await redis.exists(keys.session), 1);
  assert.equal(await redis.get(claimKey), input.observationId);
  assert.equal(await redis.hGet(keys.terminal, "status"), "expired");
});

function providerSnapshot(observedAt: string, message: string) {
  return {
    requests: 1,
    errorRate: 0,
    p95LatencyMs: 10,
    availability: 100,
    capacity: { desired: 1, running: 1, healthy: 1, max: 2 },
    logs: [{ timestamp: observedAt, message }],
    observedAt,
    state: "available" as const
  };
}

function terminalFieldNames(): string[] {
  return [
    "acceptedEventCount",
    "codecVersion",
    "createdAtMs",
    "deploymentId",
    "expiresAtMs",
    "finalObservationJson",
    "finalObservationJsonSha1",
    "observationId",
    "pressureTarget",
    "purgeAtMs",
    "rollingCount",
    "status",
    "terminalAtMs"
  ];
}

async function assertUnavailable(operation: () => Promise<unknown>): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof LiveObservationStoreUnavailableError);
    assert.equal(error.message, "Live Observation Store unavailable");
    assert.equal(error.cause, undefined);
    assert.deepEqual(Object.keys(error), []);
    return true;
  });
}
