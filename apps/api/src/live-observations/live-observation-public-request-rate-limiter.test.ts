import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { RuntimeCache } from "../runtime-cache/index.js";
import { createInMemoryRuntimeCache } from "../runtime-cache/index.js";
import { createLiveObservationPublicRequestRateLimiter } from "./live-observation-public-request-rate-limiter.js";

const OBSERVATION_ID = "11111111-1111-4111-8111-111111111111";
const IP_ADDRESS = "203.0.113.42";
const START_MS = Date.parse("2026-07-13T00:00:00.000Z");

test("public request limiter allows only 30 requests per IP in each 60-second window", async () => {
  let nowMs = START_MS;
  const limiter = createLiveObservationPublicRequestRateLimiter({
    now: () => nowMs,
    runtimeCache: createInMemoryRuntimeCache({
      cleanupIntervalMs: null,
      now: () => nowMs
    })
  });

  for (let count = 0; count < 30; count += 1) {
    assert.deepEqual(
      await limiter.consume({ observationId: OBSERVATION_ID, ipAddress: IP_ADDRESS }),
      { kind: "allowed" }
    );
  }

  assert.deepEqual(
    await limiter.consume({ observationId: OBSERVATION_ID, ipAddress: IP_ADDRESS }),
    { kind: "rate_limited", retryAfterSeconds: 60 }
  );

  nowMs += 60_000;
  assert.deepEqual(
    await limiter.consume({ observationId: OBSERVATION_ID, ipAddress: IP_ADDRESS }),
    { kind: "allowed" }
  );
});

test("public request limiter stores only a SHA-256 IP fingerprint in Runtime Cache keys", async () => {
  const keys: string[] = [];
  const baseCache = createInMemoryRuntimeCache({ cleanupIntervalMs: null, now: () => START_MS });
  const runtimeCache: RuntimeCache = {
    ...baseCache,
    async increment(entryKey, delta, options) {
      keys.push(entryKey.key);
      return baseCache.increment(entryKey, delta, options);
    }
  };
  const limiter = createLiveObservationPublicRequestRateLimiter({
    now: () => START_MS,
    runtimeCache
  });

  await limiter.consume({ observationId: OBSERVATION_ID, ipAddress: IP_ADDRESS });

  assert.equal(keys.length, 1);
  assert.equal(keys[0]?.includes(IP_ADDRESS), false);
  assert.equal(
    keys[0]?.includes(createHash("sha256").update(IP_ADDRESS, "utf8").digest("hex")),
    true
  );
});

test("public request limiter fails closed when production requires Redis but only memory is configured", async () => {
  const limiter = createLiveObservationPublicRequestRateLimiter({
    now: () => START_MS,
    requireRedis: true,
    runtimeCache: createInMemoryRuntimeCache({ cleanupIntervalMs: null, now: () => START_MS })
  });

  assert.deepEqual(
    await limiter.consume({ observationId: OBSERVATION_ID, ipAddress: IP_ADDRESS }),
    { kind: "unavailable" }
  );
});

test("public request limiter fails closed before counting when required Redis is unavailable", async () => {
  let incrementCalls = 0;
  const baseCache = createInMemoryRuntimeCache({ cleanupIntervalMs: null, now: () => START_MS });
  const runtimeCache: RuntimeCache = {
    ...baseCache,
    backend: "redis",
    async isAvailable() {
      return false;
    },
    async increment(entryKey, delta, options) {
      incrementCalls += 1;
      return baseCache.increment(entryKey, delta, options);
    }
  };
  const limiter = createLiveObservationPublicRequestRateLimiter({
    now: () => START_MS,
    requireRedis: true,
    runtimeCache
  });

  assert.deepEqual(
    await limiter.consume({ observationId: OBSERVATION_ID, ipAddress: IP_ADDRESS }),
    { kind: "unavailable" }
  );
  assert.equal(incrementCalls, 0);
});

test("public request limiter rejects a required Redis increment that degraded to fallback cache", async () => {
  let degradationCount = 0;
  const baseCache = createInMemoryRuntimeCache({ cleanupIntervalMs: null, now: () => START_MS });
  const runtimeCache: RuntimeCache = {
    ...baseCache,
    backend: "redis",
    getDegradationCount() {
      return degradationCount;
    },
    async increment(entryKey, delta, options) {
      degradationCount += 1;
      return baseCache.increment(entryKey, delta, options);
    }
  };
  const limiter = createLiveObservationPublicRequestRateLimiter({
    now: () => START_MS,
    requireRedis: true,
    runtimeCache
  });

  assert.deepEqual(
    await limiter.consume({ observationId: OBSERVATION_ID, ipAddress: IP_ADDRESS }),
    { kind: "unavailable" }
  );
});
