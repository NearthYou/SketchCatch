import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const pageSource = readAppFile("page.tsx");
const clientSource = readAppFile("reverse-workspace-client.tsx");

test("reverse workspace route renders a dedicated full page instead of the right panel", () => {
  assert.match(pageSource, /ReverseWorkspaceClient/);
  assert.match(clientSource, /<ReverseEngineeringPanel/);
  assert.match(clientSource, /createProjectOnApply/);
  assert.match(clientSource, /rightPanel=\{null\}/);
  assert.match(clientSource, /floatingPanel=\{\(context\) =>/);
  assert.match(clientSource, /reverseImportPanelShell/);
  assert.doesNotMatch(clientSource, /WorkspaceRightPanel/);
  assert.doesNotMatch(clientSource, /오른쪽에서/);
});

test("reverse workspace route starts from an empty preview board and creates the project only on apply", () => {
  assert.match(clientSource, /EMPTY_DIAGRAM/);
  assert.match(clientSource, /REVERSE_PREVIEW_PROJECT_ID = "reverse-preview-project"/);
  assert.match(clientSource, /projectId=\{REVERSE_PREVIEW_PROJECT_ID\}/);
  assert.match(clientSource, /createProjectOnApply/);
});

function readAppFile(fileName: string): string {
  return readFileSync(
    fileURLToPath(new URL(fileName, import.meta.url)),
    "utf8"
  );
}
