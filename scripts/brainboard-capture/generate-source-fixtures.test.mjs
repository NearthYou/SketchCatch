import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const generatorPath = path.join(
  repositoryRoot,
  "scripts/brainboard-capture/generate-source-fixtures.mjs"
);
const subject = await import("./generate-source-fixtures.mjs").catch(() => ({}));

test("targeted config check loads and checks only the requested independent batch", () => {
  const result = spawnSync(
    process.execPath,
    [generatorPath, "--check", "--config", "batch-01-02.mjs"],
    { cwd: repositoryRoot, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Checked 2 deterministic Brainboard source fixtures from batch-01-02\.mjs/u);
});

test("generator rejects unknown options instead of silently checking all batches", () => {
  const result = spawnSync(process.execPath, [generatorPath, "--check", "--typo"], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown option: --typo/u);
});

test("fixture generation rejects tampered raw capture bytes before parsing", () => {
  assert.equal(typeof subject.readVerifiedRawCapture, "function");
  const index = JSON.parse(
    readFileSync(
      path.join(
        repositoryRoot,
        "docs/gg/feat-infrastructure-template/brainboard-capture-index.json"
      ),
      "utf8"
    )
  );
  const entry = index.templates[0];
  const sourcePath = path.join(
    repositoryRoot,
    "docs/gg/feat-infrastructure-template/brainboard-captures",
    entry.file
  );
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "brainboard-fixture-generator-"));
  const temporaryCapturePath = path.join(temporaryDirectory, entry.file);
  try {
    writeFileSync(temporaryCapturePath, readFileSync(sourcePath));
    assert.equal(
      subject.readVerifiedRawCapture(temporaryCapturePath, entry.captureSha256).id,
      entry.id
    );
    writeFileSync(temporaryCapturePath, `${readFileSync(temporaryCapturePath, "utf8")}\n`);
    assert.throws(
      () => subject.readVerifiedRawCapture(temporaryCapturePath, entry.captureSha256),
      /Raw capture SHA-256 mismatch/u
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
