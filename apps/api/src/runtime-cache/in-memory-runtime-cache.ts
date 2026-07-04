import type {
  RuntimeCache,
  RuntimeCacheEntryKey,
  RuntimeCacheJsonValue,
  RuntimeCacheSetOptions
} from "./runtime-cache.js";

type StoredRuntimeCacheValue = {
  readonly valueJson: string;
  readonly expiresAtMs: number;
};

export type CreateInMemoryRuntimeCacheOptions = {
  readonly cleanupIntervalMs?: number | null | undefined;
  readonly now?: () => number;
};

const DEFAULT_CLEANUP_INTERVAL_MS = 60_000;

export function createInMemoryRuntimeCache(
  options: CreateInMemoryRuntimeCacheOptions = {}
): RuntimeCache {
  const entriesByNamespace = new Map<string, Map<string, StoredRuntimeCacheValue>>();
  const now = options.now ?? (() => Date.now());
  const cleanupIntervalMs =
    options.cleanupIntervalMs === undefined
      ? DEFAULT_CLEANUP_INTERVAL_MS
      : options.cleanupIntervalMs;

  if (cleanupIntervalMs !== null) {
    assertPositiveFiniteMs(cleanupIntervalMs, "RuntimeCache cleanupIntervalMs");

    const cleanupTimer = setInterval(() => {
      deleteExpiredEntries(entriesByNamespace, now());
    }, cleanupIntervalMs);

    (cleanupTimer as { unref?: () => void }).unref?.();
  }

  return {
    async get<TValue = RuntimeCacheJsonValue>(
      entryKey: RuntimeCacheEntryKey
    ): Promise<TValue | null> {
      const namespaceEntries = entriesByNamespace.get(entryKey.namespace);
      const storedValue = namespaceEntries?.get(entryKey.key);

      if (!storedValue) {
        return null;
      }

      if (storedValue.expiresAtMs <= now()) {
        namespaceEntries?.delete(entryKey.key);
        deleteNamespaceIfEmpty(entriesByNamespace, entryKey.namespace);
        return null;
      }

      return JSON.parse(storedValue.valueJson) as TValue;
    },

    async set(
      entryKey: RuntimeCacheEntryKey,
      value: RuntimeCacheJsonValue,
      options: RuntimeCacheSetOptions
    ): Promise<void> {
      assertPositiveFiniteMs(options.ttlMs, "RuntimeCache ttlMs");

      const currentTimeMs = now();
      deleteExpiredEntries(entriesByNamespace, currentTimeMs);
      const namespaceEntries = getOrCreateNamespace(entriesByNamespace, entryKey.namespace);

      namespaceEntries.set(entryKey.key, {
        expiresAtMs: currentTimeMs + options.ttlMs,
        valueJson: serializeRuntimeCacheValue(value)
      });
    },

    async delete(entryKey: RuntimeCacheEntryKey): Promise<boolean> {
      const namespaceEntries = entriesByNamespace.get(entryKey.namespace);
      const deleted = namespaceEntries?.delete(entryKey.key) ?? false;

      deleteNamespaceIfEmpty(entriesByNamespace, entryKey.namespace);

      return deleted;
    }
  };
}

function getOrCreateNamespace(
  entriesByNamespace: Map<string, Map<string, StoredRuntimeCacheValue>>,
  namespace: string
): Map<string, StoredRuntimeCacheValue> {
  const existingEntries = entriesByNamespace.get(namespace);

  if (existingEntries) {
    return existingEntries;
  }

  const namespaceEntries = new Map<string, StoredRuntimeCacheValue>();

  entriesByNamespace.set(namespace, namespaceEntries);

  return namespaceEntries;
}

function deleteNamespaceIfEmpty(
  entriesByNamespace: Map<string, Map<string, StoredRuntimeCacheValue>>,
  namespace: string
): void {
  if ((entriesByNamespace.get(namespace)?.size ?? 0) === 0) {
    entriesByNamespace.delete(namespace);
  }
}

function deleteExpiredEntries(
  entriesByNamespace: Map<string, Map<string, StoredRuntimeCacheValue>>,
  nowMs: number
): void {
  for (const [namespace, namespaceEntries] of entriesByNamespace) {
    for (const [key, storedValue] of namespaceEntries) {
      if (storedValue.expiresAtMs <= nowMs) {
        namespaceEntries.delete(key);
      }
    }

    deleteNamespaceIfEmpty(entriesByNamespace, namespace);
  }
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
