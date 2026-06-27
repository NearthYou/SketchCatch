import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { loadEnvFiles } from "./load-env.js";

const managedEnvKeys = [
  "SKETCHCATCH_TEST_API_ENV",
  "SKETCHCATCH_TEST_ROOT_ENV",
  "SKETCHCATCH_TEST_SHARED_ENV",
  "SKETCHCATCH_TEST_PROCESS_ENV"
] as const;

afterEach(() => {
  for (const key of managedEnvKeys) {
    delete process.env[key];
  }
});

test("loadEnvFiles prefers API env files and keeps existing process values", () => {
  const originalCwd = process.cwd();
  const workspaceRoot = mkdtempSync(join(tmpdir(), "sketchcatch-env-"));
  const apiRoot = join(workspaceRoot, "apps", "api");

  try {
    mkdirSync(apiRoot, { recursive: true });
    writeFileSync(join(workspaceRoot, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    writeFileSync(
      join(workspaceRoot, ".env"),
      [
        "SKETCHCATCH_TEST_ROOT_ENV=root",
        "SKETCHCATCH_TEST_SHARED_ENV=root",
        "SKETCHCATCH_TEST_PROCESS_ENV=file"
      ].join("\n")
    );
    writeFileSync(
      join(workspaceRoot, ".env.local"),
      ["SKETCHCATCH_TEST_ROOT_ENV=root-local", "SKETCHCATCH_TEST_SHARED_ENV=root-local"].join(
        "\n"
      )
    );
    writeFileSync(
      join(apiRoot, ".env"),
      ["SKETCHCATCH_TEST_API_ENV=api", "SKETCHCATCH_TEST_ROOT_ENV=api"].join("\n")
    );
    writeFileSync(join(apiRoot, ".env.local"), "SKETCHCATCH_TEST_API_ENV=api-local");

    process.env.SKETCHCATCH_TEST_PROCESS_ENV = "process";
    process.chdir(apiRoot);

    loadEnvFiles();

    assert.equal(process.env.SKETCHCATCH_TEST_API_ENV, "api-local");
    assert.equal(process.env.SKETCHCATCH_TEST_ROOT_ENV, "api");
    assert.equal(process.env.SKETCHCATCH_TEST_SHARED_ENV, "root-local");
    assert.equal(process.env.SKETCHCATCH_TEST_PROCESS_ENV, "process");
  } finally {
    process.chdir(originalCwd);
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
