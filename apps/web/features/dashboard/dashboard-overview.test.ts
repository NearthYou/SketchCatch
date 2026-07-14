import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const overviewSource = `${readLocalFile("./dashboard-overview.tsx")}\n${readLocalFile("./dashboard-overview-data.ts")}`;
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

function readLocalFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}
