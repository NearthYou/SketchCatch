import type { RuntimeEnv } from "../config/env.js";
import { getRuntimeEnv } from "../config/env.js";
import { createInMemoryRuntimeCache } from "./in-memory-runtime-cache.js";
import { createRedisRuntimeCache } from "./redis-runtime-cache.js";
import type { RuntimeCache } from "./runtime-cache.js";

export type CreateRuntimeCacheFromEnvOptions = {
  readonly env?: RuntimeEnv | undefined;
  readonly createInMemoryCache?: (() => RuntimeCache) | undefined;
  readonly createRedisCache?: ((redisUrl: string) => RuntimeCache) | undefined;
  readonly onDegraded?: ((error: unknown) => void) | undefined;
};

export function createRuntimeCacheFromEnv(
  options: CreateRuntimeCacheFromEnvOptions = {}
): RuntimeCache {
  const env = options.env ?? getRuntimeEnv();
  const createMemoryCache = options.createInMemoryCache ?? createInMemoryRuntimeCache;
  const redisUrl = env.redisUrl?.trim();

  if (!redisUrl || env.nodeEnv === "test") {
    return createMemoryCache();
  }

  return options.createRedisCache
    ? options.createRedisCache(redisUrl)
    : createRedisRuntimeCache({
        fallbackCache: createMemoryCache(),
        onDegraded: options.onDegraded,
        redisUrl
      });
}
