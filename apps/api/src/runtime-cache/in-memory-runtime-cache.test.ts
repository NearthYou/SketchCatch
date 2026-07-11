import assert from "node:assert/strict";
import { test } from "node:test";
import { createInMemoryRuntimeCache } from "./in-memory-runtime-cache.js";
import type { RuntimeCacheJsonValue } from "./runtime-cache.js";

test("set and get returns cached JSON values", async () => {
  const cache = createInMemoryRuntimeCache();
  const entryKey = {
    key: "deployment-1",
    namespace: "deployment.status"
  };
  const value = {
    attempt: 1,
    metadata: {
      approved: false,
      notes: null
    },
    status: "planning"
  } satisfies RuntimeCacheJsonValue;

  await cache.set(entryKey, value, { ttlMs: 1000 });

  assert.deepEqual(await cache.get<typeof value>(entryKey), value);
});

test("get accepts interface-shaped cached values", async () => {
  interface DeploymentRuntimeStatus {
    readonly startedAt: string;
    readonly status: "running";
  }

  const cache = createInMemoryRuntimeCache();
  const entryKey = {
    key: "deployment-typed",
    namespace: "deployment.status"
  };

  await cache.set(entryKey, { startedAt: "2026-07-03T00:00:00.000Z", status: "running" }, { ttlMs: 1000 });

  assert.deepEqual(await cache.get<DeploymentRuntimeStatus>(entryKey), {
    startedAt: "2026-07-03T00:00:00.000Z",
    status: "running"
  });
});

test("delete removes one cached entry", async () => {
  const cache = createInMemoryRuntimeCache();
  const entryKey = {
    key: "scan-1",
    namespace: "reverse-engineering.scan"
  };

  await cache.set(entryKey, "running", { ttlMs: 1000 });

  assert.equal(await cache.delete(entryKey), true);
  assert.equal(await cache.get(entryKey), null);
  assert.equal(await cache.delete(entryKey), false);
});

test("ttl expiry uses the injected clock", async () => {
  let currentTimeMs = 10_000;
  const cache = createInMemoryRuntimeCache({
    now: () => currentTimeMs
  });
  const entryKey = {
    key: "handoff-1",
    namespace: "git-ci.handoff"
  };

  await cache.set(entryKey, { state: "queued" }, { ttlMs: 500 });

  currentTimeMs = 10_499;
  assert.deepEqual(await cache.get(entryKey), { state: "queued" });

  currentTimeMs = 10_500;
  assert.equal(await cache.get(entryKey), null);
});

test("set sweeps expired entries before writing new values", async () => {
  let currentTimeMs = 20_000;
  const cache = createInMemoryRuntimeCache({
    cleanupIntervalMs: null,
    now: () => currentTimeMs
  });
  const expiredEntryKey = {
    key: "expired-deployment",
    namespace: "deployment.status"
  };
  const currentEntryKey = {
    key: "current-deployment",
    namespace: "deployment.status"
  };

  await cache.set(expiredEntryKey, "running", { ttlMs: 100 });

  currentTimeMs = 20_100;
  await cache.set(currentEntryKey, "queued", { ttlMs: 1000 });

  assert.equal(await cache.delete(expiredEntryKey), false);
  assert.equal(await cache.get<string>(currentEntryKey), "queued");
});

test("namespaces isolate entries with the same key", async () => {
  const cache = createInMemoryRuntimeCache();
  const sharedKey = "workflow-1";

  await cache.set(
    {
      key: sharedKey,
      namespace: "deployment.status"
    },
    "deployment-value",
    { ttlMs: 1000 }
  );
  await cache.set(
    {
      key: sharedKey,
      namespace: "reverse-engineering.scan"
    },
    "scan-value",
    { ttlMs: 1000 }
  );

  assert.equal(
    await cache.get<string>({
      key: sharedKey,
      namespace: "deployment.status"
    }),
    "deployment-value"
  );
  assert.equal(
    await cache.get<string>({
      key: sharedKey,
      namespace: "reverse-engineering.scan"
    }),
    "scan-value"
  );

  await cache.delete({
    key: sharedKey,
    namespace: "deployment.status"
  });

  assert.equal(
    await cache.get<string>({
      key: sharedKey,
      namespace: "reverse-engineering.scan"
    }),
    "scan-value"
  );
});

test("cached JSON values are serialized copies", async () => {
  const cache = createInMemoryRuntimeCache();
  const entryKey = {
    key: "deployment-2",
    namespace: "deployment.status"
  };
  const value = {
    events: ["created"],
    progress: {
      step: 1
    },
    status: "running"
  } satisfies RuntimeCacheJsonValue;

  await cache.set(entryKey, value, { ttlMs: 1000 });

  value.events.push("mutated-after-set");
  value.progress.step = 99;

  const firstRead = await cache.get<typeof value>(entryKey);

  assert.deepEqual(firstRead, {
    events: ["created"],
    progress: {
      step: 1
    },
    status: "running"
  });

  assert.ok(firstRead);
  firstRead.events.push("mutated-after-get");
  firstRead.progress.step = 100;

  assert.deepEqual(await cache.get<typeof value>(entryKey), {
    events: ["created"],
    progress: {
      step: 1
    },
    status: "running"
  });
});

test("increment atomically accumulates numeric values and refreshes ttl", async () => {
  let currentTimeMs = 30_000;
  const cache = createInMemoryRuntimeCache({
    cleanupIntervalMs: null,
    now: () => currentTimeMs
  });
  const entryKey = {
    key: "observation-1:total",
    namespace: "live-observation-bucket"
  };

  assert.equal(await cache.increment(entryKey, 2, { ttlMs: 500 }), 2);

  currentTimeMs = 30_400;
  assert.equal(await cache.increment(entryKey, 3, { ttlMs: 500 }), 5);

  currentTimeMs = 30_899;
  assert.equal(await cache.get<number>(entryKey), 5);

  currentTimeMs = 30_900;
  assert.equal(await cache.get<number>(entryKey), null);
});

test("setIfAbsent keeps the first unexpired value and accepts a new value after expiry", async () => {
  let currentTimeMs = 40_000;
  const cache = createInMemoryRuntimeCache({
    cleanupIntervalMs: null,
    now: () => currentTimeMs
  });
  const entryKey = {
    key: "event-1",
    namespace: "live-observation-event"
  };

  assert.equal(await cache.setIfAbsent(entryKey, "first", { ttlMs: 1_000 }), true);
  assert.equal(await cache.setIfAbsent(entryKey, "second", { ttlMs: 1_000 }), false);
  assert.equal(await cache.get<string>(entryKey), "first");

  currentTimeMs = 41_000;

  assert.equal(await cache.setIfAbsent(entryKey, "third", { ttlMs: 1_000 }), true);
  assert.equal(await cache.get<string>(entryKey), "third");
});
