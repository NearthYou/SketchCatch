import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const panelSource = readWorkspaceFile("ReverseEngineeringPanel.tsx");
const findingsPanelSource = readWorkspaceFile("ReverseEngineeringFindingsPanel.tsx");
const importPanelSource = readWorkspaceFile("ReverseEngineeringImportSuggestionsPanel.tsx");
const resultPanelSource = readWorkspaceFile("ReverseEngineeringResultPanel.tsx");
const rightPanelSource = readWorkspaceFile("WorkspaceRightPanel.tsx");

test("Reverse Engineering panel exposes all grilling resource filters by default", () => {
  assert.match(panelSource, /"VPC"/);
  assert.match(panelSource, /"SUBNET"/);
  assert.match(panelSource, /"INTERNET_GATEWAY"/);
  assert.match(panelSource, /"ROUTE_TABLE"/);
  assert.match(panelSource, /"SECURITY_GROUP"/);
  assert.match(panelSource, /"EC2"/);
  assert.match(panelSource, /"RDS"/);
  assert.match(panelSource, /"S3"/);
});

test("Reverse Engineering result stays preview-only until the user applies it", () => {
  assert.match(rightPanelSource, /<ReverseEngineeringPanel context=\{context\} projectId=\{projectId\} \/>/);
  assert.match(panelSource, /readonly context: DiagramEditorPanelContext/);
  assert.match(panelSource, /context\.setPreviewDiagram\(application\.previewDiagram\)/);
  assert.match(panelSource, /context\.applyDiagramJson\(application\.diagram\)/);
  assert.match(panelSource, /createArchitectureSnapshot/);
  assert.match(panelSource, /source: "imported"/);
  assert.match(resultPanelSource, /새 보드로 열기/);
  assert.match(resultPanelSource, /현재 보드에 추가/);
});

test("Reverse Engineering result shows risks, partial scan errors, and import handoff data", () => {
  assert.match(findingsPanelSource, /위험\/비용 finding/);
  assert.match(findingsPanelSource, /High Risk/);
  assert.match(findingsPanelSource, /어떻게 고치면 되나요/);
  assert.match(findingsPanelSource, /부분 실패/);
  assert.match(importPanelSource, /리소스별 카드/);
  assert.match(importPanelSource, /전체 복사/);
  assert.match(importPanelSource, /Git\/CI\/CD handoff 준비/);
  assert.match(resultPanelSource, /analysisExclusions/);
});

function readWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}
