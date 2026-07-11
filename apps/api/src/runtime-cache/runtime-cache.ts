export type RuntimeCacheJsonValue =
  | string
  | number
  | boolean
  | null
  | RuntimeCacheJsonValue[]
  | { [key: string]: RuntimeCacheJsonValue };

export type RuntimeCacheEntryKey = {
  readonly namespace: string;
  readonly key: string;
};

export type RuntimeCacheSetOptions = {
  readonly ttlMs: number;
};

export type RuntimeCache = {
  readonly backend: "memory" | "redis";
  isAvailable(): Promise<boolean>;
  getDegradationCount?(): number;
  get<TValue = RuntimeCacheJsonValue>(entryKey: RuntimeCacheEntryKey): Promise<TValue | null>;
  set(
    entryKey: RuntimeCacheEntryKey,
    value: RuntimeCacheJsonValue,
    options: RuntimeCacheSetOptions
  ): Promise<void>;
  delete(entryKey: RuntimeCacheEntryKey): Promise<boolean>;
  increment(
    entryKey: RuntimeCacheEntryKey,
    delta: number,
    options: RuntimeCacheSetOptions
  ): Promise<number>;
  setIfAbsent(
    entryKey: RuntimeCacheEntryKey,
    value: RuntimeCacheJsonValue,
    options: RuntimeCacheSetOptions
  ): Promise<boolean>;
};
