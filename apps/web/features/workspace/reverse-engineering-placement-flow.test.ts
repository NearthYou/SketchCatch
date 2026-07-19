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
const diagramEditorSource = readFileSync(
  fileURLToPath(new URL("../diagram-editor/DiagramEditor.tsx", import.meta.url)),
  "utf8"
);
const diagramEditorTypesSource = readFileSync(
  fileURLToPath(new URL("../diagram-editor/types.ts", import.meta.url)),
  "utf8"
);
const applyFlowSource = readFileSync(
  fileURLToPath(new URL("./reverse-engineering-apply-flow.ts", import.meta.url)),
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
  assert.match(
    historicalScan,
    /showFirstCandidatePreview\(response\.result, basePreview\.sourceDiagram\)/
  );
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

test("Reverse 자동 정리는 replace와 append 모두 AWS source-exact Architecture를 Compiler에 넘긴다", () => {
  const organizationPreview = getSourceBlock(
    panelSource,
    "function previewAutomaticOrganization(",
    "function selectOrganizationCandidate("
  );

  assert.equal(organizationPreview.match(/createBoardAutoOrganizeCandidates\(/gu)?.length, 2);
  assert.equal(
    organizationPreview.match(/convertReverseEngineeringBoardToArchitectureJson\(/gu)?.length,
    2
  );
  assert.equal(organizationPreview.match(/selectedCandidateResponse\.result/gu)?.length, 2);
  assert.match(organizationPreview, /originalCandidateApplication\.sourceOwnership/);
  assert.match(organizationPreview, /originalCandidateAppendApplication\.sourceOwnership/);
});

test("최종 적용은 현재 mode에서 미리본 application을 그대로 사용한다", () => {
  const applyFlow = getSourceBlock(
    panelSource,
    "async function applyScanResult(",
    "function previewApplicationMode("
  );

  assert.match(
    applyFlow,
    /const application = selectedCandidateApplication/
  );
  assert.doesNotMatch(applyFlow, /selectedCandidateAppendApplication/);
  assert.doesNotMatch(applyFlow, /createReverseEngineeringBoardApplication\(/);
});

test("replace와 append는 현재 미리보는 mode의 실제 후보만 선택하고 적용한다", () => {
  assert.doesNotMatch(panelSource, /selectedOrganizationCandidateIndex/);
  assert.match(panelSource, /useState<ReverseEngineeringBoardApplicationMode>\("replace"\)/);
  assert.match(panelSource, /function previewApplicationMode\(/);
  assert.match(panelSource, /mode !== applicationMode/);
  assert.match(panelSource, /onApplicationModeChange=\{previewApplicationMode\}/);
  assert.match(
    panelSource,
    /organizationCandidates=\{activeOrganizationCandidates\?\.candidates \?\? \[\]\}/
  );
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
  assert.match(placementPreview, /context\.setPreviewDiagram\(application\.previewDiagram\)/);
  assert.match(
    placementPreview,
    /context\.setPreviewDiagram\(originalApplication\.previewDiagram\)/
  );
  assert.doesNotMatch(placementPreview, /context\.applyDiagramJson\(/);
  assert.match(applyFlow, /context\.applyDiagramJson\(diagramToApply\)/);
});

test("기존 프로젝트 적용은 서버 저장 성공 전 실제 Board를 바꾸지 않는다", () => {
  const applyFlow = getSourceBlock(
    panelSource,
    "async function applyScanResult(",
    "function previewAutomaticOrganization("
  );

  assert.match(applyFlow, /applyExistingReverseEngineeringPreview\(/);
  assert.ok(
    applyFlow.indexOf("await applyExistingReverseEngineeringPreview(") <
      applyFlow.indexOf("createArchitectureSnapshot("),
    "persisted Diagram apply must complete before snapshot creation"
  );
});

test("새 프로젝트 적용은 Project, Draft, Snapshot을 하나의 서버 요청으로 만든다", () => {
  const applyFlow = getSourceBlock(
    panelSource,
    "async function applyScanResult(",
    "function previewAutomaticOrganization("
  );
  const createProjectFlow = getSourceBlock(
    applyFlow,
    "if (createProjectOnApply)",
    "if (!context.persistAndApplyDiagramJson)"
  );

  assert.match(createProjectFlow, /await createReverseEngineeringProject\(/);
  assert.match(createProjectFlow, /application\.sourceOwnership/);
  assert.doesNotMatch(
    createProjectFlow,
    /createProject\(|saveProjectDraft\(|createArchitectureSnapshot\(/
  );
});

test("기존 프로젝트 Snapshot도 선택한 replace 또는 append의 source ownership만 저장한다", () => {
  const applyFlow = getSourceBlock(
    panelSource,
    "async function applyScanResult(",
    "function previewAutomaticOrganization("
  );

  assert.match(
    applyFlow,
    /attachReverseEngineeringSourceToDiagram\(\{[\s\S]*sourceNodeIds: application\.sourceOwnership\.nodeIds/
  );
  assert.match(
    applyFlow,
    /sourceNodeIds: \[\.\.\.application\.sourceOwnership\.nodeIds\]/
  );
});

test("Reverse preview가 생성 당시 Board fingerprint와 draft revision으로만 적용한다", () => {
  const applyFlow = getSourceBlock(
    panelSource,
    "async function applyScanResult(",
    "function previewAutomaticOrganization("
  );
  const persistedApplyFlow = getSourceBlock(
    diagramEditorSource,
    "const persistAndApplyDiagramJson = useCallback",
    "const previewAutomaticOrganization = useCallback"
  );

  assert.match(panelSource, /createReverseEngineeringApplyPreview\(/);
  assert.match(applyFlowSource, /sourceDraftRevision/);
  assert.match(applyFlowSource, /sourceFingerprint/);
  assert.match(applyFlow, /currentDraftRevision: context\.projectDraftRevision/);
  assert.match(applyFlow, /preview: previewBase/);
  assert.match(
    applyFlow,
    /persistAndApply: \(diagram, expectedRevision\) =>\s*context\.persistAndApplyDiagramJson\?\.\(diagram, expectedRevision\)/
  );
  assert.match(diagramEditorTypesSource, /projectDraftRevision: number \| null/);
  assert.match(
    diagramEditorTypesSource,
    /\(\(diagram: DiagramJson, expectedRevision: number\) => Promise<void>\)/
  );
  assert.match(persistedApplyFlow, /async \(nextDiagram, expectedRevision\)/);
  assert.doesNotMatch(persistedApplyFlow, /expectedRevision: projectDraftRevision/);
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
