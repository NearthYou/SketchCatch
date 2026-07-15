import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panelSource = read("TerraformCodePanel.tsx");

test("Terraform 패널은 현재 코드와 정확한 fingerprint를 AI 채팅 context로 전달한다", () => {
  assert.match(panelSource, /onTerraformAiCodeContextChange/);
  assert.match(panelSource, /createWorkspaceTerraformFingerprint\(terraformAiFiles\)/);
  assert.match(panelSource, /combinedTerraformCode/);
  assert.match(panelSource, /reviewScope:\s*\{/);
  assert.doesNotMatch(panelSource, /onTerraformPreviewAiRequest/);
});

test("Terraform 패널의 명시적인 pointer와 focus 상호작용만 AI 탭 의도를 알린다", () => {
  assert.match(panelSource, /onFocusCapture=\{onTerraformAiInteraction\}/);
  assert.match(panelSource, /onPointerDown=\{onTerraformAiInteraction\}/);
});

test("여러 수정안은 순수 preflight 뒤 한 번에 반영하고 모호한 파일을 추론하지 않는다", () => {
  assert.match(panelSource, /applyTerraformSafeFixesAtomically\(/);
  assert.match(panelSource, /applyTerraformSafeFixes:\s*applyTerraformSafeFixesToCode/);
  assert.doesNotMatch(panelSource, /diagnostic\.sourceFileName\s*\?\?\s*activeFileName/);
});

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
