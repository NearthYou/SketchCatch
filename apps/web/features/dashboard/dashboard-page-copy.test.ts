import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("template library uses one Korean page title without redundant introduction copy", () => {
  const source = readWorkspaceFile("components/dashboard/built-in-template-library.tsx");

  assert.match(source, /<h1>탬플릿<\/h1>/);
  assert.doesNotMatch(source, /Template library|<h1>Templates<\/h1>/);
  assert.doesNotMatch(source, /Architecture Board에서 사용할 수 있는 내장 Practice Architecture입니다/);
});

test("cost management uses one Korean page title without redundant introduction copy", () => {
  const source = readWorkspaceFile("app/dashboard/costs/cost-dashboard-client.tsx");

  assert.match(source, /<h1>비용 관리<\/h1>/);
  assert.doesNotMatch(source, /Cost management/);
  assert.doesNotMatch(
    source,
    /프로젝트의 예상 비용과 실제 사용량을 한곳에서 비교하고 관리합니다/,
  );
});

function readWorkspaceFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
}
