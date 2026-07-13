import { createHash } from "node:crypto";
import type { RuntimeCache } from "../runtime-cache/index.js";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
const CACHE_NAMESPACE = "live-observation-public-request-rate-limit";

export type LiveObservationPublicRequestRateLimitResult =
  | { kind: "allowed" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "unavailable" };

export type LiveObservationPublicRequestRateLimiter = Readonly<{
  consume(input: {
    observationId: string;
    ipAddress: string;
  }): Promise<LiveObservationPublicRequestRateLimitResult>;
}>;

export function createLiveObservationPublicRequestRateLimiter(options: {
  runtimeCache: RuntimeCache;
  now?: () => number;
  requireRedis?: boolean;
}): LiveObservationPublicRequestRateLimiter {
  const now = options.now ?? Date.now;

  return Object.freeze({
    async consume(input) {
      if (options.requireRedis === true && options.runtimeCache.backend !== "redis") {
        return { kind: "unavailable" };
      }
      if (options.requireRedis === true) {
        try {
          if (!(await options.runtimeCache.isAvailable())) {
            return { kind: "unavailable" };
          }
        } catch {
          return { kind: "unavailable" };
        }
      }

      const evaluatedAtMs = now();
      const windowNumber = Math.floor(evaluatedAtMs / WINDOW_MS);
      const windowEndsAtMs = (windowNumber + 1) * WINDOW_MS;
      const ttlMs = Math.max(1, windowEndsAtMs - evaluatedAtMs);
      const ipFingerprint = createHash("sha256").update(input.ipAddress, "utf8").digest("hex");
      const degradationCountBefore = options.runtimeCache.getDegradationCount?.();
      let count: number;
      try {
        count = await options.runtimeCache.increment(
          {
            namespace: CACHE_NAMESPACE,
            key: `${input.observationId}:${ipFingerprint}:${windowNumber}`
          },
          1,
          { ttlMs }
        );
      } catch {
        return { kind: "unavailable" };
      }
      if (
        options.requireRedis === true &&
        degradationCountBefore !== undefined &&
        options.runtimeCache.getDegradationCount?.() !== degradationCountBefore
      ) {
        return { kind: "unavailable" };
      }

      if (count <= MAX_REQUESTS_PER_WINDOW) {
        return { kind: "allowed" };
      }

      return {
        kind: "rate_limited",
        retryAfterSeconds: Math.ceil(ttlMs / 1_000)
      };
    }
  });
}
