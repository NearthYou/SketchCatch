import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const workspaceStartClientSource = readAppWorkspaceFile("new/workspace-start-client.tsx");

test("new project start keeps the remaining start modes and core API calls", () => {
  assert.match(workspaceStartClientSource, /createWorkspaceStartOptions/);
  assert.match(workspaceStartClientSource, /ai: Bot/);
  assert.match(workspaceStartClientSource, /reverse: CloudDownload/);
  assert.match(workspaceStartClientSource, /template: Boxes/);
  assert.match(workspaceStartClientSource, /blank: LayoutPanelTop/);
  assert.doesNotMatch(workspaceStartClientSource, /github: GitBranch/);
  assert.match(workspaceStartClientSource, /listAwsConnections/);
  assert.match(workspaceStartClientSource, /resolveWorkspaceStartAction/);
  assert.match(workspaceStartClientSource, /createProject/);
  assert.match(workspaceStartClientSource, /saveProjectDraft/);
  assert.doesNotMatch(workspaceStartClientSource, /workspaceStartProviderGrid/);
});

function readAppWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(`../../app/workspace/${fileName}`, import.meta.url)), "utf8");
}
