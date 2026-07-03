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

class FakeRedisClient implements RedisRuntimeCacheClient {
  isOpen = false;
  connectCount = 0;
  readonly setCalls: Array<{
    key: string;
    value: string;
    options: {
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
      expiration: {
        type: "PX";
        value: number;
      };
    }
  ): Promise<"OK"> {
    this.throwCommandErrorIfNeeded();
    this.setCalls.push({ key, options, value });
    this.valuesByKey.set(key, value);
    return "OK";
  }

  async del(key: string): Promise<number> {
    this.throwCommandErrorIfNeeded();
    return this.valuesByKey.delete(key) ? 1 : 0;
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
