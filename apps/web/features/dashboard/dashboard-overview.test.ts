import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const overviewSource = `${readLocalFile("./dashboard-overview.tsx")}\n${readLocalFile("./dashboard-overview-data.ts")}\n${readLocalFile("./dashboard-overview-parts.tsx")}`;
const shellSource = readLocalFile("../../components/dashboard/dashboard-shell.tsx");

test("dashboard overview reads real operational data instead of demo fixtures", () => {
  assert.match(overviewSource, /listProjects/);
  assert.match(overviewSource, /listDeployments/);
  assert.match(overviewSource, /listCostProjectEstimates/);
  assert.match(overviewSource, /listAwsConnections/);
  assert.match(overviewSource, /listSourceRepositories/);
  assert.doesNotMatch(overviewSource, /dashboard-data|demoProjects|mock/);
});

test("dashboard overview renders loading, empty, partial, and error states", () => {
  assert.match(overviewSource, /loading/);
  assert.match(overviewSource, /empty/);
  assert.match(overviewSource, /partialWarnings/);
  assert.match(overviewSource, /error/);
});

test("dashboard shell provides navigation, one create action, and mobile controls", () => {
  assert.match(shellSource, /shouldShowCreateAction/);
  assert.match(shellSource, /href="\/workspace\/new\?fresh=1"/);
  assert.match(shellSource, /aria-label="Dashboard 메뉴 열기"/);
  assert.match(shellSource, /aria-label="Dashboard 메뉴 닫기"/);
  assert.match(shellSource, /logout/);
});

test("dashboard navigation uses the requested Korean menu labels", () => {
  assert.match(shellSource, /label: "작업 현황"/);
  assert.match(shellSource, /label: "내 프로젝트"/);
  assert.match(shellSource, /label: "탬플릿"/);
  assert.match(shellSource, /label: "비용 관리"/);
  assert.match(shellSource, /label: "설정"/);
});

test("dashboard overview omits redundant English headings and secondary filler copy", () => {
  assert.doesNotMatch(overviewSource, /Operations overview/);
  assert.doesNotMatch(overviewSource, /Practice Architecture와 Deployment 상태를 한곳에서 확인합니다/);
  assert.doesNotMatch(overviewSource, />Recently updated<|>Deployment activity<|>Connections</);
  assert.doesNotMatch(overviewSource, /전체 프로젝트|fallback 추정|검증된 Role과 활성 Repository/);
  assert.doesNotMatch(overviewSource, /설명 없음/);
});

test("dashboard overview does not render the external connections band", () => {
  assert.doesNotMatch(overviewSource, /dashboardConnectionBand|connections-title|외부 연결/);
});

function readLocalFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}
