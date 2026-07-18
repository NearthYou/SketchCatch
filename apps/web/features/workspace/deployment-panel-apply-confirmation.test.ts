import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const deploymentPanelSource = readFileSync(
  fileURLToPath(new URL("DirectDeploymentScreen.tsx", import.meta.url)),
  "utf8"
);

test("apply confirmation can be dismissed after it opens for an approved plan", () => {
  assert.match(
    deploymentPanelSource,
    /useEffect\(\(\) => \{\s*if \(shouldShowApplyButton\) \{\s*setShowApplyConfirmation\(true\);\s*\}\s*\}, \[shouldShowApplyButton\]\);/
  );
  assert.match(
    deploymentPanelSource,
    /\{showApplyConfirmation && selectedDeployment \? \(/
  );
  assert.doesNotMatch(
    deploymentPanelSource,
    /showApplyConfirmation \|\| shouldShowApplyButton/
  );
});

test("approved plan actions show deployment before approval revocation", () => {
  const confirmationStart = deploymentPanelSource.indexOf(
    "{showApplyConfirmation && selectedDeployment ? ("
  );
  const applyAction = deploymentPanelSource.indexOf(
    "onClick={startTerraformApply}",
    confirmationStart
  );
  const revokeAction = deploymentPanelSource.indexOf(
    "onClick={() => void revokeCurrentPlanApproval()}",
    confirmationStart
  );

  assert.ok(confirmationStart >= 0);
  assert.ok(applyAction > confirmationStart);
  assert.ok(revokeAction > applyAction);
});
