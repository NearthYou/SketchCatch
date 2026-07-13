import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workspaceDirectory = new URL(".", import.meta.url);

function readWorkspaceSource(fileName: string): string {
  return readFileSync(new URL(fileName, workspaceDirectory), "utf8");
}

test("the deployment console shell owns the top-level Deployment and CI/CD screens", () => {
  const shellSource = readWorkspaceSource("DeploymentConsoleShell.tsx");

  assert.match(shellSource, /DirectDeploymentScreen/);
  assert.match(shellSource, /CicdConsoleScreen/);
  assert.match(shellSource, />\s*배포\s*</);
  assert.match(shellSource, />\s*CI\/CD\s*</);
  assert.match(shellSource, /aria-pressed=/);
  assert.match(shellSource, /sketchcatch:deployment-console-screen:/);
});

test("focused screens do not cross their execution client boundaries", () => {
  const directSource = readWorkspaceSource("DirectDeploymentScreen.tsx");
  const cicdSource = readWorkspaceSource("CicdConsoleScreen.tsx");

  assert.doesNotMatch(directSource, /listGitCicdPipelineRuns/);
  assert.doesNotMatch(cicdSource, /runDeploymentApply/);
});

test("DeploymentPanel is a compatibility adapter without the former tab state", () => {
  const panelSource = readWorkspaceSource("DeploymentPanel.tsx");

  assert.match(panelSource, /DeploymentConsoleShell/);
  assert.doesNotMatch(panelSource, /deploymentConsoleTab/);
});

test("WorkspaceRightPanel keeps the full-screen portal and Terraform leave gate", () => {
  const panelSource = readWorkspaceSource("WorkspaceRightPanel.tsx");

  assert.match(panelSource, /createPortal\(deploymentConsoleContent, document\.body\)/);
  assert.match(panelSource, /requestTerraformLeave\(\{ kind: "deployment-console" \}\)/);
});
