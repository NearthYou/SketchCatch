import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const capturesDirectory = path.join(
  repositoryRoot,
  "docs/gg/feat-infrastructure-template/brainboard-captures"
);

test("validate-capture CLI validates the full corpus and checks deterministic status", () => {
  const validation = run("scripts/brainboard-capture/validate-capture.mjs");
  assert.equal(validation.status, 0, validation.stderr);
  assert.match(validation.stdout, /Brainboard capture validation: PASS/);
  assert.match(validation.stdout, /templates: 24 \(23 captured, 1 failed\)/);
  assert.match(validation.stdout, /raw parent cycles: 43/);
  assert.match(validation.stdout, /inverted parent links: 59/);

  const statusCheck = run("scripts/brainboard-capture/validate-capture.mjs", "--check-status");
  assert.equal(statusCheck.status, 0, statusCheck.stderr);
  assert.match(statusCheck.stdout, /Capture status is deterministic and current/);
});

test("normalize-capture CLI repairs the full corpus and checks deterministic report", () => {
  const normalization = run("scripts/brainboard-capture/normalize-capture.mjs");
  assert.equal(normalization.status, 0, normalization.stderr);
  assert.match(normalization.stdout, /Brainboard capture normalization: PASS/);
  assert.match(normalization.stdout, /parent repairs: 59 \(40 full, 0 center, 19 root/);
  assert.match(normalization.stdout, /remaining parent cycles: 0/);
  assert.match(normalization.stdout, /parallel edge cardinality: 222 -> 222/);

  const reportCheck = run("scripts/brainboard-capture/normalize-capture.mjs", "--check-report");
  assert.equal(reportCheck.status, 0, reportCheck.stderr);
  assert.match(reportCheck.stdout, /Normalization report is deterministic and current/);
});

test("normalize-capture CLI rejects tampered raw bytes without overwriting a report", (t) => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "brainboard-cli-test-"));
  t.after(() => rmSync(temporaryRoot, { force: true, recursive: true }));
  const temporaryCaptures = path.join(temporaryRoot, "captures");
  const reportPath = path.join(temporaryRoot, "normalization-report.json");
  cpSync(capturesDirectory, temporaryCaptures, { recursive: true });
  appendFileSync(path.join(temporaryCaptures, "training-aws-onboarding.json"), " \n");
  writeFileSync(reportPath, "reviewed-report-must-stay-unchanged\n");

  const result = run(
    "scripts/brainboard-capture/normalize-capture.mjs",
    "--captures-dir",
    temporaryCaptures,
    "--write-report",
    reportPath
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /raw_sha_mismatch|Raw capture SHA-256/);
  assert.equal(readFileSync(reportPath, "utf8"), "reviewed-report-must-stay-unchanged\n");

  const checkResult = run(
    "scripts/brainboard-capture/normalize-capture.mjs",
    "--captures-dir",
    temporaryCaptures,
    "--check-report",
    reportPath
  );
  assert.equal(checkResult.status, 1);
  assert.match(checkResult.stderr, /raw_sha_mismatch|Raw capture SHA-256/);
  assert.doesNotMatch(checkResult.stderr, /stale/i);
  assert.equal(readFileSync(reportPath, "utf8"), "reviewed-report-must-stay-unchanged\n");
});

test("validate-capture CLI never writes status for an invalid corpus", (t) => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "brainboard-status-test-"));
  t.after(() => rmSync(temporaryRoot, { force: true, recursive: true }));
  const temporaryCaptures = path.join(temporaryRoot, "captures");
  const existingStatusPath = path.join(temporaryRoot, "existing-status.json");
  const missingStatusPath = path.join(temporaryRoot, "missing-status.json");
  cpSync(capturesDirectory, temporaryCaptures, { recursive: true });
  appendFileSync(path.join(temporaryCaptures, "training-aws-onboarding.json"), " \n");
  writeFileSync(existingStatusPath, "reviewed-status-must-stay-unchanged\n");

  for (const statusPath of [existingStatusPath, missingStatusPath]) {
    const result = run(
      "scripts/brainboard-capture/validate-capture.mjs",
      "--captures-dir",
      temporaryCaptures,
      "--write-status",
      statusPath
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /validation failed|raw_sha_mismatch/i);
  }

  assert.equal(readFileSync(existingStatusPath, "utf8"), "reviewed-status-must-stay-unchanged\n");
  assert.equal(existsSync(missingStatusPath), false);
});

function run(...arguments_) {
  return spawnSync(process.execPath, arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8"
  });
}
