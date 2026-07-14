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
