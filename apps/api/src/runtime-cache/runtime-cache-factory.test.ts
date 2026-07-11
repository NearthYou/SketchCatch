import assert from "node:assert/strict";
import { test } from "node:test";
import type { RuntimeEnv } from "../config/env.js";
import { createRuntimeCacheFromEnv } from "./runtime-cache-factory.js";
import type { RuntimeCache } from "./runtime-cache.js";

test("createRuntimeCacheFromEnv uses memory fallback when REDIS_URL is missing", async () => {
  let redisCreated = false;
  const cache = createRuntimeCacheFromEnv({
    createRedisCache: () => {
      redisCreated = true;
      return createNeverUsedCache();
    },
    env: createRuntimeEnv({
      redisUrl: undefined
    })
  });

  await cache.set({ key: "deployment:1", namespace: "deployment.status" }, "running", {
    ttlMs: 1000
  });

  assert.equal(await cache.get({ key: "deployment:1", namespace: "deployment.status" }), "running");
  assert.equal(redisCreated, false);
});

test("createRuntimeCacheFromEnv uses memory fallback in test environment even with REDIS_URL", async () => {
  let redisCreated = false;
  const cache = createRuntimeCacheFromEnv({
    createRedisCache: () => {
      redisCreated = true;
      return createNeverUsedCache();
    },
    env: createRuntimeEnv({
      nodeEnv: "test",
      redisUrl: "redis://localhost:6379"
    })
  });

  await cache.set({ key: "scan:1", namespace: "reverse-engineering.scan" }, "running", {
    ttlMs: 1000
  });

  assert.equal(
    await cache.get({ key: "scan:1", namespace: "reverse-engineering.scan" }),
    "running"
  );
  assert.equal(redisCreated, false);
});

test("createRuntimeCacheFromEnv uses Redis when REDIS_URL is configured outside tests", async () => {
  const redisUrls: string[] = [];
  const cache = createRuntimeCacheFromEnv({
    createRedisCache: (redisUrl) => {
      redisUrls.push(redisUrl);
      return createFakeRuntimeCache();
    },
    env: createRuntimeEnv({
      nodeEnv: "production",
      redisUrl: " redis://cache:6379 "
    })
  });

  await cache.set({ key: "handoff:1", namespace: "git-ci.handoff" }, "queued", {
    ttlMs: 1000
  });

  assert.deepEqual(redisUrls, ["redis://cache:6379"]);
  assert.equal(await cache.get({ key: "handoff:1", namespace: "git-ci.handoff" }), "queued");
});

function createRuntimeEnv(overrides: Partial<RuntimeEnv>): RuntimeEnv {
  return {
    awsRegion: "ap-northeast-2",
    authTokenSecret: undefined,
    cloudFormationTemplateTokenSecret: undefined,
    databaseSsl: false,
    databaseUrl: undefined,
    githubOauthClientId: undefined,
    githubOauthClientSecret: undefined,
    kakaoOauthClientId: undefined,
    kakaoOauthClientSecret: undefined,
    naverOauthClientId: undefined,
    naverOauthClientSecret: undefined,
    nodeEnv: "development",
    oauthRedirectBaseUrl: undefined,
    redisUrl: undefined,
    s3BucketName: undefined,
    sketchcatchAwsCallerPrincipalArn: undefined,
    sketchcatchPublicBaseUrl: undefined,
    ...overrides
  };
}

function createFakeRuntimeCache(): RuntimeCache {
  const valuesByKey = new Map<string, unknown>();

  return {
    backend: "memory",
    async isAvailable() {
      return true;
    },
    async delete(entryKey) {
      return valuesByKey.delete(createKey(entryKey));
    },
    async get(entryKey) {
      return (valuesByKey.get(createKey(entryKey)) ?? null) as never;
    },
    async set(entryKey, value) {
      valuesByKey.set(createKey(entryKey), value);
    },
    async increment(entryKey, delta) {
      const key = createKey(entryKey);
      const nextValue = Number(valuesByKey.get(key) ?? 0) + delta;
      valuesByKey.set(key, nextValue);
      return nextValue;
    },
    async setIfAbsent(entryKey, value) {
      const key = createKey(entryKey);

      if (valuesByKey.has(key)) {
        return false;
      }

      valuesByKey.set(key, value);
      return true;
    }
  };
}

function createNeverUsedCache(): RuntimeCache {
  return {
    backend: "redis",
    async isAvailable() {
      throw new Error("Redis cache should not be used");
    },
    async delete() {
      throw new Error("Redis cache should not be used");
    },
    async get() {
      throw new Error("Redis cache should not be used");
    },
    async set() {
      throw new Error("Redis cache should not be used");
    },
    async increment() {
      throw new Error("Redis cache should not be used");
    },
    async setIfAbsent() {
      throw new Error("Redis cache should not be used");
    }
  };
}

function createKey(entryKey: { readonly namespace: string; readonly key: string }): string {
  return `${entryKey.namespace}:${entryKey.key}`;
}
