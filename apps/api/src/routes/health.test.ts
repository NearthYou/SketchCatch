import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { DatabaseMigrationStatus } from "../db/migration-readiness.js";
import {
  apiRuntimeContractVersion,
  createApiRuntimeIdentity
} from "../runtime/runtime-identity.js";
import { registerHealthRoutes } from "./health.js";

const runtimeIdentity = createApiRuntimeIdentity({
  apiRevision: "api-20260724.1",
  databaseMigrationHead: "0057_reverse_engineering_scan_previews"
});

const currentMigrationStatus: DatabaseMigrationStatus = {
  appliedMigrationHead: "0057_reverse_engineering_scan_previews",
  legacyAppliedMigrationCount: 0,
  pendingMigrationCount: 0,
  pendingMigrationTags: [],
  requiredMigrationHead: "0057_reverse_engineering_scan_previews",
  state: "current",
  unexpectedAppliedMigrationCount: 0
};

test("health exposes the safe API runtime contract without querying the database", async () => {
  let databaseQueries = 0;
  const app = Fastify();
  await app.register(registerHealthRoutes, {
    getDatabaseClient: () =>
      ({
        pool: {
          async query() {
            databaseQueries += 1;
            return { rows: [] };
          }
        }
      }) as never,
    getMigrationStatus: async () => currentMigrationStatus,
    runtimeIdentity
  });

  const response = await app.inject({ method: "GET", url: "/health" });
  const proxiedResponse = await app.inject({ method: "GET", url: "/api/health" });
  const expectedBody = {
    status: "ok",
    runtime: runtimeIdentity
  };

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), expectedBody);
  assert.equal(response.headers["x-sketchcatch-runtime-contract"], apiRuntimeContractVersion);
  assert.equal(response.headers["x-sketchcatch-api-revision"], runtimeIdentity.apiRevision);
  assert.equal(
    response.headers["x-sketchcatch-database-migration-head"],
    runtimeIdentity.databaseMigrationHead
  );
  assert.equal(proxiedResponse.statusCode, 200);
  assert.deepEqual(proxiedResponse.json(), expectedBody);
  assert.equal(databaseQueries, 0);

  await app.close();
});

test("database health returns migration readiness separately from API runtime identity", async () => {
  const queries: string[] = [];
  const app = Fastify();
  await app.register(registerHealthRoutes, {
    getDatabaseClient: () =>
      ({
        pool: {
          async query(query: string) {
            queries.push(query);
            return { rows: [] };
          }
        }
      }) as never,
    getMigrationStatus: async () => currentMigrationStatus,
    runtimeIdentity
  });

  const response = await app.inject({ method: "GET", url: "/health/db" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    runtime: runtimeIdentity,
    databaseMigration: currentMigrationStatus
  });
  assert.deepEqual(queries, ["select 1"]);

  await app.close();
});

test("database health does not expose database connection details when it is unavailable", async () => {
  const connectionDetail = "postgresql://admin:super-secret@db.example.com:5432/sketchcatch";
  const app = Fastify();
  await app.register(registerHealthRoutes, {
    getDatabaseClient: () =>
      ({
        pool: {
          async query() {
            throw new Error(connectionDetail);
          }
        }
      }) as never,
    runtimeIdentity
  });

  const response = await app.inject({ method: "GET", url: "/health/db" });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    status: "not_ready",
    runtime: runtimeIdentity,
    databaseMigration: { state: "unavailable" }
  });
  assert.doesNotMatch(response.body, /postgresql|super-secret|db\.example\.com/u);

  await app.close();
});

test("unsafe configured revision values are not reflected by the runtime contract", () => {
  const identity = createApiRuntimeIdentity({
    apiRevision: "postgresql://admin:super-secret@db.example.com/sketchcatch",
    databaseMigrationHead: "0057_reverse_engineering_scan_previews"
  });

  assert.equal(identity.apiRevision, "unconfigured");
  assert.doesNotMatch(identity.apiRevision, /super-secret|db\.example\.com/u);
});
