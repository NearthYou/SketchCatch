import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultGitCicdMonitoringConfig } from "./git-cicd-monitoring-defaults.js";

test("creates required repository-root defaults without changing a Date timestamp", () => {
  const updatedAt = new Date("2026-07-20T01:02:03.000Z");

  const config = createDefaultGitCicdMonitoringConfig({
    sourceRepositoryId: "source-1",
    defaultBranch: "main",
    updatedAt
  });

  assert.deepEqual(config, {
    sourceRepositoryId: "source-1",
    enabled: true,
    monitorBranch: "main",
    appPath: { mode: "repository_root", path: "." },
    infraPath: { mode: "repository_root", path: "." },
    validationStatus: "required",
    validationMessage: null,
    validatedAt: null,
    updatedAt
  });
  assert.equal(config.updatedAt, updatedAt);
});

test("preserves an ISO timestamp for Delivery profile responses", () => {
  const updatedAt = "2026-07-20T01:02:03.000Z";

  const config = createDefaultGitCicdMonitoringConfig({
    sourceRepositoryId: "source-1",
    defaultBranch: "develop",
    updatedAt
  });

  assert.equal(config.monitorBranch, "develop");
  assert.equal(config.updatedAt, updatedAt);
});
