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
