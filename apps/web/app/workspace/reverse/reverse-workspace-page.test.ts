import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const pageSource = readAppFile("page.tsx");
const clientSource = readAppFile("reverse-workspace-client.tsx");
const stylesSource = readAppFile("../../../features/workspace/reverse-engineering.module.css");

test("reverse workspace route renders a dedicated full page instead of the right panel", () => {
  assert.match(pageSource, /ReverseWorkspaceClient/);
  assert.match(clientSource, /<ReverseEngineeringPanel/);
  assert.match(clientSource, /createProjectOnApply/);
  assert.match(clientSource, /rightPanel=\{\(context\) =>/);
  assert.match(clientSource, /ReverseDockedPanel/);
  assert.match(clientSource, /allowPreviewInspection/);
  assert.doesNotMatch(clientSource, /floatingPanel=/);
  assert.doesNotMatch(clientSource, /rightPanel=\{null\}/);
  assert.doesNotMatch(clientSource, /WorkspaceRightPanel/);
  assert.doesNotMatch(clientSource, /오른쪽에서/);
});

test("reverse workspace has a dedicated neutral layout instead of global class names", () => {
  assert.match(clientSource, /reverse-engineering\.module\.css/);
  assert.match(clientSource, /className=\{styles\.candidatePanel\}/);
  assert.match(clientSource, /className=\{styles\.rightPanel\}/);
  assert.match(stylesSource, /\.candidatePanel\s*\{/);
  assert.match(stylesSource, /\.rightPanel\s*\{/);
  assert.match(stylesSource, /--reverse-accent:\s*#000000/);
  assert.doesNotMatch(stylesSource, /#6f4cf6|#5f3de8|rgba\(111,\s*76,\s*246/i);
  assert.match(stylesSource, /\.startBackButton\s*\{[^}]*margin-top:\s*0/s);
  assert.doesNotMatch(stylesSource, /\.startBackButton\s*\{[^}]*margin-top:\s*auto/s);
});

test("reverse empty states keep mobile guidance short", () => {
  assert.match(clientSource, /가져온 AWS 구조가 여기에 표시됩니다\./);
  assert.doesNotMatch(clientSource, /자동 감지 결과가 표시됩니다/);
});

test("reverse preview lets users inspect provider values without editing them", () => {
  assert.match(clientSource, /ReverseResourceInspector/);
  assert.match(clientSource, /AWS에서 읽은 원본 값/);
  assert.match(clientSource, /providerResourceId/);
  assert.match(clientSource, /providerResourceType/);
  assert.match(clientSource, /context\.closeInspectedNode/);
  assert.doesNotMatch(clientSource, /updateNodeParameters/);
});

test("reverse workspace route starts from an empty preview board and creates the project only on apply", () => {
  assert.match(clientSource, /EMPTY_DIAGRAM/);
  assert.match(clientSource, /emptyBoardDescription="기존 AWS를 가져오면 복원한 구조가 여기에 표시됩니다\."/);
  assert.match(clientSource, /showSaveAction=\{false\}/);
  assert.doesNotMatch(clientSource, /onDiagramSaveRequest=/);
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
