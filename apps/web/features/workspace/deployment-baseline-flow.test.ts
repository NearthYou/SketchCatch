import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const deploymentPanelSource = readFileSync(
  new URL("./DeploymentPanel.tsx", import.meta.url),
  "utf8"
);

test("saving a deployment baseline returns a terminal deployment to review", () => {
  const saveBaselineStart = deploymentPanelSource.indexOf(
    "async function saveDeploymentBaseline(): Promise<void>"
  );
  const saveBaselineEnd = deploymentPanelSource.indexOf(
    "async function startTerraformPlan()",
    saveBaselineStart
  );
  const saveBaselineBody = deploymentPanelSource.slice(saveBaselineStart, saveBaselineEnd);
  const suggestedStepStart = deploymentPanelSource.indexOf("function getSuggestedDeploymentWizardStep");
  const suggestedStepEnd = deploymentPanelSource.indexOf(
    "function canOpenDeploymentWizardStep",
    suggestedStepStart
  );
  const suggestedStepBody = deploymentPanelSource.slice(suggestedStepStart, suggestedStepEnd);

  assert.match(saveBaselineBody, /setSelectedDeploymentId\(""\)/);
  assert.match(saveBaselineBody, /setDeploymentWizardStep\("review"\)/);
  assert.match(suggestedStepBody, /selectedDeployment\?\.status === "DESTROYED"/);
  assert.match(suggestedStepBody, /return "review"/);
});
