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
  get<TValue extends RuntimeCacheJsonValue = RuntimeCacheJsonValue>(
    entryKey: RuntimeCacheEntryKey
  ): Promise<TValue | null>;
  set(
    entryKey: RuntimeCacheEntryKey,
    value: RuntimeCacheJsonValue,
    options: RuntimeCacheSetOptions
  ): Promise<void>;
  delete(entryKey: RuntimeCacheEntryKey): Promise<boolean>;
};
