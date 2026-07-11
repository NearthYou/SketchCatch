import { createClient } from "redis";
import { createInMemoryRuntimeCache } from "./in-memory-runtime-cache.js";
import type {
  RuntimeCache,
  RuntimeCacheEntryKey,
  RuntimeCacheJsonValue,
  RuntimeCacheSetOptions
} from "./runtime-cache.js";

export type RedisRuntimeCacheClient = {
  readonly isOpen: boolean;
  connect(): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options: {
      readonly condition?: "NX" | undefined;
      readonly expiration: {
        readonly type: "PX";
        readonly value: number;
      };
    }
  ): Promise<"OK" | null | unknown>;
  del(key: string): Promise<number>;
  eval(
    script: string,
    options: {
      readonly arguments: readonly string[];
      readonly keys: readonly string[];
    }
  ): Promise<unknown>;
  ping(): Promise<string>;
  on?(event: "error", listener: (error: unknown) => void): unknown;
};

export type CreateRedisRuntimeCacheOptions = {
  readonly redisUrl: string;
  readonly keyPrefix?: string | undefined;
  readonly fallbackCache?: RuntimeCache | undefined;
  readonly createClient?: ((redisUrl: string) => RedisRuntimeCacheClient) | undefined;
  readonly onDegraded?: ((error: unknown) => void) | undefined;
  readonly connectCooldownMs?: number | undefined;
  readonly now?: (() => number) | undefined;
};

const DEFAULT_REDIS_RUNTIME_CACHE_KEY_PREFIX = "sketchcatch:runtime-cache";
const DEFAULT_REDIS_CONNECT_COOLDOWN_MS = 10_000;
const REDIS_ATOMIC_INCREMENT_WITH_TTL_SCRIPT = `
local nextValue = redis.call('INCRBY', KEYS[1], ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return nextValue
`;

export function createRedisRuntimeCache(options: CreateRedisRuntimeCacheOptions): RuntimeCache {
  const keyPrefix = options.keyPrefix ?? DEFAULT_REDIS_RUNTIME_CACHE_KEY_PREFIX;
  const fallbackCache = options.fallbackCache ?? createInMemoryRuntimeCache();
  const createRedisClient = options.createClient ?? createDefaultRedisClient;
  const connectCooldownMs = options.connectCooldownMs ?? DEFAULT_REDIS_CONNECT_COOLDOWN_MS;
  const now = options.now ?? Date.now;
  let client: RedisRuntimeCacheClient | null = null;
  let connectPromise: Promise<RedisRuntimeCacheClient> | null = null;
  let lastConnectErrorAt = Number.NEGATIVE_INFINITY;
  let degradationCount = 0;

  return {
    backend: "redis",

    getDegradationCount(): number {
      return degradationCount;
    },

    async isAvailable(): Promise<boolean> {
      try {
        await (await getConnectedClient()).ping();
        return true;
      } catch (error) {
        degradationCount += 1;
        options.onDegraded?.(error);
        return false;
      }
    },

    async get<TValue = RuntimeCacheJsonValue>(
      entryKey: RuntimeCacheEntryKey
    ): Promise<TValue | null> {
      return runRedisOperation(
        async (redisClient) => {
          const valueJson = await redisClient.get(createRedisCacheKey(keyPrefix, entryKey));

          if (valueJson === null) {
            return null;
          }

          return JSON.parse(valueJson) as TValue;
        },
        () => fallbackCache.get<TValue>(entryKey),
        options.onDegraded
      );
    },

    async set(
      entryKey: RuntimeCacheEntryKey,
      value: RuntimeCacheJsonValue,
      setOptions: RuntimeCacheSetOptions
    ): Promise<void> {
      assertPositiveFiniteMs(setOptions.ttlMs, "RuntimeCache ttlMs");
      const valueJson = serializeRuntimeCacheValue(value);

      await fallbackCache.set(entryKey, value, setOptions);

      await runRedisOperation(
        async (redisClient) => {
          await redisClient.set(createRedisCacheKey(keyPrefix, entryKey), valueJson, {
            expiration: {
              type: "PX",
              value: setOptions.ttlMs
            }
          });
        },
        async () => undefined,
        options.onDegraded
      );
    },

    async delete(entryKey: RuntimeCacheEntryKey): Promise<boolean> {
      const fallbackDeleted = await fallbackCache.delete(entryKey);

      return runRedisOperation(
        async (redisClient) => {
          const redisDeletedCount = await redisClient.del(createRedisCacheKey(keyPrefix, entryKey));

          return fallbackDeleted || redisDeletedCount > 0;
        },
        async () => fallbackDeleted,
        options.onDegraded
      );
    },

    async increment(
      entryKey: RuntimeCacheEntryKey,
      delta: number,
      setOptions: RuntimeCacheSetOptions
    ): Promise<number> {
      assertInteger(delta, "RuntimeCache increment delta");
      assertPositiveFiniteMs(setOptions.ttlMs, "RuntimeCache ttlMs");
      const fallbackValue = await fallbackCache.increment(entryKey, delta, setOptions);

      return runRedisOperation(
        async (redisClient) => {
          const redisKey = createRedisCacheKey(keyPrefix, entryKey);
          const nextValue = await redisClient.eval(
            REDIS_ATOMIC_INCREMENT_WITH_TTL_SCRIPT,
            {
              arguments: [String(delta), String(setOptions.ttlMs)],
              keys: [redisKey]
            }
          );
          assertInteger(nextValue, "Redis Runtime Cache increment result");
          return nextValue;
        },
        async () => fallbackValue,
        options.onDegraded
      );
    },

    async setIfAbsent(
      entryKey: RuntimeCacheEntryKey,
      value: RuntimeCacheJsonValue,
      setOptions: RuntimeCacheSetOptions
    ): Promise<boolean> {
      assertPositiveFiniteMs(setOptions.ttlMs, "RuntimeCache ttlMs");
      const valueJson = serializeRuntimeCacheValue(value);
      const fallbackAccepted = await fallbackCache.setIfAbsent(entryKey, value, setOptions);

      return runRedisOperation(
        async (redisClient) => {
          const result = await redisClient.set(
            createRedisCacheKey(keyPrefix, entryKey),
            valueJson,
            {
              condition: "NX",
              expiration: {
                type: "PX",
                value: setOptions.ttlMs
              }
            }
          );

          return result === "OK";
        },
        async () => fallbackAccepted,
        options.onDegraded
      );
    }
  };

  async function getConnectedClient(): Promise<RedisRuntimeCacheClient> {
    if (client?.isOpen) {
      return client;
    }

    if (connectPromise) {
      return connectPromise;
    }

    if (now() - lastConnectErrorAt < connectCooldownMs) {
      throw new Error("Redis Runtime Cache connection is cooling down after a recent failure");
    }

    client = createRedisClient(options.redisUrl);
    client.on?.("error", options.onDegraded ?? (() => undefined));
    connectPromise = client.connect().then(() => {
      if (!client) {
        throw new Error("Redis Runtime Cache client was not initialized");
      }

      return client;
    });

    try {
      const connectedClient = await connectPromise;
      connectPromise = null;
      return connectedClient;
    } catch (error) {
      connectPromise = null;
      client = null;
      lastConnectErrorAt = now();
      throw error;
    }
  }

  async function runRedisOperation<TValue>(
    operation: (redisClient: RedisRuntimeCacheClient) => Promise<TValue>,
    fallbackOperation: () => Promise<TValue>,
    onDegraded: ((error: unknown) => void) | undefined
  ): Promise<TValue> {
    try {
      return await operation(await getConnectedClient());
    } catch (error) {
      degradationCount += 1;
      onDegraded?.(error);
      return fallbackOperation();
    }
  }
}

export function createRedisCacheKey(
  keyPrefix: string,
  entryKey: RuntimeCacheEntryKey
): string {
  return [
    keyPrefix,
    encodeURIComponent(entryKey.namespace),
    encodeURIComponent(entryKey.key)
  ].join(":");
}

function createDefaultRedisClient(redisUrl: string): RedisRuntimeCacheClient {
  return createClient({
    disableOfflineQueue: true,
    socket: {
      reconnectStrategy: false
    },
    url: redisUrl
  }) as unknown as RedisRuntimeCacheClient;
}

function serializeRuntimeCacheValue(value: RuntimeCacheJsonValue): string {
  const valueJson = JSON.stringify(value);

  if (valueJson === undefined) {
    throw new TypeError("RuntimeCache values must be JSON-serializable");
  }

  return valueJson;
}

function assertPositiveFiniteMs(valueMs: number, label: string): void {
  if (!Number.isFinite(valueMs) || valueMs <= 0) {
    throw new RangeError(`${label} must be a positive finite number`);
  }
}

function assertInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be a safe integer`);
  }
}
