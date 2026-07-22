import assert from "node:assert/strict";
import test from "node:test";
import { findAppendOnlyMigrationHistoryFailures } from "./db-migration-history.mjs";

const deployedHistory = [
  { tag: "0043_github_installation_connections", when: 1784160000001 },
  { tag: "0045_application_artifact_registry", when: 1784246400000 },
  { tag: "0046_runtime_convergence", when: 1784246400001 }
];

test("rejects a migration inserted behind the deployed migration timestamp", () => {
  const failures = findAppendOnlyMigrationHistoryFailures(deployedHistory, [
    deployedHistory[0],
    { tag: "0044_github_codebuild_release_plane", when: 1784160000002 },
    ...deployedHistory.slice(1)
  ]);

  assert.deepEqual(failures, [
    "0044_github_codebuild_release_plane was inserted at 1784160000002, not after deployed migration timestamp 1784246400001"
  ]);
});

test("accepts an explicitly declared historical repair identity", () => {
  const repair = {
    tag: "0044_github_codebuild_release_plane",
    when: 1784160000002
  };

  assert.deepEqual(
    findAppendOnlyMigrationHistoryFailures(
      deployedHistory,
      [deployedHistory[0], repair, ...deployedHistory.slice(1)],
      { allowedHistoricalInsertions: [repair] }
    ),
    []
  );
});

test("does not allow a historical repair with a different timestamp", () => {
  const declaredRepair = {
    tag: "0044_github_codebuild_release_plane",
    when: 1784160000002
  };
  const changedRepair = { ...declaredRepair, when: declaredRepair.when + 1 };

  assert.deepEqual(
    findAppendOnlyMigrationHistoryFailures(
      deployedHistory,
      [deployedHistory[0], changedRepair, ...deployedHistory.slice(1)],
      { allowedHistoricalInsertions: [declaredRepair] }
    ),
    [
      "0044_github_codebuild_release_plane was inserted at 1784160000003, not after deployed migration timestamp 1784246400001"
    ]
  );
});

test("rejects removing or retimestamping an existing migration", () => {
  const failures = findAppendOnlyMigrationHistoryFailures(deployedHistory, [
    deployedHistory[0],
    { tag: deployedHistory[1].tag, when: deployedHistory[1].when + 10 }
  ]);

  assert.deepEqual(failures, [
    "0045_application_artifact_registry changed timestamp from 1784246400000 to 1784246400010",
    "0046_runtime_convergence was removed from the migration journal"
  ]);
});

test("accepts a new migration appended after the deployed timestamp", () => {
  assert.deepEqual(
    findAppendOnlyMigrationHistoryFailures(deployedHistory, [
      ...deployedHistory,
      { tag: "0047_independent_git_cicd_workflow_runs", when: 1784246400002 }
    ]),
    []
  );
});
