import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const panelSource = readFileSync(
  fileURLToPath(new URL("./PreDeploymentAnalysisPanel.tsx", import.meta.url)),
  "utf8"
);
const panelStyles = readFileSync(
  fileURLToPath(new URL("./pre-deployment-analysis-panel.module.css", import.meta.url)),
  "utf8"
);

test("수정 제안은 일반 결과 목록과 구분되는 경고 카드로 표시한다", () => {
  assert.match(panelSource, /role="note"/);
  assert.match(panelSource, /styles\.suggestionCallout/);
  assert.match(panelSource, /수정 제안/);
  assert.match(panelStyles, /\.suggestionCallout\s*\{[\s\S]*?background:/);
  assert.match(panelStyles, /\.suggestionCallout\s*\{[\s\S]*?border:/);
  assert.match(panelStyles, /\.suggestionHeading/);
});
