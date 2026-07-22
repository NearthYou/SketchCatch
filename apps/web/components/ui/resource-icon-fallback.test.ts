import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { shouldRenderResourceIconImage } from "./resource-icon-fallback";

const resourceIconSurfaces = [
  "../../features/diagram-editor/DefaultDiagramPalette.tsx",
  "../../features/workspace/ResourceListPanel.tsx",
  "../../features/workspace/LiveObservationDiagramMap.tsx",
  "../../features/parameter-input/ParameterInputPanel.tsx"
].map((relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8"));
const resourceIconFallbackStyles = [
  "../../features/diagram-editor/default-diagram-palette-icon.module.css",
  "../../features/workspace/resource-workspace.module.css",
  "../../features/workspace/workspace.module.css",
  "../../features/parameter-input/ParameterInputPanel.module.css"
].map((relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8"));

test("resource icon falls back when a URL is absent or the current URL failed", () => {
  assert.equal(shouldRenderResourceIconImage(undefined, null), false);
  assert.equal(shouldRenderResourceIconImage("/icons/vpc.svg", null), true);
  assert.equal(shouldRenderResourceIconImage("/icons/vpc.svg", "/icons/vpc.svg"), false);
});

test("resource icon retries when a node receives a different icon URL", () => {
  assert.equal(
    shouldRenderResourceIconImage("/icons/subnet.svg", "/icons/vpc.svg"),
    true
  );
});

test("Resource를 보여주는 주요 화면은 같은 실패 fallback을 사용한다", () => {
  for (const source of resourceIconSurfaces) {
    assert.match(source, /ResourceIconImage/);
    assert.match(source, /<ResourceIconImage/);
  }
});

test("fallback 아이콘은 화면 색상 token을 따라 대비를 유지한다", () => {
  assert.match(resourceIconFallbackStyles[0]!, /color:\s*var\(--board-body\)/);
  assert.match(resourceIconFallbackStyles[1]!, /color:\s*var\(--workspace-text/);
  assert.match(resourceIconFallbackStyles[2]!, /color:\s*var\(--workspace-text/);
  assert.match(resourceIconFallbackStyles[3]!, /color:\s*var\(--workspace-text/);
});
