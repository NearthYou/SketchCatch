import { createHash } from "node:crypto";
import type { RuntimeCache } from "../runtime-cache/index.js";

const RATE_WINDOWS = [
  { durationMs: 1_000, maxRequests: 20 },
  { durationMs: 10_000, maxRequests: 120 }
] as const;
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
      const ipFingerprint = createHash("sha256").update(input.ipAddress, "utf8").digest("hex");
      const degradationCountBefore = options.runtimeCache.getDegradationCount?.();
      let evaluations: Array<{
        count: number;
        maxRequests: number;
        ttlMs: number;
      }>;
      try {
        evaluations = await Promise.all(
          RATE_WINDOWS.map(async ({ durationMs, maxRequests }) => {
            const windowNumber = Math.floor(evaluatedAtMs / durationMs);
            const windowEndsAtMs = (windowNumber + 1) * durationMs;
            const ttlMs = Math.max(1, windowEndsAtMs - evaluatedAtMs);
            const count = await options.runtimeCache.increment(
              {
                namespace: CACHE_NAMESPACE,
                key: `${ipFingerprint}:${durationMs}:${windowNumber}`
              },
              1,
              { ttlMs }
            );
            return { count, maxRequests, ttlMs };
          })
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

      const limitedWindows = evaluations.filter(
        ({ count, maxRequests }) => count > maxRequests
      );
      if (limitedWindows.length === 0) {
        return { kind: "allowed" };
      }

      return {
        kind: "rate_limited",
        retryAfterSeconds: Math.max(
          ...limitedWindows.map(({ ttlMs }) => Math.ceil(ttlMs / 1_000))
        )
      };
    }
  });
}
