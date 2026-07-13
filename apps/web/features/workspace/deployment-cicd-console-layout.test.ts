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

test("the CI/CD screen wires sorted refreshes and request-scoped recovery state", () => {
  const cicdSource = readWorkspaceSource("CicdConsoleScreen.tsx");

  assert.match(cicdSource, /const refreshList = useCallback/);
  assert.match(cicdSource, /const nextRuns = await loadRuns\(\)/);
  assert.match(cicdSource, /const manualRefresh = useCallback/);
  assert.match(cicdSource, /refreshProjectGitCicdPipelineRuns\(projectId\)/);
  assert.match(cicdSource, /mergeCicdPipelineRun\(currentRuns, detail\)/);
  assert.match(cicdSource, /hasExplicitRunSelectionRef\.current = true/);
  for (const scope of ["list", "detail", "refresh", "settings"] as const) {
    assert.match(cicdSource, new RegExp(`type: "success", scope: "${scope}"`));
  }
  assert.match(cicdSource, /errorMessage=\{logsErrorMessage\}/);
});

test("monitoring settings save only normalized repository-relative paths", () => {
  const settingsSource = readWorkspaceSource("CicdMonitoringSettings.tsx");

  assert.match(settingsSource, /normalizeCicdMonitoredPath\(draft\.appPath\)/);
  assert.match(settingsSource, /normalizeCicdMonitoredPath\(draft\.infraPath\)/);
  assert.doesNotMatch(settingsSource, /normalizePathForSave/);
});

test("Direct and CI/CD screens share accessible Deployment Output links", () => {
  const directSource = readWorkspaceSource("DirectDeploymentScreen.tsx");
  const cicdSource = readWorkspaceSource("CicdConsoleScreen.tsx");

  assert.match(directSource, /import \{ DeploymentOutputLinks \}/);
  assert.match(directSource, /<DeploymentOutputLinks[^>]*scopeKey=\{selectedDeploymentId \|\| null\}/);
  assert.match(cicdSource, /import \{ DeploymentOutputLinks \}/);
  assert.match(cicdSource, /<DeploymentOutputLinks[^>]*scopeKey=\{selectedRun\?\.id \?\? null\}/);
});

test("one workspace notification host survives console screen changes", () => {
  const managerSource = readWorkspaceSource("ProjectWorkspaceDraftManager.tsx");
  const hostSource = readWorkspaceSource("WorkspaceNotificationHost.tsx");
  const directSource = readWorkspaceSource("DirectDeploymentScreen.tsx");
  const cicdSource = readWorkspaceSource("CicdConsoleScreen.tsx");

  assert.equal(managerSource.match(/<WorkspaceNotificationHost/g)?.length, 1);
  assert.match(managerSource, /<WorkspaceNotificationHost projectId=\{projectId\}>[\s\S]*<DiagramEditor/);
  assert.match(hostSource, /listDeployments\(projectId\)/);
  assert.match(hostSource, /listGitCicdPipelineRuns\(projectId/);
  assert.match(hostSource, /refreshProjectGitCicdPipelineRuns\(projectId\)/);
  assert.match(
    hostSource,
    /refreshProjectGitCicdPipelineRuns\(projectId\)[\s\S]*listGitCicdPipelineRuns\(projectId/
  );
  assert.match(hostSource, /window\.setTimeout/);
  assert.match(hostSource, /window\.clearTimeout/);
  assert.match(hostSource, /\}, \[notify, projectId\]\);/);
  assert.doesNotMatch(directSource, /useWorkspaceNotifications|getNotifiableDirectDeploymentTransitions/);
  assert.doesNotMatch(cicdSource, /useWorkspaceNotifications|getNotifiablePipelineRunTransitions/);
});

test("the visible CI/CD console keeps automatic refresh RDS-only and resets logs by revision", () => {
  const cicdSource = readWorkspaceSource("CicdConsoleScreen.tsx");

  assert.match(cicdSource, /refreshProjectGitCicdPipelineRuns/);
  assert.match(cicdSource, /manualRefresh/);
  assert.doesNotMatch(
    cicdSource.slice(cicdSource.indexOf("useEffect(() =>", cicdSource.indexOf("manualRefresh"))),
    /refreshProjectGitCicdPipelineRuns/
  );
  assert.match(cicdSource, /const selectedLogRevision = selectedRun\?\.logRevision/);
  assert.match(cicdSource, /logsSequenceRef\.current = 0/);
  assert.match(cicdSource, /setLogs\(\[\]\)/);
});

test("Direct Output rendering is scoped to the selected Deployment owner", () => {
  const directSource = readWorkspaceSource("DirectDeploymentScreen.tsx");

  assert.match(directSource, /reduceDeploymentOutputState/);
  assert.match(directSource, /getVisibleDeploymentOutputs\([^]*selectedDeploymentId/);
  assert.match(directSource, /type: "clear",\s*deploymentId: selectedDeploymentId/);
});
