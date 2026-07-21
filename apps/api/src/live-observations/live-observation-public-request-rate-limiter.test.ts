import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryRuntimeCache } from "../runtime-cache/index.js";
import { createLiveObservationPublicRequestRateLimiter } from "./live-observation-public-request-rate-limiter.js";

test("limits one public IP to 20 requests per second with a one-second cooldown", async () => {
  let nowMs = 10_000;
  const now = () => nowMs;
  const limiter = createLiveObservationPublicRequestRateLimiter({
    now,
    runtimeCache: createInMemoryRuntimeCache({
      cleanupIntervalMs: null,
      now
    })
  });
  const input = {
    ipAddress: "203.0.113.10",
    observationId: "11111111-1111-4111-8111-111111111111"
  };

  for (let requestCount = 1; requestCount <= 20; requestCount += 1) {
    assert.deepEqual(await limiter.consume(input), { kind: "allowed" });
  }

  assert.deepEqual(await limiter.consume(input), {
    kind: "rate_limited",
    retryAfterSeconds: 1
  });

  nowMs = 11_000;
  assert.deepEqual(await limiter.consume(input), { kind: "allowed" });
});

test("limits sustained public traffic to 120 requests per ten seconds", async () => {
  let nowMs = 20_000;
  const now = () => nowMs;
  const limiter = createLiveObservationPublicRequestRateLimiter({
    now,
    runtimeCache: createInMemoryRuntimeCache({
      cleanupIntervalMs: null,
      now
    })
  });
  const input = {
    ipAddress: "203.0.113.11",
    observationId: "22222222-2222-4222-8222-222222222222"
  };

  for (let requestCount = 0; requestCount < 120; requestCount += 1) {
    nowMs = 20_000 + Math.floor(requestCount / 12) * 1_000;
    assert.deepEqual(await limiter.consume(input), { kind: "allowed" });
  }

  assert.deepEqual(await limiter.consume(input), {
    kind: "rate_limited",
    retryAfterSeconds: 1
  });

  nowMs = 30_000;
  assert.deepEqual(await limiter.consume(input), { kind: "allowed" });
});
