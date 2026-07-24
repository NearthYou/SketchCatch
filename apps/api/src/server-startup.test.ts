import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseMigrationStatus } from "./db/migration-readiness.js";
import { startApiServer, type StartupApp } from "./server-startup.js";

const currentMigrationStatus: DatabaseMigrationStatus = {
  appliedMigrationHead: "0002_second",
  pendingMigrationCount: 0,
  pendingMigrationTags: [],
  requiredMigrationHead: "0002_second",
  state: "current",
  unexpectedAppliedMigrationCount: 0
};

test("verifies database migrations before optional startup warm-ups and listen", async () => {
  const calls: string[] = [];
  const app = createStartupApp(calls);

  await startApiServer({
    app,
    assertDatabaseMigrationsCurrent: async () => {
      calls.push("migrations");
      return currentMigrationStatus;
    },
    host: "127.0.0.1",
    port: 4000,
    recoverInterruptedDeployments: async () => {
      calls.push("recover");
      return createRecoveryResult();
    },
    requireDatabaseUrl: () => {
      calls.push("database-url");
      return "configured";
    },
    validateAwsCredentialSource: () => {
      calls.push("aws-credentials");
    },
    warmTerraformPluginCache: async () => {
      calls.push("terraform-warmup");
      return {
        command: ["terraform", "init"],
        exitCode: 0,
        stderr: "",
        stdout: "",
        timedOut: false
      };
    },
    warmTrivyCheckBundle: async () => {
      calls.push("trivy-warmup");
    }
  });

  assert.deepEqual(calls, [
    "aws-credentials",
    "database-url",
    "migrations",
    "terraform-warmup",
    "trivy-warmup",
    "recover",
    "listen"
  ]);
});

test("does not listen when the migration readiness check fails", async () => {
  const calls: string[] = [];
  const app = createStartupApp(calls);

  await assert.rejects(
    startApiServer({
      app,
      assertDatabaseMigrationsCurrent: async () => {
        calls.push("migrations");
        throw new Error("Database schema is behind this API");
      },
      host: "127.0.0.1",
      port: 4000,
      requireDatabaseUrl: () => {
        calls.push("database-url");
        return "configured";
      },
      validateAwsCredentialSource: () => {
        calls.push("aws-credentials");
      },
      warmTerraformPluginCache: async () => {
        calls.push("terraform-warmup");
        return {
          command: ["terraform", "init"],
          exitCode: 0,
          stderr: "",
          stdout: "",
          timedOut: false
        };
      }
    }),
    /Database schema is behind this API/
  );

  assert.deepEqual(calls, ["aws-credentials", "database-url", "migrations"]);
});

function createStartupApp(calls: string[]): StartupApp {
  return {
    async listen() {
      calls.push("listen");
    },
    log: {
      info() {},
      warn() {}
    }
  };
}

function createRecoveryResult() {
  return {
    activeDeploymentCount: 0,
    deferredInspectionCount: 0,
    failedJobCount: 0,
    recoveredDeploymentCount: 0,
    recoveryRetryCount: 0
  };
}
