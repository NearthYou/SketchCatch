import { test } from "node:test";
import assert from "node:assert/strict";
import { startApiServer } from "./server-startup.js";
import type { TerraformRunResult } from "./deployments/terraform-runner.js";

process.env.DATABASE_URL = "postgresql://example";

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

test("startApiServer requires DATABASE_URL before Terraform warmup", async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const events: string[] = [];
  delete process.env.DATABASE_URL;

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
          validateAwsCredentialSource: () => {
            events.push("validate-aws");
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
      /DATABASE_URL is required/
    );

    assert.deepEqual(events, ["validate-aws"]);
  } finally {
    restoreEnvValue("DATABASE_URL", originalDatabaseUrl);
  }
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

test("startApiServer reports preserved ECS workers and deferred task inspections", async () => {
  const infoMessages: string[] = [];
  const warningMessages: string[] = [];

  await startApiServer({
    app: {
      listen: async () => {},
      log: {
        info: (messageOrObject, message) => {
          infoMessages.push(message ?? String(messageOrObject));
        },
        warn: (messageOrObject, message) => {
          warningMessages.push(message ?? String(messageOrObject));
        }
      }
    },
    host: "127.0.0.1",
    port: 4000,
    validateAwsCredentialSource: () => {},
    warmTerraformPluginCache: async () => successfulWarmupResult,
    recoverInterruptedDeployments: async () => ({
      activeDeploymentCount: 2,
      deferredInspectionCount: 1,
      failedJobCount: 0,
      recoveryRetryCount: 0,
      recoveredDeploymentCount: 0
    })
  });

  assert.equal(
    infoMessages.includes("Active ECS worker deployments were preserved during API startup"),
    true
  );
  assert.equal(
    warningMessages.includes(
      "ECS worker task inspection was deferred; deployments remain protected"
    ),
    true
  );
  assert.equal(
    warningMessages.includes("Interrupted deployments were marked failed before API startup"),
    false
  );
});

test("startApiServer passes the application logger to deployment recovery", async () => {
  let recoveryLogger: unknown;
  const logger = {
    info: () => {},
    warn: () => {}
  };

  await startApiServer({
    app: {
      listen: async () => {},
      log: logger
    },
    host: "127.0.0.1",
    port: 4000,
    validateAwsCredentialSource: () => {},
    warmTerraformPluginCache: async () => successfulWarmupResult,
    recoverInterruptedDeployments: async (candidateLogger) => {
      recoveryLogger = candidateLogger;
      return [];
    }
  });

  assert.equal(recoveryLogger, logger);
});

test("startApiServer schedules one reconciliation retry for retryable ECS recovery states", async () => {
  let recoverCalls = 0;
  let scheduledDelayMs = 0;
  const scheduledCallbacks: Array<() => Promise<void>> = [];
  const infoMessages: string[] = [];

  await startApiServer({
    app: {
      listen: async () => {},
      log: {
        info: (messageOrObject, message) => {
          infoMessages.push(message ?? String(messageOrObject));
        },
        warn: () => {}
      }
    },
    host: "127.0.0.1",
    port: 4000,
    validateAwsCredentialSource: () => {},
    warmTerraformPluginCache: async () => successfulWarmupResult,
    recoverInterruptedDeployments: async () => {
      recoverCalls += 1;
      return {
        activeDeploymentCount: recoverCalls < 3 ? 1 : 0,
        deferredInspectionCount: 0,
        failedJobCount: recoverCalls < 3 ? 0 : 1,
        recoveryRetryCount: recoverCalls < 3 ? 1 : 0,
        recoveredDeploymentCount: recoverCalls < 3 ? 0 : 1
      };
    },
    scheduleRecoveryRetry: (callback, delayMs) => {
      scheduledCallbacks.push(callback);
      scheduledDelayMs = delayMs;
    }
  });

  assert.equal(scheduledDelayMs, 5 * 60 * 1000);
  assert.equal(scheduledCallbacks.length, 1);
  assert.equal(recoverCalls, 1);
  assert.equal(infoMessages.includes("Deployment startup reconciliation retry scheduled"), true);

  await scheduledCallbacks.shift()?.();

  assert.equal(recoverCalls, 2);
  assert.equal(scheduledCallbacks.length, 1);

  await scheduledCallbacks.shift()?.();

  assert.equal(recoverCalls, 3);
  assert.equal(scheduledCallbacks.length, 0);
});

test("startApiServer retries after startup reconciliation throws", async () => {
  let recoverCalls = 0;
  const scheduledCallbacks: Array<() => Promise<void>> = [];

  await startApiServer({
    app: {
      listen: async () => {},
      log: {
        info: () => {},
        warn: () => {}
      }
    },
    host: "127.0.0.1",
    port: 4000,
    validateAwsCredentialSource: () => {},
    warmTerraformPluginCache: async () => successfulWarmupResult,
    recoverInterruptedDeployments: async () => {
      recoverCalls += 1;

      if (recoverCalls === 1) {
        throw new Error("temporary reconciliation failure");
      }

      return [];
    },
    scheduleRecoveryRetry: (callback) => {
      scheduledCallbacks.push(callback);
    }
  });

  assert.equal(recoverCalls, 1);
  assert.equal(scheduledCallbacks.length, 1);

  await scheduledCallbacks.shift()?.();

  assert.equal(recoverCalls, 2);
  assert.equal(scheduledCallbacks.length, 0);
});
