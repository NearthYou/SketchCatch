import assert from "node:assert/strict";
import { test } from "node:test";
import type { RuntimeEnv } from "../config/env.js";
import { createInMemoryRuntimeCache } from "../runtime-cache/index.js";
import { createLiveObservationV2Runtime } from "./live-observation-v2-runtime.js";

test("production Live Observation runtime accepts its Redis key namespace", () => {
  assert.doesNotThrow(() =>
    createLiveObservationV2Runtime({
      getDatabaseClient() {
        throw new Error("database access is not expected during runtime assembly");
      },
      keyring: {
        current: {
          kid: "production-2026-07-15",
          secret: Buffer.alloc(32, 0x41).toString("base64url")
        }
      },
      runtimeCache: createInMemoryRuntimeCache({ cleanupIntervalMs: null }),
      runtimeEnv: {
        nodeEnv: "production",
        redisUrl: "rediss://cache.example.test:6379",
        sketchcatchPublicBaseUrl: "https://sketchcatch.example"
      } as RuntimeEnv
    })
  );
});
