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
      readonly expiration: {
        readonly type: "PX";
        readonly value: number;
      };
    }
  ): Promise<unknown>;
  del(key: string): Promise<number>;
  on?(event: "error", listener: (error: unknown) => void): unknown;
};

export type CreateRedisRuntimeCacheOptions = {
  readonly redisUrl: string;
  readonly keyPrefix?: string | undefined;
  readonly fallbackCache?: RuntimeCache | undefined;
  readonly createClient?: ((redisUrl: string) => RedisRuntimeCacheClient) | undefined;
  readonly onDegraded?: ((error: unknown) => void) | undefined;
};

const DEFAULT_REDIS_RUNTIME_CACHE_KEY_PREFIX = "sketchcatch:runtime-cache";

export function createRedisRuntimeCache(options: CreateRedisRuntimeCacheOptions): RuntimeCache {
  const keyPrefix = options.keyPrefix ?? DEFAULT_REDIS_RUNTIME_CACHE_KEY_PREFIX;
  const fallbackCache = options.fallbackCache ?? createInMemoryRuntimeCache();
  const createRedisClient = options.createClient ?? createDefaultRedisClient;
  let client: RedisRuntimeCacheClient | null = null;
  let connectPromise: Promise<RedisRuntimeCacheClient> | null = null;

  return {
    async get<TValue = RuntimeCacheJsonValue>(
      entryKey: RuntimeCacheEntryKey
    ): Promise<TValue | null> {
      return runRedisOperation(
        async (redisClient) => {
          const valueJson = await redisClient.get(createRedisCacheKey(keyPrefix, entryKey));

          if (valueJson === null) {
            return fallbackCache.get<TValue>(entryKey);
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
    }
  };

  async function getConnectedClient(): Promise<RedisRuntimeCacheClient> {
    if (client?.isOpen) {
      return client;
    }

    if (connectPromise) {
      return connectPromise;
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
