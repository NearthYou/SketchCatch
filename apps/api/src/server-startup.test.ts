import { test } from "node:test";
import assert from "node:assert/strict";
import { startApiServer } from "./server-startup.js";
import type { TerraformRunResult } from "./deployments/terraform-runner.js";

const successfulWarmupResult: TerraformRunResult = {
  command: ["terraform", "init"],
  exitCode: 0,
  stdout: "",
  stderr: "",
  timedOut: false
};

test("startApiServer warms the Terraform plugin cache before listening", async () => {
  const events: string[] = [];

  await startApiServer({
    app: {
      listen: async () => {
        events.push("listen");
      },
      log: {
        info: () => {},
        warn: () => {}
      }
    },
    host: "127.0.0.1",
    port: 4000,
    warmTerraformPluginCache: async () => {
      events.push("warmup");
      return successfulWarmupResult;
    },
    recoverInterruptedDeployments: async () => {
      events.push("recover");
      return [];
    }
  });

  assert.deepEqual(events, ["warmup", "recover", "listen"]);
});

test("startApiServer keeps listening when Terraform plugin cache warmup fails", async () => {
  const events: string[] = [];

  await startApiServer({
    app: {
      listen: async () => {
        events.push("listen");
      },
      log: {
        info: () => {},
        warn: () => {
          events.push("warn");
        }
      }
    },
    host: "127.0.0.1",
    port: 4000,
    warmTerraformPluginCache: async () => ({
      command: ["terraform", "init"],
      exitCode: 1,
      stdout: "",
      stderr: "provider registry unavailable",
      timedOut: false
    }),
    recoverInterruptedDeployments: async () => {
      events.push("recover");
      return [];
    }
  });

  assert.deepEqual(events, ["warn", "recover", "listen"]);
});

test("startApiServer keeps listening when Terraform plugin cache warmup throws", async () => {
  const events: string[] = [];

  await startApiServer({
    app: {
      listen: async () => {
        events.push("listen");
      },
      log: {
        info: () => {},
        warn: () => {
          events.push("warn");
        }
      }
    },
    host: "127.0.0.1",
    port: 4000,
    warmTerraformPluginCache: async () => {
      throw new Error("terraform is unavailable");
    },
    recoverInterruptedDeployments: async () => {
      events.push("recover");
      return [];
    }
  });

  assert.deepEqual(events, ["warn", "recover", "listen"]);
});
