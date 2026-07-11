import assert from "node:assert/strict";
import { test } from "node:test";
import { createInMemoryRuntimeCache } from "./in-memory-runtime-cache.js";
import {
  createRedisCacheKey,
  createRedisRuntimeCache,
  type RedisRuntimeCacheClient
} from "./redis-runtime-cache.js";

test("createRedisRuntimeCache stores JSON values in Redis with a millisecond TTL", async () => {
  const redisClient = new FakeRedisClient();
  const degradedErrors: unknown[] = [];
  const cache = createRedisRuntimeCache({
    createClient: () => redisClient,
    keyPrefix: "sketchcatch:test",
    onDegraded: (error) => degradedErrors.push(error),
    redisUrl: "redis://localhost:6379"
  });
  const entryKey = {
    key: "deployment:123",
    namespace: "deployment.status"
  };

  await cache.set(entryKey, { progress: 20, status: "running" }, { ttlMs: 1500 });

  assert.equal(redisClient.connectCount, 1);
  assert.deepEqual(redisClient.setCalls[0], {
    key: "sketchcatch:test:deployment.status:deployment%3A123",
    options: {
      expiration: {
        type: "PX",
        value: 1500
      }
    },
    value: JSON.stringify({ progress: 20, status: "running" })
  });
  assert.deepEqual(await cache.get(entryKey), { progress: 20, status: "running" });
  assert.equal(await cache.delete(entryKey), true);
  assert.equal(await cache.get(entryKey), null);
  assert.deepEqual(degradedErrors, []);
});

test("createRedisRuntimeCache falls back to memory when Redis connect fails", async () => {
  const redisClient = new FakeRedisClient({
    connectError: new Error("Redis unavailable")
  });
  const degradedErrors: unknown[] = [];
  const cache = createRedisRuntimeCache({
    createClient: () => redisClient,
    fallbackCache: createInMemoryRuntimeCache({ cleanupIntervalMs: null }),
    onDegraded: (error) => degradedErrors.push(error),
    redisUrl: "redis://localhost:6379"
  });
  const entryKey = {
    key: "scan:123",
    namespace: "reverse-engineering.scan"
  };

  await cache.set(entryKey, { status: "running" }, { ttlMs: 1000 });

  assert.equal(redisClient.connectCount, 1);
  assert.deepEqual(await cache.get(entryKey), { status: "running" });
  assert.equal(await cache.delete(entryKey), true);
  assert.equal(await cache.get(entryKey), null);
  assert.equal(degradedErrors.length, 4);
});

test("createRedisRuntimeCache does not use memory fallback on healthy Redis cache miss", async () => {
  const redisClient = new FakeRedisClient();
  const fallbackCache = createInMemoryRuntimeCache({ cleanupIntervalMs: null });
  const cache = createRedisRuntimeCache({
    createClient: () => redisClient,
    fallbackCache,
    redisUrl: "redis://localhost:6379"
  });
  const entryKey = {
    key: "deployment:123",
    namespace: "deployment.status"
  };

  await fallbackCache.set(entryKey, "stale_value", { ttlMs: 1000 });

  assert.equal(await cache.get(entryKey), null);
  assert.equal(redisClient.connectCount, 1);
});

test("createRedisRuntimeCache suppresses repeated reconnect attempts during cooldown", async () => {
  let currentTimeMs = 1000;
  const redisClient = new FakeRedisClient({
    connectError: new Error("Redis unavailable")
  });
  const degradedErrors: unknown[] = [];
  const cache = createRedisRuntimeCache({
    connectCooldownMs: 10_000,
    createClient: () => redisClient,
    fallbackCache: createInMemoryRuntimeCache({ cleanupIntervalMs: null }),
    now: () => currentTimeMs,
    onDegraded: (error) => degradedErrors.push(error),
    redisUrl: "redis://localhost:6379"
  });
  const entryKey = {
    key: "scan:123",
    namespace: "reverse-engineering.scan"
  };

  await cache.set(entryKey, { status: "running" }, { ttlMs: 1000 });
  assert.equal(redisClient.connectCount, 1);

  assert.deepEqual(await cache.get(entryKey), { status: "running" });
  assert.equal(redisClient.connectCount, 1);

  currentTimeMs += 10_001;

  assert.deepEqual(await cache.get(entryKey), { status: "running" });
  assert.equal(redisClient.connectCount, 2);
  assert.equal(degradedErrors.length, 3);
});

test("createRedisRuntimeCache falls back to memory when Redis commands fail", async () => {
  const redisClient = new FakeRedisClient({
    commandError: new Error("Redis command failed")
  });
  const degradedErrors: unknown[] = [];
  const cache = createRedisRuntimeCache({
    createClient: () => redisClient,
    fallbackCache: createInMemoryRuntimeCache({ cleanupIntervalMs: null }),
    onDegraded: (error) => degradedErrors.push(error),
    redisUrl: "redis://localhost:6379"
  });
  const entryKey = {
    key: "handoff:123",
    namespace: "git-ci.handoff"
  };

  await cache.set(entryKey, "pipeline_running", { ttlMs: 1000 });

  assert.equal(redisClient.connectCount, 1);
  assert.equal(await cache.get<string>(entryKey), "pipeline_running");
  assert.equal(await cache.delete(entryKey), true);
  assert.equal(degradedErrors.length, 3);
});

test("createRedisCacheKey escapes namespace and key segments", () => {
  assert.equal(
    createRedisCacheKey("sketchcatch:test", {
      key: "deployment:123/456",
      namespace: "deployment.status"
    }),
    "sketchcatch:test:deployment.status:deployment%3A123%2F456"
  );
});

test("createRedisRuntimeCache uses Redis atomic increment and set-if-absent commands", async () => {
  const redisClient = new FakeRedisClient();
  const cache = createRedisRuntimeCache({
    createClient: () => redisClient,
    keyPrefix: "sketchcatch:test",
    redisUrl: "redis://localhost:6379"
  });
  const counterKey = {
    key: "observation-1:total",
    namespace: "live-observation-bucket"
  };
  const eventKey = {
    key: "event-1",
    namespace: "live-observation-event"
  };

  assert.equal(await cache.increment(counterKey, 2, { ttlMs: 1_500 }), 2);
  assert.equal(await cache.increment(counterKey, 3, { ttlMs: 1_500 }), 5);
  assert.equal(await cache.setIfAbsent(eventKey, "accepted", { ttlMs: 2_000 }), true);
  assert.equal(await cache.setIfAbsent(eventKey, "duplicate", { ttlMs: 2_000 }), false);

  assert.deepEqual(redisClient.incrementCalls, [
    {
      delta: 2,
      key: "sketchcatch:test:live-observation-bucket:observation-1%3Atotal"
    },
    {
      delta: 3,
      key: "sketchcatch:test:live-observation-bucket:observation-1%3Atotal"
    }
  ]);
  assert.deepEqual(redisClient.expireCalls, [
    {
      key: "sketchcatch:test:live-observation-bucket:observation-1%3Atotal",
      ttlMs: 1_500
    },
    {
      key: "sketchcatch:test:live-observation-bucket:observation-1%3Atotal",
      ttlMs: 1_500
    }
  ]);
  assert.equal(redisClient.setCalls[0]?.options.condition, "NX");
});

test("createRedisRuntimeCache reports Redis readiness without using memory fallback", async () => {
  const healthyClient = new FakeRedisClient();
  const healthyCache = createRedisRuntimeCache({
    createClient: () => healthyClient,
    redisUrl: "redis://localhost:6379"
  });

  assert.equal(healthyCache.backend, "redis");
  assert.equal(await healthyCache.isAvailable(), true);
  assert.equal(healthyClient.pingCount, 1);

  const unavailableCache = createRedisRuntimeCache({
    createClient: () => new FakeRedisClient({ commandError: new Error("Redis unavailable") }),
    redisUrl: "redis://localhost:6379"
  });

  assert.equal(await unavailableCache.isAvailable(), false);
});

class FakeRedisClient implements RedisRuntimeCacheClient {
  isOpen = false;
  connectCount = 0;
  pingCount = 0;
  readonly incrementCalls: Array<{ key: string; delta: number }> = [];
  readonly expireCalls: Array<{ key: string; ttlMs: number }> = [];
  readonly setCalls: Array<{
    key: string;
    value: string;
    options: {
      condition?: "NX";
      expiration: {
        type: "PX";
        value: number;
      };
    };
  }> = [];
  private readonly valuesByKey = new Map<string, string>();
  private readonly connectError: Error | undefined;
  private readonly commandError: Error | undefined;

  constructor(options: { connectError?: Error; commandError?: Error } = {}) {
    this.connectError = options.connectError;
    this.commandError = options.commandError;
  }

  async connect(): Promise<this> {
    this.connectCount += 1;

    if (this.connectError) {
      throw this.connectError;
    }

    this.isOpen = true;
    return this;
  }

  async get(key: string): Promise<string | null> {
    this.throwCommandErrorIfNeeded();
    return this.valuesByKey.get(key) ?? null;
  }

  async set(
    key: string,
    value: string,
    options: {
      condition?: "NX";
      expiration: {
        type: "PX";
        value: number;
      };
    }
  ): Promise<"OK" | null> {
    this.throwCommandErrorIfNeeded();

    if (options.condition === "NX" && this.valuesByKey.has(key)) {
      return null;
    }

    this.setCalls.push({ key, options, value });
    this.valuesByKey.set(key, value);
    return "OK";
  }

  async del(key: string): Promise<number> {
    this.throwCommandErrorIfNeeded();
    return this.valuesByKey.delete(key) ? 1 : 0;
  }

  async incrBy(key: string, delta: number): Promise<number> {
    this.throwCommandErrorIfNeeded();
    const nextValue = Number(this.valuesByKey.get(key) ?? "0") + delta;
    this.valuesByKey.set(key, String(nextValue));
    this.incrementCalls.push({ delta, key });
    return nextValue;
  }

  async pExpire(key: string, ttlMs: number): Promise<boolean> {
    this.throwCommandErrorIfNeeded();
    this.expireCalls.push({ key, ttlMs });
    return this.valuesByKey.has(key);
  }

  async ping(): Promise<string> {
    this.throwCommandErrorIfNeeded();
    this.pingCount += 1;
    return "PONG";
  }

  on(): this {
    return this;
  }

  private throwCommandErrorIfNeeded(): void {
    if (this.commandError) {
      throw this.commandError;
    }
  }
}
