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
  readonly now?: () => number;
};

export function createInMemoryRuntimeCache(
  options: CreateInMemoryRuntimeCacheOptions = {}
): RuntimeCache {
  const entriesByNamespace = new Map<string, Map<string, StoredRuntimeCacheValue>>();
  const now = options.now ?? (() => Date.now());

  return {
    async get<TValue extends RuntimeCacheJsonValue = RuntimeCacheJsonValue>(
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
      assertPositiveTtl(options.ttlMs);

      const namespaceEntries = getOrCreateNamespace(entriesByNamespace, entryKey.namespace);

      namespaceEntries.set(entryKey.key, {
        expiresAtMs: now() + options.ttlMs,
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

function serializeRuntimeCacheValue(value: RuntimeCacheJsonValue): string {
  const valueJson = JSON.stringify(value);

  if (valueJson === undefined) {
    throw new TypeError("RuntimeCache values must be JSON-serializable");
  }

  return valueJson;
}

function assertPositiveTtl(ttlMs: number): void {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RangeError("RuntimeCache ttlMs must be a positive finite number");
  }
}
