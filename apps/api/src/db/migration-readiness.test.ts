import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDatabaseMigrationStatusCurrent,
  assertPostgresDatabaseMigrationsCurrent,
  DatabaseMigrationReadinessError,
  DatabaseMigrationRequiredError,
  getDatabaseMigrationStatus,
  getRequiredDatabaseMigrationHead
} from "./migration-readiness.js";
import type { RuntimeMigration } from "./migration-recovery.js";

const migrations: RuntimeMigration[] = [
  {
    folderMillis: 1000,
    hash: "migration-one",
    sql: ["SELECT 1;"],
    tag: "0001_first"
  },
  {
    folderMillis: 2000,
    hash: "migration-two",
    sql: ["SELECT 2;"],
    tag: "0002_second"
  }
];

test("reports the local migration head only when the applied history is current", () => {
  const status = getDatabaseMigrationStatus({
    appliedMigrations: [
      { createdAt: 1000, hash: "migration-one" },
      { createdAt: 2000, hash: "migration-two" }
    ],
    migrations
  });

  assert.deepEqual(status, {
    appliedMigrationHead: "0002_second",
    legacyAppliedMigrationCount: 0,
    pendingMigrationCount: 0,
    pendingMigrationTags: [],
    requiredMigrationHead: "0002_second",
    state: "current",
    unexpectedAppliedMigrationCount: 0
  });
  assert.equal(getRequiredDatabaseMigrationHead(migrations), "0002_second");
});

test("loads the packaged migration journal from the API runtime directory", () => {
  assert.match(getRequiredDatabaseMigrationHead() ?? "", /^\d{4}_[a-z0-9_]+$/u);
});

test("keeps the contiguous applied head and identifies a missing migration", () => {
  const status = getDatabaseMigrationStatus({
    appliedMigrations: [{ createdAt: 1000, hash: "migration-one" }],
    migrations
  });

  assert.deepEqual(status, {
    appliedMigrationHead: "0001_first",
    legacyAppliedMigrationCount: 0,
    pendingMigrationCount: 1,
    pendingMigrationTags: ["0002_second"],
    requiredMigrationHead: "0002_second",
    state: "behind",
    unexpectedAppliedMigrationCount: 0
  });
  assert.throws(
    () => assertDatabaseMigrationStatusCurrent(status),
    (error: unknown) => {
      assert(error instanceof DatabaseMigrationRequiredError);
      assert.match(error.message, /db:migrate:runtime/);
      assert.match(error.message, /0002_second/);
      return true;
    }
  );
});

test("does not accept a database migration record that the local API does not know", () => {
  const status = getDatabaseMigrationStatus({
    appliedMigrations: [
      { createdAt: 1000, hash: "migration-one" },
      { createdAt: 2000, hash: "migration-two" },
      { createdAt: 3000, hash: "newer-api-migration" }
    ],
    migrations
  });

  assert.equal(status.state, "diverged");
  assert.equal(status.unexpectedAppliedMigrationCount, 1);
  assert.throws(() => assertDatabaseMigrationStatusCurrent(status), DatabaseMigrationRequiredError);
});

test("keeps a fully applied schema startable when only an older legacy migration record remains", () => {
  const status = getDatabaseMigrationStatus({
    appliedMigrations: [
      { createdAt: 500, hash: "retired-legacy-migration" },
      { createdAt: 1000, hash: "migration-one" },
      { createdAt: 2000, hash: "migration-two" }
    ],
    migrations
  });

  assert.equal(status.state, "current");
  assert.equal(status.unexpectedAppliedMigrationCount, 0);
  assert.equal(status.legacyAppliedMigrationCount, 1);
  assert.doesNotThrow(() => assertDatabaseMigrationStatusCurrent(status));
});

test("does not include database connection details when readiness cannot be checked", async () => {
  const connectionDetail = "postgresql://admin:super-secret@db.example.com:5432/sketchcatch";
  const pool = {
    async connect() {
      throw new Error(connectionDetail);
    }
  };

  await assert.rejects(
    assertPostgresDatabaseMigrationsCurrent(pool as never, { migrations }),
    (error: unknown) => {
      assert(error instanceof DatabaseMigrationReadinessError);
      assert.doesNotMatch(error.message, /postgresql|super-secret|db\.example\.com/u);
      return true;
    }
  );
});
