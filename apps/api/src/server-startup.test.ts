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
    validateAwsCredentialSource: () => {},
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
    validateAwsCredentialSource: () => {},
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
    validateAwsCredentialSource: () => {},
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

test("startApiServer validates the AWS credential source before Terraform warmup", async () => {
  const events: string[] = [];

  await assert.rejects(
    () =>
      startApiServer({
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
        validateAwsCredentialSource: () => {
          events.push("validate");
          throw new Error("static AWS credentials are configured");
        },
        warmTerraformPluginCache: async () => {
          events.push("warmup");
          return successfulWarmupResult;
        },
        recoverInterruptedDeployments: async () => {
          events.push("recover");
          return [];
        }
      }),
    /static AWS credentials are configured/
  );

  assert.deepEqual(events, ["validate"]);
});

test("startApiServer rejects static AWS credentials with the default startup guard", async () => {
  const originalAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const events: string[] = [];
  process.env.AWS_ACCESS_KEY_ID = "static-access-key-id";

  try {
    await assert.rejects(
      () =>
        startApiServer({
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
        }),
      /Static AWS credentials are not allowed/
    );

    assert.deepEqual(events, []);
  } finally {
    restoreEnvValue("AWS_ACCESS_KEY_ID", originalAccessKeyId);
  }
});

function restoreEnvValue(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
