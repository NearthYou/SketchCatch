import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const panelSource = readFileSync(
  fileURLToPath(new URL("./ReverseEngineeringPanel.tsx", import.meta.url)),
  "utf8"
);
const stylesheetSource = readFileSync(
  fileURLToPath(new URL("./reverse-engineering.module.css", import.meta.url)),
  "utf8"
);

test("새 scan과 저장된 scan은 원래 배치를 먼저 미리보기한다", () => {
  const firstPreview = getSourceBlock(
    panelSource,
    "function showFirstCandidatePreview(",
    "return ("
  );
  const historicalScan = getSourceBlock(
    panelSource,
    "async function openHistoricalScan(",
    "async function applyScanResult("
  );

  assert.match(panelSource, /useState<ReverseEngineeringPlacement>\("original"\)/);
  assert.match(firstPreview, /placement: "original"/);
  assert.doesNotMatch(firstPreview, /placement: "compiled"/);
  assert.match(historicalScan, /setPlacement\("original"\)/);
  assert.match(historicalScan, /showFirstCandidatePreview\(response\.result, baseDiagram\)/);
});

test("자동 정리 후보는 사용자가 자동 정리 해보기를 누른 뒤에만 만든다", () => {
  const organizationPreview = getSourceBlock(
    panelSource,
    "function previewAutomaticOrganization(",
    "function selectOrganizationCandidate("
  );
  const firstPreview = getSourceBlock(
    panelSource,
    "function showFirstCandidatePreview(",
    "return ("
  );

  assert.match(organizationPreview, /createBoardAutoOrganizeCandidates\(/);
  assert.doesNotMatch(firstPreview, /createBoardAutoOrganizeCandidates\(/);
  assert.match(panelSource, /onCompilePlacement=\{previewAutomaticOrganization\}/);
  assert.match(panelSource, /onKeepOriginalPlacement=\{previewOriginalPlacement\}/);
});

test("최종 replace와 append 적용은 각 검토에 사용한 application을 그대로 사용한다", () => {
  const applyFlow = getSourceBlock(
    panelSource,
    "async function applyScanResult(",
    "function previewAutomaticOrganization("
  );

  assert.match(
    applyFlow,
    /mode === "replace" \? selectedCandidateApplication : selectedCandidateAppendApplication/
  );
  assert.doesNotMatch(applyFlow, /createReverseEngineeringBoardApplication\(/);
});

test("원본과 자동 정리 후보는 미리보기만 갱신하고 명시적 적용 함수에서만 Board를 변경한다", () => {
  const placementPreview = getSourceBlock(
    panelSource,
    "function previewAutomaticOrganization(",
    "function showFirstCandidatePreview("
  );
  const applyFlow = getSourceBlock(
    panelSource,
    "async function applyScanResult(",
    "function previewAutomaticOrganization("
  );

  assert.match(placementPreview, /context\.setPreviewDiagram\(firstCandidate\.diagram\)/);
  assert.match(placementPreview, /context\.setPreviewDiagram\(candidate\.diagram\)/);
  assert.match(
    placementPreview,
    /context\.setPreviewDiagram\(originalCandidateApplication\.previewDiagram\)/
  );
  assert.doesNotMatch(placementPreview, /context\.applyDiagramJson\(/);
  assert.match(applyFlow, /context\.applyDiagramJson\(diagramToApply\)/);
});

test("중첩 상세 항목은 열린 바깥 항목 때문에 닫힌 표시가 바뀌지 않는다", () => {
  assert.match(stylesheetSource, /\.detail\[open\] > \.detailSummary::after/);
  assert.doesNotMatch(stylesheetSource, /\.detail\[open\] \.detailSummary::after/);
});

test("Reverse Engineering은 AWS 권한을 바꾸지 않고 같은 연결의 Settings로만 보낸다", () => {
  assert.match(
    panelSource,
    /permissionRecoveryHref=\{createReverseEngineeringAwsSettingsHref\(\s*selectedCandidateResponse\.scan\.awsConnectionId\s*\)\}/
  );
  assert.doesNotMatch(
    panelSource,
    /getAwsConnectionCloudFormationTemplate|verifyAwsConnection|prepareReverseEngineeringImportPermissionUpdate|reverifyReverseEngineeringImportPermission/
  );
});

// 소스 계약 테스트가 확인할 함수 범위만 잘라냅니다.
function getSourceBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  assert.notEqual(start, -1, startMarker);
  assert.notEqual(end, -1, endMarker);

  return source.slice(start, end);
}
