import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

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

function run(...arguments_) {
  return spawnSync(process.execPath, arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8"
  });
}
