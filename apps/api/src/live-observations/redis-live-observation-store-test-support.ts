import type { LiveObservationStore } from "./live-observation-store.js";
import {
  createRedisLiveObservationStoreInternal,
  type CreateRedisLiveObservationStoreOptions
} from "./redis-live-observation-store.js";
import { REDIS_LIVE_OBSERVATION_STORE_TEST_SCRIPTS } from "./redis-live-observation-store-scripts.js";

export function createRedisLiveObservationStoreForTest(
  options: CreateRedisLiveObservationStoreOptions & { readonly now: () => number }
): LiveObservationStore {
  return createRedisLiveObservationStoreInternal({
    ...options,
    logicalNow: options.now,
    scripts: REDIS_LIVE_OBSERVATION_STORE_TEST_SCRIPTS
  });
}
