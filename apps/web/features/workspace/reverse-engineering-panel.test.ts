import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const panelSource = readWorkspaceFile("ReverseEngineeringPanel.tsx");
const draftEditsSource = readWorkspaceFile("reverse-engineering-draft-edits.ts");
const findingsPanelSource = readWorkspaceFile("ReverseEngineeringFindingsPanel.tsx");
const importPanelSource = readWorkspaceFile("ReverseEngineeringImportSuggestionsPanel.tsx");
const parameterPanelSource = readWorkspaceFile("ReverseEngineeringResourceParametersPanel.tsx");
const resultPanelSource = readWorkspaceFile("ReverseEngineeringResultPanel.tsx");
const candidatesSource = readWorkspaceFile("reverse-engineering-board-candidates.ts");
const resourceTypesSource = readWorkspaceFile("reverse-engineering-resource-types.ts");
const scanCriteriaFormSource = readWorkspaceFile("ReverseEngineeringScanCriteriaForm.tsx");
const scanHistoryPanelSource = readWorkspaceFile("ReverseEngineeringScanHistoryPanel.tsx");
const scanHistoryHookSource = readWorkspaceFile("useReverseEngineeringScanHistory.ts");
const reverseWorkspaceClientSource = readAppWorkspaceFile("reverse/reverse-workspace-client.tsx");

test("Reverse Engineering panel exposes all grilling resource filters by default", () => {
  assert.match(resourceTypesSource, /REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION = "ALL"/);
  assert.match(resourceTypesSource, /"ALL"/);
  assert.match(resourceTypesSource, /"VPC"/);
  assert.match(resourceTypesSource, /"SUBNET"/);
  assert.match(resourceTypesSource, /"INTERNET_GATEWAY"/);
  assert.match(resourceTypesSource, /"ROUTE_TABLE"/);
  assert.match(resourceTypesSource, /"SECURITY_GROUP"/);
  assert.match(resourceTypesSource, /"EC2"/);
  assert.match(resourceTypesSource, /"RDS"/);
  assert.match(resourceTypesSource, /"S3"/);
  assert.match(panelSource, /useState<ReverseEngineeringResourceSelection\[\]>\(\[/);
  assert.match(panelSource, /REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION/);
  assert.match(scanCriteriaFormSource, /formatResourceSelectionLabel/);
  assert.match(scanCriteriaFormSource, /전체/);
});

test("Reverse Engineering scan starts from one main import action and keeps filters in advanced settings", () => {
  assert.match(scanCriteriaFormSource, /기존 AWS 가져오기/);
  assert.match(scanCriteriaFormSource, /고급 설정/);
  assert.match(scanCriteriaFormSource, /<details/);
  assert.match(scanCriteriaFormSource, /전체 스캔/);
  assert.match(scanCriteriaFormSource, /현재 리전/);
  assert.match(scanCriteriaFormSource, /getSelectedAwsConnectionRegion/);
  assert.doesNotMatch(scanCriteriaFormSource, /AWS 스캔 시작/);
});

test("Reverse Engineering panel sends users to settings when no verified AWS connection exists", () => {
  assert.match(scanCriteriaFormSource, /awsConnections\.length === 0/);
  assert.match(scanCriteriaFormSource, /\/settings\?tab=aws&next=reverse/);
  assert.match(scanCriteriaFormSource, /환경설정에서 AWS Role을 먼저 연결해 주세요/);
});

test("Reverse Engineering result stays preview-only until the user applies it", () => {
  assert.match(reverseWorkspaceClientSource, /<ReverseEngineeringPanel/);
  assert.match(panelSource, /readonly context: DiagramEditorPanelContext/);
  assert.match(panelSource, /context\.setPreviewDiagram\(application\.previewDiagram\)/);
  assert.match(panelSource, /createArchitectureSnapshot/);
  assert.match(panelSource, /source: "imported"/);
  assert.match(panelSource, /sourceScanId: result\.scan\.id/);
  assert.match(panelSource, /draftId: result\.reverseEngineeringDraft\.id/);
  assert.match(panelSource, /attachReverseEngineeringSourceToDiagram/);
  assert.match(panelSource, /context\.applyDiagramJson\(diagramToApply\)/);
  assert.match(resultPanelSource, /새 보드로 열기/);
  assert.match(resultPanelSource, /현재 보드에 추가/);
});

test("Reverse Engineering can scan before project creation and create the project only on apply", () => {
  assert.match(panelSource, /createReverseEngineeringPreviewScan/);
  assert.match(panelSource, /createProjectOnApply/);
  assert.match(panelSource, /createProject\(\{ name: projectName \}\)/);
  assert.match(panelSource, /saveProjectDraft/);
  assert.match(panelSource, /router\.push/);
  assert.match(scanCriteriaFormSource, /프로젝트는 후보를 적용할 때 생성됩니다/);
  assert.match(scanHistoryHookSource, /enabled = true/);
  assert.match(scanHistoryHookSource, /if \(!enabled\)/);
});

test("Reverse Engineering draft edits update only the candidate architecture", () => {
  assert.match(panelSource, /updateReverseEngineeringDraftNode/);
  assert.match(panelSource, /context\.setPreviewDiagram\(application\.previewDiagram\)/);
  assert.match(resultPanelSource, /Draft 수정/);
  assert.match(resultPanelSource, /표시 이름/);
  assert.match(resultPanelSource, /설명/);
  assert.match(resultPanelSource, /positionX/);
  assert.match(draftEditsSource, /discoveredResources/);
  assert.match(draftEditsSource, /reverseEngineeringDraft/);
});

test("Reverse Engineering result shows risks, partial scan errors, and import handoff data", () => {
  assert.match(findingsPanelSource, /위험\/비용 finding/);
  assert.match(findingsPanelSource, /High Risk/);
  assert.match(findingsPanelSource, /어떻게 고치면 되나요/);
  assert.match(findingsPanelSource, /부분 실패/);
  assert.match(findingsPanelSource, /scanErrors\.map\(\(scanError, index\)/);
  assert.match(findingsPanelSource, /key=\{`\$\{scanError\.id\}-\$\{index\}`\}/);
  assert.match(findingsPanelSource, /stage/);
  assert.match(findingsPanelSource, /reason/);
  assert.match(findingsPanelSource, /retryable/);
  assert.match(findingsPanelSource, /다시 시도 가능/);
  assert.match(resultPanelSource, /미지원 Resource/);
  assert.match(resultPanelSource, /providerResourceType/);
  assert.match(importPanelSource, /리소스별 카드/);
  assert.match(importPanelSource, /전체 복사/);
  assert.match(importPanelSource, /Git\/CI\/CD handoff 준비/);
  assert.match(resultPanelSource, /analysisExclusions/);
});

test("Reverse Engineering result explains scan coverage before users apply the preview", () => {
  assert.match(resultPanelSource, /스캔 범위/);
  assert.match(resultPanelSource, /못 읽은 서비스/);
  assert.match(resultPanelSource, /Resource Explorer/);
  assert.match(resultPanelSource, /전체 AWS 상태가 아닐 수 있습니다/);
  assert.match(resultPanelSource, /getScanCoverageNotice/);
});

test("Reverse Engineering result shows multiple board candidates before applying one", () => {
  assert.match(candidatesSource, /createReverseEngineeringBoardCandidates/);
  assert.match(candidatesSource, /candidate-full-scan/);
  assert.match(panelSource, /selectedCandidateId/);
  assert.match(panelSource, /selectedCandidateResult/);
  assert.match(panelSource, /createReverseEngineeringCandidateResult/);
  assert.match(resultPanelSource, /보드 후보 선택/);
  assert.match(resultPanelSource, /onCandidateSelect/);
  assert.match(resultPanelSource, /candidate\.nodeCount/);
});

test("Reverse Engineering result lets users inspect provider parameters for every discovered resource", () => {
  assert.match(resultPanelSource, /ReverseEngineeringResourceParametersPanel/);
  assert.match(parameterPanelSource, /리소스 파라미터/);
  assert.match(parameterPanelSource, /providerParameters/);
  assert.match(parameterPanelSource, /JSON\.stringify/);
  assert.match(parameterPanelSource, /discoveredResources/);
});

test("Reverse Engineering panel masks AWS account ids shown in scan controls", () => {
  assert.match(scanCriteriaFormSource, /maskAwsAccountId/);
  assert.match(scanCriteriaFormSource, /\$1\*\*\*\*\*\*\*\*/);
});

test("Reverse Engineering panel exposes scan history, stale warning, and rescan action", () => {
  assert.match(scanHistoryHookSource, /listReverseEngineeringScans/);
  assert.match(panelSource, /getReverseEngineeringScan/);
  assert.match(panelSource, /pollReverseEngineeringScan/);
  assert.match(scanHistoryPanelSource, /스캔 기록/);
  assert.match(scanHistoryPanelSource, /이전 스캔 결과입니다/);
  assert.match(scanHistoryPanelSource, /다시 스캔/);
});

test("Reverse Engineering panel exposes cancel and delete scan actions", () => {
  assert.match(panelSource, /cancelReverseEngineeringScan/);
  assert.match(panelSource, /취소 요청을 보냈습니다/);
  assert.match(scanHistoryPanelSource, /onDeleteScan/);
  assert.match(scanHistoryPanelSource, /onCancelScan/);
  assert.match(scanHistoryPanelSource, /scan\.status === "running"/);
  assert.match(scanHistoryPanelSource, /삭제/);
});

test("Reverse Engineering panel explains when the source scan was deleted but the board remains", () => {
  assert.match(panelSource, /hasDeletedReverseEngineeringSourceScan/);
  assert.match(panelSource, /원본 scan 기록은 삭제됐습니다/);
});

function readWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}

function readAppWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(`../../app/workspace/${fileName}`, import.meta.url)), "utf8");
}
