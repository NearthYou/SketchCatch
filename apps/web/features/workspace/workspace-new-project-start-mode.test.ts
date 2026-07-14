import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const workspaceStartClientSource = readAppWorkspaceFile("new/workspace-start-client.tsx");
const workspaceStartStylesSource = readAppWorkspaceFile("new/workspace-start.module.css");

test("new project start keeps all five start modes and core API calls", () => {
  assert.match(workspaceStartClientSource, /createWorkspaceStartOptions/);
  assert.match(workspaceStartClientSource, /ai: Bot/);
  assert.match(workspaceStartClientSource, /reverse: CloudDownload/);
  assert.match(workspaceStartClientSource, /template: Boxes/);
  assert.match(workspaceStartClientSource, /repository: GitBranch/);
  assert.match(workspaceStartClientSource, /blank: LayoutPanelTop/);
  assert.match(workspaceStartClientSource, /listAwsConnections/);
  assert.match(workspaceStartClientSource, /resolveWorkspaceStartAction/);
  assert.match(workspaceStartClientSource, /createProject/);
  assert.match(workspaceStartClientSource, /saveProjectDraft/);
  assert.doesNotMatch(workspaceStartClientSource, /workspaceStartProviderGrid/);
});

test("blank board starts immediately with shared loading and duplicate-request guards", () => {
  assert.match(workspaceStartClientSource, /createWorkspaceStartSingleFlight/);
  assert.match(workspaceStartClientSource, /handleContinue\("blank"\)/);
  assert.doesNotMatch(workspaceStartClientSource, /onClick=\{\(\) => selectStartKind\("blank"\)\}/);
  assert.match(workspaceStartClientSource, /aria-busy=\{submittingKind === "blank"\}/);
  assert.match(
    workspaceStartClientSource,
    /disabled=\{isSubmitting\}\s+onClick=\{\(\) => void handleContinue\("blank"\)\}\s+type="button"/
  );
  assert.match(workspaceStartClientSource, /submittingKind === "blank" \? "처리 중"/);
  assert.match(workspaceStartStylesSource, /\.blankAction:disabled/);
  assert.match(workspaceStartStylesSource, /\.blankAction\[aria-busy="true"\]::after/);
});

function readAppWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(`../../app/workspace/${fileName}`, import.meta.url)), "utf8");
}
