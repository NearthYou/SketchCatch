import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const deploymentPanelSource = readFileSync(
  fileURLToPath(new URL("../../app/workspace/operations/DeploymentOperationsPanel.tsx", import.meta.url)),
  "utf8"
);

test("deployment keeps Plan, approval, and Apply as separate explicit actions", () => {
  assert.match(deploymentPanelSource, /Plan 실행/);
  assert.match(deploymentPanelSource, /approvePlan/);
  assert.match(deploymentPanelSource, /Apply 실행/);
  assert.doesNotMatch(deploymentPanelSource, /showApplyConfirmation/);
});
