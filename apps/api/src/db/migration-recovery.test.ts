import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  createPostgresMigrationRecoveryStore,
  loadRuntimeMigrations,
  planKnownSkippedMigrationRepairs,
  repairKnownSkippedMigrations,
  type AppliedMigrationRecord,
  type MigrationRecoveryStore,
  type RuntimeMigration
} from "./migration-recovery.js";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

const releasePlaneMigration: RuntimeMigration = {
  folderMillis: 1784160000002,
  hash: "release-plane-hash",
  sql: ["ALTER TABLE projects ADD COLUMN deletion_started_at timestamptz;"],
  tag: "0044_github_codebuild_release_plane"
};

test("plans the skipped 0044 repair after production has already reached 0046", () => {
  const appliedMigrations: AppliedMigrationRecord[] = [
    { createdAt: 1784160000001, hash: "github-installation-hash" },
    { createdAt: 1784246400000, hash: "artifact-registry-hash" },
    { createdAt: 1784246400001, hash: "runtime-convergence-hash" }
  ];

  assert.deepEqual(
    planKnownSkippedMigrationRepairs({
      appliedMigrations,
      migrations: [releasePlaneMigration]
    }),
    [releasePlaneMigration]
  );
});

test("does not repair 0044 when a fresh database already recorded it", () => {
  assert.deepEqual(
    planKnownSkippedMigrationRepairs({
      appliedMigrations: [
        {
          createdAt: releasePlaneMigration.folderMillis,
          hash: releasePlaneMigration.hash
        },
        { createdAt: 1784246400001, hash: "runtime-convergence-hash" }
      ],
      migrations: [releasePlaneMigration]
    }),
    []
  );
});

test("applies and records the skipped migration before normal Drizzle migration continues", async () => {
  const applied: RuntimeMigration[] = [];
  const store: MigrationRecoveryStore = {
    async applyMigration(migration) {
      applied.push(migration);
    },
    async listAppliedMigrations() {
      return [
        { createdAt: 1784246400000, hash: "artifact-registry-hash" },
        { createdAt: 1784246400001, hash: "runtime-convergence-hash" }
      ];
    }
  };

  const repairedTags = await repairKnownSkippedMigrations({
    migrations: [releasePlaneMigration],
    store
  });

  assert.deepEqual(applied, [releasePlaneMigration]);
  assert.deepEqual(repairedTags, [releasePlaneMigration.tag]);
});

test("loads the trusted 0044 SQL and journal timestamp as one runtime migration", () => {
  const migration = loadRuntimeMigrations(migrationsFolder).find(
    (candidate) => candidate.tag === releasePlaneMigration.tag
  );

  assert.ok(migration);
  assert.equal(migration.folderMillis, releasePlaneMigration.folderMillis);
  assert.match(migration.hash, /^[a-f\d]{64}$/u);
  assert(migration.sql.some((statement) => statement.includes('"deletion_started_at"')));
});

test("Postgres recovery store executes SQL and records its original Drizzle identity atomically", async () => {
  const queries: Array<{ readonly text: string; readonly values?: readonly unknown[] }> = [];
  let releasedClients = 0;
  const store = createPostgresMigrationRecoveryStore(async () => ({
    async query(text, values) {
      queries.push({ text, ...(values ? { values } : {}) });
      if (text.includes("to_regclass")) {
        return { rows: [{ migration_table: "drizzle.__drizzle_migrations" }] };
      }
      if (text.includes("SELECT hash, created_at")) {
        return {
          rows: [{ created_at: "1784246400001", hash: "runtime-convergence-hash" }]
        };
      }
      return { rows: [] };
    },
    release() {
      releasedClients += 1;
    }
  }));

  assert.deepEqual(await store.listAppliedMigrations(), [
    { createdAt: 1784246400001, hash: "runtime-convergence-hash" }
  ]);
  await store.applyMigration(releasePlaneMigration);

  assert.deepEqual(
    queries.slice(-4).map((query) => query.text),
    [
      "BEGIN",
      releasePlaneMigration.sql[0],
      'INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at") VALUES ($1, $2)',
      "COMMIT"
    ]
  );
  assert.deepEqual(queries.at(-2)?.values, [
    releasePlaneMigration.hash,
    releasePlaneMigration.folderMillis
  ]);
  assert.equal(releasedClients, 2);
});

test("runtime migration repairs skipped 0044 before invoking the Drizzle migrator", () => {
  const source = readFileSync(new URL("./migrate.ts", import.meta.url), "utf8");
  const repairPosition = source.indexOf("repairKnownSkippedMigrations");
  const drizzlePosition = source.indexOf("await migrate(");

  assert(repairPosition > 0);
  assert(drizzlePosition > repairPosition);
});
