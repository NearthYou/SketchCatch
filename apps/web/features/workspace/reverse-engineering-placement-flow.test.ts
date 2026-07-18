import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const panelSource = readFileSync(
  fileURLToPath(new URL("./ReverseEngineeringPanel.tsx", import.meta.url)),
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

test("Compiler는 배치 선택 callback 이후에만 실행 후보로 전달된다", () => {
  const placementPreview = getSourceBlock(
    panelSource,
    "function previewPlacement(",
    "function showFirstCandidatePreview("
  );

  assert.match(placementPreview, /placement: nextPlacement/);
  assert.match(panelSource, /onCompilePlacement=\{\(\) => previewPlacement\("compiled"\)\}/);
  assert.match(panelSource, /onKeepOriginalPlacement=\{\(\) => previewPlacement\("original"\)\}/);
});

test("최종 replace와 append 적용은 각 검토에 사용한 application을 그대로 사용한다", () => {
  const applyFlow = getSourceBlock(
    panelSource,
    "async function applyScanResult(",
    "function previewPlacement("
  );

  assert.match(
    applyFlow,
    /mode === "replace" \? selectedCandidateApplication : selectedCandidateAppendApplication/
  );
  assert.doesNotMatch(applyFlow, /createReverseEngineeringBoardApplication\(/);
});

test("원본과 Compiler 후보는 미리보기만 갱신하고 명시적 적용 함수에서만 Board를 변경한다", () => {
  const placementPreview = getSourceBlock(
    panelSource,
    "function previewPlacement(",
    "function showFirstCandidatePreview("
  );
  const applyFlow = getSourceBlock(
    panelSource,
    "async function applyScanResult(",
    "function previewPlacement("
  );

  assert.match(placementPreview, /context\.setPreviewDiagram\(application\.previewDiagram\)/);
  assert.doesNotMatch(placementPreview, /context\.applyDiagramJson\(/);
  assert.match(applyFlow, /context\.applyDiagramJson\(diagramToApply\)/);
});

function getSourceBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  assert.notEqual(start, -1, startMarker);
  assert.notEqual(end, -1, endMarker);

  return source.slice(start, end);
}
