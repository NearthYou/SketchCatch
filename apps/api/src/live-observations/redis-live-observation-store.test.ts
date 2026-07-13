import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  LiveObservationStoreClockError,
  LiveObservationStoreInputError,
  LiveObservationStoreUnavailableError,
  type LiveObservationStore
} from "./live-observation-store.js";
import { createLiveObservationStoreContractInput } from "./live-observation-store-contract.js";
import {
  createRedisLiveObservationStore,
  createRedisLiveObservationStoreKeys,
  type RedisLiveObservationStoreClient
} from "./redis-live-observation-store.js";
import { REDIS_LIVE_OBSERVATION_STORE_SCRIPTS } from "./redis-live-observation-store-scripts.js";

const REDIS_URL = "redis://localhost:6379";
const NAMESPACE = "unit_test";
const INPUT = createLiveObservationStoreContractInput();
const SECOND_OBSERVATION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OBSERVER_ID = "11111111-1111-4111-8111-111111111111";
const LEASE_ID = "33333333-3333-4333-8333-333333333333";
const EVENT_ID = "00000000-0000-4000-8000-000000000001";
const EVALUATED_AT_MS = Date.parse("2026-07-11T00:00:00.000Z");

test("Redis LiveObservationStore validates config generically and connects lazily", async () => {
  for (const options of [
    { redisUrl: "", keyNamespace: NAMESPACE },
    { redisUrl: REDIS_URL, keyNamespace: "bad namespace" },
    { redisUrl: REDIS_URL, keyNamespace: "x".repeat(65) },
    { redisUrl: REDIS_URL, keyNamespace: "bad{namespace}" }
  ]) {
    const error = await captureError(async () => {
      createRedisLiveObservationStore(options);
    });
    assertGenericUnavailable(error);
    if (options.redisUrl !== "") {
      assert.equal(error.message.includes(options.redisUrl), false);
    }
    if (options.keyNamespace !== "") {
      assert.equal(error.message.includes(options.keyNamespace), false);
    }
  }

  const client = new FakeRedisClient();
  let createClientCount = 0;
  const store = createRedisLiveObservationStore({
    createClient: () => {
      createClientCount += 1;
      return client;
    },
    keyNamespace: NAMESPACE,
    redisUrl: `  ${REDIS_URL}  `
  });

  assert.equal(createClientCount, 0);
  assert.equal(client.connectCount, 0);

  assert.equal((await store.readSession({ observationId: INPUT.observationId })).kind, "not_found");
  assert.equal(createClientCount, 1);
  assert.equal(client.connectCount, 1);
  assert.deepEqual(client.registeredEvents, ["error"]);

  const keys = createRedisLiveObservationStoreKeys(NAMESPACE, INPUT.observationId);
  assert.deepEqual(client.evalCalls[0]?.options.keys, [keys.session, keys.terminal]);
  assert.equal(client.evalCalls[0]?.options.arguments.at(-1), INPUT.observationId);
});

test("Redis LiveObservationStore merges concurrent lazy connects", async () => {
  let releaseConnect: (() => void) | undefined;
  const connectGate = new Promise<void>((resolve) => {
    releaseConnect = resolve;
  });
  const client = new FakeRedisClient({ connectGate });
  const store = createStore(client);

  const first = store.readSession({ observationId: INPUT.observationId });
  const second = store.readSession({ observationId: SECOND_OBSERVATION_ID });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(client.connectCount, 1);
  releaseConnect?.();
  assert.equal((await first).kind, "not_found");
  assert.equal((await second).kind, "not_found");
  assert.equal(client.evalCalls.length, 2);
});

test("Redis LiveObservationStore reuses an injected client that is already open", async () => {
  const client = new FakeRedisClient();
  client.isOpen = true;

  const result = await createStore(client).readSession({
    observationId: INPUT.observationId
  });

  assert.equal(result.kind, "not_found");
  assert.equal(client.connectCount, 0);
  assert.deepEqual(client.registeredEvents, []);
  assert.equal(client.evalCalls.length, 1);
});

test("all nine Redis Store operations fail closed on connect errors", async () => {
  for (const operation of storeOperations()) {
    const client = new FakeRedisClient({
      connectError: new Error(`connect-secret-${operation.name}`)
    });
    const error = await captureError(() => operation.invoke(createStore(client)));
    assertGenericUnavailable(error, `connect-secret-${operation.name}`);
    assert.equal(client.connectCount, 1, operation.name);
    assert.equal(client.evalCalls.length, 0, operation.name);
  }
});

test("all nine Redis Store operations fail closed without retrying EVAL", async () => {
  for (const operation of storeOperations()) {
    const client = new FakeRedisClient({
      evalError: new Error(`eval-secret-${operation.name}`)
    });
    const error = await captureError(() => operation.invoke(createStore(client)));
    assertGenericUnavailable(error, `eval-secret-${operation.name}`);
    assert.equal(client.connectCount, 1, operation.name);
    assert.equal(client.evalCalls.length, 1, operation.name);
  }
});

test("all nine Redis Store operations reject malformed and corrupt replies", async () => {
  for (const operation of storeOperations()) {
    for (const reply of [["1"], ["1", "corrupt", String(EVALUATED_AT_MS)]]) {
      const client = new FakeRedisClient({ evalReply: reply });
      const error = await captureError(() => operation.invoke(createStore(client)));
      assertGenericUnavailable(error);
      assert.equal(client.evalCalls.length, 1, operation.name);
    }
  }
});

test("stored observation parse errors are unavailable rather than caller input errors", async () => {
  const client = new FakeRedisClient({
    evalReply: activeReply({
      latestObservationJson: JSON.stringify({ observedAt: 42, payload: null })
    })
  });
  const error = await captureError(() =>
    createStore(client).readSession({ observationId: INPUT.observationId })
  );

  assertGenericUnavailable(error);
  assert.equal(error instanceof LiveObservationStoreInputError, false);
});

test("production Redis replies cannot surface test-clock errors", async () => {
  const client = new FakeRedisClient({
    evalReply: ["1", "clock_error", String(EVALUATED_AT_MS)]
  });
  const error = await captureError(() =>
    createStore(client).readSession({ observationId: INPUT.observationId })
  );

  assertGenericUnavailable(error);
  assert.equal(error instanceof LiveObservationStoreClockError, false);
});

test("production connect and EVAL failures cannot surface injected clock errors", async () => {
  for (const client of [
    new FakeRedisClient({ connectError: new LiveObservationStoreClockError() }),
    new FakeRedisClient({ evalError: new LiveObservationStoreClockError() })
  ]) {
    const error = await captureError(() =>
      createStore(client).readSession({ observationId: INPUT.observationId })
    );
    assertGenericUnavailable(error);
    assert.equal(error instanceof LiveObservationStoreClockError, false);
  }
});

test("strict replies reject impossible counters and response identity swaps", async () => {
  const unsafeCounter = new FakeRedisClient({
    evalReply: activeReply({ acceptedEventCount: 10_001 })
  });
  assertGenericUnavailable(
    await captureError(() =>
      createStore(unsafeCounter).readSession({ observationId: INPUT.observationId })
    )
  );

  const unsafeRollingCount = new FakeRedisClient({
    evalReply: activeReply({ acceptedEventCount: 121, rollingCount: 121 })
  });
  assertGenericUnavailable(
    await captureError(() =>
      createStore(unsafeRollingCount).readSession({ observationId: INPUT.observationId })
    )
  );

  const swappedIdentity = new FakeRedisClient({
    evalReply: activeReply({ observationId: SECOND_OBSERVATION_ID })
  });
  assertGenericUnavailable(
    await captureError(() =>
      createStore(swappedIdentity).readSession({ observationId: INPUT.observationId })
    )
  );
});

test("lease replies bind requested identities and future expiries", async () => {
  const invalidPresenterReplies = [
    [
      "1",
      "acquired",
      String(EVALUATED_AT_MS),
      SECOND_OBSERVATION_ID,
      String(EVALUATED_AT_MS + 10_000)
    ],
    ["1", "acquired", String(EVALUATED_AT_MS), LEASE_ID, String(EVALUATED_AT_MS)]
  ];
  for (const reply of invalidPresenterReplies) {
    const client = new FakeRedisClient({ evalReply: reply });
    assertGenericUnavailable(
      await captureError(() =>
        createStore(client).acquirePresenterBoostLease({
          leaseId: LEASE_ID,
          observationId: INPUT.observationId
        })
      )
    );
  }

  const invalidObserverExpiry = new FakeRedisClient({
    evalReply: ["1", "claimed", String(EVALUATED_AT_MS), "1", String(EVALUATED_AT_MS)]
  });
  assertGenericUnavailable(
    await captureError(() =>
      createStore(invalidObserverExpiry).claimObserverLease({
        observationId: INPUT.observationId,
        observerId: OBSERVER_ID
      })
    )
  );
});

test("production Lua scripts use one Redis TIME and only absolute expiry", () => {
  for (const [operation, script] of Object.entries(REDIS_LIVE_OBSERVATION_STORE_SCRIPTS)) {
    assert.equal(countMatches(script, /redis\.call\(['"]TIME['"]\)/g), 1, operation);
    assert.doesNotMatch(
      script,
      /redis\.call\(['"](?:PEXPIRE|SCAN|FLUSHDB|WATCH|MULTI)['"]/,
      operation
    );
    assert.doesNotMatch(script, /fallback|RuntimeCache/i, operation);
  }

  assert.equal(
    countMatches(
      REDIS_LIVE_OBSERVATION_STORE_SCRIPTS.createSession,
      /redis\.call\(['"]PEXPIREAT['"]/g
    ),
    3
  );
  assert.equal(
    countMatches(
      REDIS_LIVE_OBSERVATION_STORE_SCRIPTS.stopSession,
      /redis\.call\(['"]PEXPIREAT['"]/g
    ),
    1
  );
});

test("collect Lua uses exact integer weighted-rate arithmetic and the 10,000 session cap", () => {
  const collect = REDIS_LIVE_OBSERVATION_STORE_SCRIPTS.collectEvent;

  assert.match(collect, /candidateCurrent\s*\*\s*1000/);
  assert.match(collect, /previousCount\s*\*\s*\(\s*1000\s*-\s*progressMs\s*\)/);
  assert.match(collect, />\s*20000/);
  assert.match(collect, /currentRolling\s*\+\s*1\s*>\s*120/);
  assert.match(collect, /total\s*>=\s*10000/);
  assert.doesNotMatch(collect, /\b5000\b/);
  assert.doesNotMatch(collect, /local\s+weighted\s*=/);
});

test("Redis adapter configuration disables queueing, reconnects, and fallback", async () => {
  const source = await readFile(
    new URL("./redis-live-observation-store.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /disableOfflineQueue:\s*true/);
  assert.match(source, /reconnectStrategy:\s*false/);
  assert.doesNotMatch(source, /fallbackCache|createInMemory|runtime-cache/i);
  assert.doesNotMatch(REDIS_LIVE_OBSERVATION_STORE_SCRIPTS.createSession, /['"]claimKey['"]/);
});

test("dedicated Redis runner uses an explicit URL or an isolated Redis 8 container", async () => {
  const runner = await readFile(
    new URL("../../../../scripts/test-live-observation-redis.mjs", import.meta.url),
    "utf8"
  );
  const packageJson = JSON.parse(
    await readFile(new URL("../../../../package.json", import.meta.url), "utf8")
  ) as { scripts?: Record<string, unknown> };

  assert.equal(
    packageJson.scripts?.["test:live-observation:redis"],
    "node scripts/test-live-observation-redis.mjs"
  );
  assert.match(runner, /LIVE_OBSERVATION_REDIS_TEST_URL/);
  assert.match(runner, /redis:8-alpine/);
  assert.match(runner, /randomUUID/);
  assert.match(runner, /finally/);
  assert.match(runner, /timeoutMs/);
  assert.match(runner, /120_000/);
  assert.match(runner, /\brm\b/);
  assert.match(runner, /--force/);
  assert.doesNotMatch(runner, /SCAN|FLUSHDB/);
});

function createStore(client: RedisLiveObservationStoreClient): LiveObservationStore {
  return createRedisLiveObservationStore({
    createClient: () => client,
    keyNamespace: NAMESPACE,
    redisUrl: REDIS_URL
  });
}

function storeOperations(): ReadonlyArray<{
  name: string;
  invoke: (store: LiveObservationStore) => Promise<unknown>;
}> {
  return [
    { name: "createSession", invoke: (store) => store.createSession(INPUT) },
    {
      name: "readSession",
      invoke: (store) => store.readSession({ observationId: INPUT.observationId })
    },
    {
      name: "collectEvent",
      invoke: (store) =>
        store.collectEvent({ eventId: EVENT_ID, observationId: INPUT.observationId })
    },
    {
      name: "stopSession",
      invoke: (store) =>
        store.stopSession({
          deploymentId: INPUT.manifest.provenance.deploymentId,
          observationId: INPUT.observationId
        })
    },
    {
      name: "claimObserverLease",
      invoke: (store) =>
        store.claimObserverLease({
          observationId: INPUT.observationId,
          observerId: OBSERVER_ID
        })
    },
    {
      name: "commitObservation",
      invoke: (store) =>
        store.commitObservation({
          fencingToken: 1,
          observation: {
            observedAt: "2026-07-11T00:00:00.000Z",
            payload: { state: "healthy" }
          },
          observationId: INPUT.observationId,
          observerId: OBSERVER_ID
        })
    },
    {
      name: "acquirePresenterBoostLease",
      invoke: (store) =>
        store.acquirePresenterBoostLease({
          leaseId: LEASE_ID,
          observationId: INPUT.observationId
        })
    },
    {
      name: "renewPresenterBoostLease",
      invoke: (store) =>
        store.renewPresenterBoostLease({
          leaseId: LEASE_ID,
          observationId: INPUT.observationId
        })
    },
    {
      name: "releasePresenterBoostLease",
      invoke: (store) =>
        store.releasePresenterBoostLease({
          leaseId: LEASE_ID,
          observationId: INPUT.observationId
        })
    }
  ];
}

function activeReply(
  overrides: {
    observationId?: string;
    acceptedEventCount?: number;
    rollingCount?: number;
    latestObservationJson?: string;
  } = {}
): string[] {
  return [
    "1",
    "active",
    String(EVALUATED_AT_MS),
    overrides.observationId ?? INPUT.observationId,
    INPUT.manifest.provenance.deploymentId,
    JSON.stringify(INPUT.manifest),
    INPUT.capability.kid,
    String(INPUT.capability.tokenVersion),
    String(EVALUATED_AT_MS),
    String(EVALUATED_AT_MS + 900_000),
    String(overrides.acceptedEventCount ?? 0),
    String(overrides.rollingCount ?? 0),
    String(INPUT.manifest.pressure.target),
    overrides.latestObservationJson ?? ""
  ];
}

async function captureError(callback: () => Promise<unknown>): Promise<Error> {
  try {
    await callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return error;
  }
  assert.fail("Expected operation to reject");
}

function assertGenericUnavailable(error: Error, secret?: string): void {
  assert.ok(error instanceof LiveObservationStoreUnavailableError);
  assert.equal(error.message, "Live Observation Store unavailable");
  assert.equal(error.cause, undefined);
  assert.deepEqual(Object.keys(error), []);
  if (secret) {
    assert.equal(error.message.includes(secret), false);
    assert.equal(JSON.stringify(error).includes(secret), false);
  }
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

class FakeRedisClient implements RedisLiveObservationStoreClient {
  isOpen = false;
  connectCount = 0;
  readonly evalCalls: Array<{
    script: string;
    options: {
      readonly keys: readonly string[];
      readonly arguments: readonly string[];
    };
  }> = [];
  readonly registeredEvents: string[] = [];

  private readonly connectError: Error | undefined;
  private readonly connectGate: Promise<void> | undefined;
  private readonly evalError: Error | undefined;
  private readonly evalReply: unknown;

  constructor(
    options: {
      connectError?: Error;
      connectGate?: Promise<void>;
      evalError?: Error;
      evalReply?: unknown;
    } = {}
  ) {
    this.connectError = options.connectError;
    this.connectGate = options.connectGate;
    this.evalError = options.evalError;
    this.evalReply = options.evalReply ?? ["1", "not_found", String(EVALUATED_AT_MS)];
  }

  async connect(): Promise<this> {
    this.connectCount += 1;
    await this.connectGate;
    if (this.connectError) {
      throw this.connectError;
    }
    this.isOpen = true;
    return this;
  }

  async eval(
    script: string,
    options: {
      readonly keys: readonly string[];
      readonly arguments: readonly string[];
    }
  ): Promise<unknown> {
    this.evalCalls.push({ options, script });
    if (this.evalError) {
      throw this.evalError;
    }
    return this.evalReply;
  }

  on(event: "error", _listener: (error: unknown) => void): void {
    this.registeredEvents.push(event);
  }
}
